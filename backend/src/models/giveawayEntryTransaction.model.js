/**
 * GiveawayEntryTransaction — the append-only entry-fee ledger.
 *
 * Spec coverage: userId, giveawayId, prizeId, currency, amount, transaction type,
 * status (PENDING | SUCCESS | FAILED | REVERSED), balanceBefore, balanceAfter,
 * transactionId, idempotency key/reference and timestamps.
 *
 * THE two invariants this collection exists to guarantee:
 *  1. NO DOUBLE CHARGE — `idempotencyKey` carries a database-level UNIQUE index,
 *     so a replayed submit cannot create a second charge, even across processes.
 *  2. NO LOST / REWRITTEN HISTORY — a completed charge is never edited into a
 *     refund and never deleted. Cancelling a charge writes a NEW compensating
 *     REVERSAL row (see `reverse()`), which is only allowed when business policy
 *     authorizes it (the caller must supply an authorizing actor + reason).
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { jsonOptions, objectOptions, blockDelete, immutableOnce, withSeedMarker } = require('../utils/schema.js');
const {
  CURRENCIES,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE,
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS,
  TRANSACTION_TERMINAL_STATUSES,
  WALLET_SOURCE,
} = require('../config/constants.js');

const DIRECTION = Object.freeze({ DEBIT: 'DEBIT', CREDIT: 'CREDIT' });

/** Allowed status moves. Anything else is a bug or an attempted rewrite. */
const STATUS_TRANSITIONS = Object.freeze({
  [TRANSACTION_STATUS.PENDING]: [TRANSACTION_STATUS.SUCCESS, TRANSACTION_STATUS.FAILED],
  [TRANSACTION_STATUS.SUCCESS]: [TRANSACTION_STATUS.REVERSED],
  [TRANSACTION_STATUS.FAILED]: [],
  [TRANSACTION_STATUS.REVERSED]: [],
});

const entryTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    giveawayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Giveaway', required: true },
    prizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prize', default: null },
    participationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayParticipation', default: null },

    currency: { type: String, enum: CURRENCIES, required: true },
    /** Always a positive magnitude; the sign is expressed by `direction`. */
    amount: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: Object.values(DIRECTION), required: true },

    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    status: { type: String, enum: TRANSACTION_STATUSES, default: TRANSACTION_STATUS.PENDING, index: true },

    /** Balance snapshot returned by the wallet provider. Null when the provider
     *  did not return one — never fabricated. */
    balanceBefore: { type: Number, min: 0, default: null },
    balanceAfter: { type: Number, min: 0, default: null },

    /** Our own stable ID + the provider's transaction reference. */
    transactionId: { type: String, required: true, unique: true, default: () => `txn_${crypto.randomUUID()}` },
    externalTransactionId: { type: String, trim: true, default: null },
    /** Anti-double-charge key. UNIQUE at the database level. */
    idempotencyKey: { type: String, required: true, trim: true },

    /** The charge this row compensates (REFUND / REVERSAL only). */
    sourceTxnId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayEntryTransaction', default: null },

    walletSource: { type: String, enum: Object.values(WALLET_SOURCE), default: WALLET_SOURCE.VELOOP_API },
    entriesGranted: { type: Number, min: 0, default: 0 },
    failureReason: { type: String, trim: true, maxlength: 300 }, // codes/text only, never PII
    authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authorizationNote: { type: String, trim: true, maxlength: 500 },
    completedAt: { type: Date, default: null },
    /** Low-sensitivity operational context only — deliberately typed, because an
     *  open Mixed bag is how request bodies (and therefore PII) leak into ledgers. */
    sourceEndpoint: { type: String, trim: true, maxlength: 120 },
    clientClass: { type: String, trim: true, maxlength: 60 },
    requestId: { type: String, trim: true },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
entryTransactionSchema.pre('validate', function validateShape(next) {
  // A new row may only be born SUCCESS when the provider confirmed it.
  if (this.isNew && this.status === TRANSACTION_STATUS.SUCCESS) {
    if (!this.externalTransactionId && this.walletSource === WALLET_SOURCE.VELOOP_API) {
      this.invalidate('externalTransactionId', 'A SUCCESS charge needs the provider transaction reference.');
    }
    if (typeof this.balanceBefore === 'number' && typeof this.balanceAfter !== 'number') {
      this.invalidate('balanceAfter', 'A settled charge must record the resulting balance.');
    }
  }

  const compensates = this.type === TRANSACTION_TYPE.REVERSAL || this.type === TRANSACTION_TYPE.REFUND;
  if (compensates && !this.sourceTxnId) {
    this.invalidate('sourceTxnId', `${this.type} rows must reference the original charge.`);
  }
  if (compensates && this.direction !== DIRECTION.CREDIT) {
    this.invalidate('direction', `${this.type} must be a CREDIT.`);
  }
  if (!compensates && this.type === TRANSACTION_TYPE.ENTRY_FEE && this.direction !== DIRECTION.DEBIT) {
    this.invalidate('direction', 'An ENTRY_FEE must be a DEBIT.');
  }

  // Balance arithmetic must be internally consistent — this is what makes the
  // ledger auditable without trusting the wallet provider's wording.
  if (typeof this.balanceBefore === 'number' && typeof this.balanceAfter === 'number') {
    const expected = this.direction === DIRECTION.DEBIT
      ? this.balanceBefore - this.amount
      : this.balanceBefore + this.amount;
    if (Math.abs(expected - this.balanceAfter) > 1e-9) {
      this.invalidate('balanceAfter', `Balance does not reconcile: ${this.balanceBefore} ${this.direction} ${this.amount} != ${this.balanceAfter}.`);
    }
  }
  next();
});

/** Remember the persisted status so a saved row cannot be re-labelled. */
const ORIGINAL_STATUS = Symbol('veloop.txn.originalStatus');
const rememberStatus = function rememberStatus(doc) {
  Object.defineProperty(doc, ORIGINAL_STATUS, {
    value: doc.status,
    enumerable: false,
    configurable: true,
    writable: true,
  });
};
entryTransactionSchema.post('init', rememberStatus);
entryTransactionSchema.post('save', rememberStatus);

entryTransactionSchema.pre('validate', function validateTransition(next) {
  if (this.isNew || !this.isModified('status')) return next();
  const from = this[ORIGINAL_STATUS];
  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(this.status)) {
    this.invalidate('status', `Illegal ledger transition ${from} -> ${this.status}. Write a compensating row instead.`);
  }
  next();
});

entryTransactionSchema.pre('save', function stampCompletion(next) {
  if (this.isModified('status')) {
    if (this.status === TRANSACTION_STATUS.SUCCESS || this.status === TRANSACTION_STATUS.FAILED) {
      this.completedAt = this.completedAt || new Date();
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// Behaviour used by the entry / refund services
// ---------------------------------------------------------------------------
entryTransactionSchema.statics.DIRECTION = DIRECTION;
entryTransactionSchema.statics.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
entryTransactionSchema.statics.TERMINAL_STATUSES = TRANSACTION_TERMINAL_STATUSES;

/** A deterministic key for the compensating row of a given charge. */
entryTransactionSchema.statics.reversalKeyFor = function reversalKeyFor(sourceTxnId) {
  return `reversal:${String(sourceTxnId)}`;
};

/**
 * Writes the compensating REVERSAL for a settled charge. Requires an authorizing
 * actor + reason so the policy decision is auditable, and refuses a second
 * reversal through the unique reversalKey index (a refund can never be issued
 * twice).
 *
 * Honesty rule: the reversal is only recorded as SUCCESS when the caller passes
 * the provider's credit reference (`externalTransactionId`); otherwise it is
 * created PENDING and the original stays SUCCESS until the credit lands.
 */
entryTransactionSchema.statics.reverse = async function reverse(
  sourceTxnId,
  { authorizedBy, reason, externalTransactionId, balanceBefore, balanceAfter, note } = {},
) {
  const Model = this;
  if (!authorizedBy || !reason) {
    const err = new Error('REVERSAL_UNAUTHORIZED: an authorizing actor and reason are required.');
    err.code = 'REVERSAL_UNAUTHORIZED';
    throw err;
  }
  const original = await Model.findById(sourceTxnId);
  if (!original) {
    const err = new Error('REVERSAL_NOT_FOUND: the original charge does not exist.');
    err.code = 'REVERSAL_NOT_FOUND';
    throw err;
  }
  if (original.status !== TRANSACTION_STATUS.SUCCESS) {
    const err = new Error(`REVERSAL_STATE: only a SUCCESS charge can be reversed (found ${original.status}).`);
    err.code = 'REVERSAL_STATE';
    throw err;
  }

  const settled = Boolean(externalTransactionId);
  const compensating = await Model.create({
    userId: original.userId,
    giveawayId: original.giveawayId,
    prizeId: original.prizeId || null,
    participationId: original.participationId || null,
    currency: original.currency,
    amount: original.amount,
    direction: DIRECTION.CREDIT,
    type: TRANSACTION_TYPE.REVERSAL,
    status: settled ? TRANSACTION_STATUS.SUCCESS : TRANSACTION_STATUS.PENDING,
    externalTransactionId: externalTransactionId || null,
    balanceBefore: typeof balanceBefore === 'number' ? balanceBefore : null,
    balanceAfter: typeof balanceAfter === 'number' ? balanceAfter : null,
    transactionId: `rev_${original.transactionId}`,
    idempotencyKey: Model.reversalKeyFor(original._id),
    sourceTxnId: original._id,
    walletSource: original.walletSource,
    entriesGranted: 0,
    authorizedBy,
    authorizationNote: note ? String(note).slice(0, 500) : String(reason).slice(0, 500),
    requestId: original.requestId,
  });

  if (settled) {
    original.status = TRANSACTION_STATUS.REVERSED;
    original.authorizedBy = authorizedBy;
    await original.save();
  }

  return compensating;
};

// ---------------------------------------------------------------------------
// Immutability + deletion policy
// ---------------------------------------------------------------------------
immutableOnce(entryTransactionSchema, {
  paths: ['userId', 'giveawayId', 'prizeId', 'currency', 'amount', 'direction', 'type', 'idempotencyKey', 'transactionId'],
  isTerminal: (doc) => TRANSACTION_TERMINAL_STATUSES.includes(doc.status),
  label: 'ledger',
});

// The ledger is append-only: deletes are refused (dev/reset scripts must opt in).
blockDelete(entryTransactionSchema, { label: 'entry-transaction' });

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
entryTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
// One provider reference can only ever land once.
entryTransactionSchema.index(
  { externalTransactionId: 1 },
  { unique: true, partialFilterExpression: { externalTransactionId: { $type: 'string' } } },
);
// Only one compensating row per original charge.
entryTransactionSchema.index(
  { sourceTxnId: 1 },
  { unique: true, partialFilterExpression: { type: TRANSACTION_TYPE.REVERSAL } },
);
entryTransactionSchema.index({ userId: 1, createdAt: -1 });
entryTransactionSchema.index({ giveawayId: 1, status: 1 });
// Reconciliation sweeper: stuck PENDING rows.
entryTransactionSchema.index({ status: 1, createdAt: 1 });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(entryTransactionSchema);

module.exports = mongoose.model('GiveawayEntryTransaction', entryTransactionSchema);
