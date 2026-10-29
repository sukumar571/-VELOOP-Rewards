/**
 * GiveawayWinner — one slot in the result of a draw.
 *
 * Spec coverage: giveawayId, prizeId, userId, selection metadata, publication
 * status and timestamps.
 *
 * Two rules are enforced IN THE DATABASE:
 *  - "valid winner counts": `rank` is unique per prize and must be <= the prize's
 *    configured winnerCount, so a prize can never gain more winners than it has
 *    slots (async pre-validate check + unique index on (prizeId, rank)).
 *  - "no duplicate winners for the same prize": unique on (prizeId, userId),
 *    applied as a PARTIAL index so it can be explicitly relaxed per giveaway via
 *    Giveaway.prizeConfig.allowDuplicateWinners (mirrored onto the row as
 *    `duplicateAllowed` at draw time — the only way a static index can honour a
 *    config-driven exception).
 *
 * Only `displayInfo` is ever public, and it must contain masked data only.
 */
const mongoose = require('mongoose');
const { jsonOptions, objectOptions, blockDelete, immutableOnce, withSeedMarker } = require('../utils/schema.js');
const {
  WINNER_ANNOUNCEMENT_STATUS,
  WINNER_ANNOUNCEMENT_STATUSES,
  WINNER_VERIFICATION_STATUS,
  PRIZE_TYPES,
} = require('../config/constants.js');

/** Reproducible provenance for the draw — never the raw candidate list. */
const selectionSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['RANDOM', 'WEIGHTED_BY_ENTRIES'], required: true },
    algorithmVersion: { type: String, trim: true, default: 'draw-v0' },
    /** Hash of the entry snapshot the draw ran over (proves WHICH snapshot). */
    snapshotHash: { type: String, trim: true },
    seedHash: { type: String, trim: true }, // the RNG seed is never stored raw
    candidateCount: { type: Number, min: 0 },
    entryCount: { type: Number, min: 0 },
    ticketRange: { type: String, trim: true }, // e.g. "0412-0412" for auditability
    drawnAt: { type: Date },
    drawnBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestId: { type: String, trim: true },
  },
  { _id: false },
);

const winnerSchema = new mongoose.Schema(
  {
    giveawayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Giveaway', required: true },
    prizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prize', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiveawayParticipation', default: null },

    /** 1-based slot within the prize tier. */
    rank: { type: Number, required: true, min: 1 },

    selection: { type: selectionSchema, default: () => ({}) },

    announcementStatus: {
      type: String,
      enum: WINNER_ANNOUNCEMENT_STATUSES,
      default: WINNER_ANNOUNCEMENT_STATUS.HOLD,
      index: true,
    },
    announcedAt: { type: Date, default: null },
    privateNotifiedAt: { type: Date, default: null },
    verificationStatus: {
      type: String,
      enum: Object.values(WINNER_VERIFICATION_STATUS),
      default: WINNER_VERIFICATION_STATUS.PENDING,
    },
    disqualifiedReason: { type: String, trim: true, maxlength: 300 },

    /** The ONLY public winner payload. Masked values only — validated below. */
    displayInfo: {
      maskedUserId: { type: String, trim: true },
      displayAlias: { type: String, trim: true },
    },

    /** Copy of the tier at draw time, so history survives later edits. */
    prizeSnapshot: {
      name: { type: String, trim: true },
      prizeType: { type: String, enum: PRIZE_TYPES },
      claimType: { type: String },
      imageRef: { type: String, trim: true },
    },

    /** Mirrors Giveaway.prizeConfig.allowDuplicateWinners at draw time. */
    duplicateAllowed: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: jsonOptions(), toObject: objectOptions() },
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const PUBLIC_ID_PATTERNS = [
  /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, // email
  /^\+?\d[\d\s-]{7,}$/, // phone
];

winnerSchema.pre('validate', function validateDisplay(next) {
  const values = Object.values(this.displayInfo || {});
  for (const v of values) {
    if (typeof v === 'string' && PUBLIC_ID_PATTERNS.some((re) => re.test(v.trim()))) {
      this.invalidate('displayInfo', 'Winner displayInfo must be masked — emails/phone numbers are never public.');
    }
  }
  next();
});

/** Publication requires a public-safe masked identity. */
winnerSchema.pre('validate', function validatePublication(next) {
  if (
    this.announcementStatus === WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED &&
    (!this.displayInfo || (!this.displayInfo.maskedUserId && !this.displayInfo.displayAlias))
  ) {
    this.invalidate('displayInfo', 'Masked display info is required before a winner can be announced.');
  }
  next();
});

winnerSchema.pre('save', function stampAnnouncement(next) {
  if (this.announcementStatus === WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED) {
    this.announcedAt = this.announcedAt || new Date();
  }
  next();
});

/** Publication is one-way: an announced winner cannot be silently un-announced. */
const ORIGINAL_ANNOUNCEMENT = Symbol('veloop.winner.originalAnnouncement');
const remember = function remember(doc) {
  Object.defineProperty(doc, ORIGINAL_ANNOUNCEMENT, {
    value: doc.announcementStatus,
    enumerable: false,
    configurable: true,
    writable: true,
  });
};
winnerSchema.post('init', remember);
winnerSchema.post('save', remember);

winnerSchema.pre('validate', function validatePublicationMove(next) {
  if (this.isNew || !this.isModified('announcementStatus')) return next();
  if (this[ORIGINAL_ANNOUNCEMENT] === WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED) {
    this.invalidate('announcementStatus', 'An announced winner cannot be reverted; disqualify instead.');
  }
  next();
});

/**
 * Enforces "valid winner counts" against the prize's configured slots.
 * Needs one read, so it only runs when a connection exists (the model index test
 * suite exercises it against a real in-memory MongoDB).
 *
 * Registered LAST on purpose: the cheap synchronous rules above must still run
 * under `validateSync()`, where mongoose stops walking the hook chain as soon as
 * it meets a promise-based hook. `save()` always runs the full chain.
 */
winnerSchema.pre('validate', async function validateCapacity() {
  const connected = mongoose.connection.readyState === 1;
  if (!connected || !this.isModified('rank')) return;
  const Prize = mongoose.model('Prize');
  const prize = await Prize.findById(this.prizeId).lean();
  if (!prize) {
    this.invalidate('prizeId', 'Winner references a prize that does not exist.');
    return;
  }
  if (String(prize.giveawayId) !== String(this.giveawayId)) {
    this.invalidate('prizeId', 'Winner prize belongs to a different giveaway.');
    return;
  }
  if (this.rank > prize.winnerCount) {
    this.invalidate('rank', `Prize "${prize.name}" has ${prize.winnerCount} winner slot(s); rank ${this.rank} exceeds capacity.`);
  }
});

/** A winner row must come from a real participation of the same event. */
winnerSchema.pre('validate', async function validateParticipation() {
  const connected = mongoose.connection.readyState === 1;
  if (!connected || !this.participationId) return;
  const Participation = mongoose.model('GiveawayParticipation');
  const p = await Participation.findById(this.participationId).lean();
  if (!p || String(p.giveawayId) !== String(this.giveawayId) || String(p.userId) !== String(this.userId)) {
    this.invalidate('participationId', 'Winner must reference that user\'s participation in this giveaway.');
  }
});

// ---------------------------------------------------------------------------
// Safe read helpers (server-side projection, not trust-the-client filtering)
// ---------------------------------------------------------------------------
/** Public list for a giveaway: announced winners only, masked fields only. */
winnerSchema.statics.findPublic = function findPublic(giveawayId) {
  return this.find({ giveawayId, announcementStatus: WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED })
    .select('rank prizeId prizeSnapshot.name prizeSnapshot.prizeType displayInfo announcedAt')
    .sort({ rank: 1 })
    .lean();
};

/** How many slots are already taken for a prize tier. */
winnerSchema.statics.countForPrize = function countForPrize(prizeId) {
  return this.countDocuments({ prizeId });
};

// ---------------------------------------------------------------------------
// Immutability + deletion policy
// ---------------------------------------------------------------------------
immutableOnce(winnerSchema, {
  paths: ['giveawayId', 'prizeId', 'userId', 'rank', 'selection'],
  isTerminal: (doc) =>
    doc.announcementStatus === WINNER_ANNOUNCEMENT_STATUS.ANNOUNCED ||
    doc.verificationStatus === WINNER_VERIFICATION_STATUS.VERIFIED,
  label: 'winner',
});

blockDelete(winnerSchema, { label: 'winner' });

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
/** Slot capacity: rank is unique within a prize and validated <= winnerCount. */
winnerSchema.index({ prizeId: 1, rank: 1 }, { unique: true });
/**
 * No duplicate winner for the same prize — unless the draw explicitly allowed it.
 * `duplicateAllowed` defaults to false on every row, so an equality partial
 * filter covers exactly the rows that must stay unique and skips the ones an
 * operator opted into. (MongoDB does not accept `$ne` in a partialFilterExpression.)
 */
winnerSchema.index({ prizeId: 1, userId: 1 }, { unique: true, partialFilterExpression: { duplicateAllowed: false } });
winnerSchema.index({ giveawayId: 1, announcementStatus: 1, rank: 1 });
winnerSchema.index({ userId: 1, createdAt: -1 }); // "my wins"
winnerSchema.index({ giveawayId: 1, userId: 1 });

/** Written by the dev seed only; null on every real record. */
withSeedMarker(winnerSchema);

module.exports = mongoose.model('GiveawayWinner', winnerSchema);
