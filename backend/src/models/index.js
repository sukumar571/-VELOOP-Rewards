/**
 * Models barrel — importing this registers every schema on the shared mongoose
 * connection. Requiring it during tests validates that all schemas compile
 * without needing a live database.
 *
 * Relationship map (all references are ObjectIds; `ref` names are the model
 * names below):
 *
 *   User ──1:N──> GiveawayParticipation <──N:1── Giveaway ──1:N──> Prize
 *     │                    │              (slug unique)                │
 *     │                    ▼                                          1:N
 *     │            GiveawayEntryTransaction (append-only ledger)   GiveawayWinner
 *     │                    │                                          1:1 │
 *     └──1:N──> WalletReference (cache of the external VELOOP wallet)     ▼
 *                                                                    PrizeClaim
 *   Cross-cutting evidence: FraudEvent (hashes only), AuditLog (append-only)
 */
const User = require('./user.model.js');
const Giveaway = require('./giveaway.model.js');
const Prize = require('./prize.model.js');
const GiveawayParticipation = require('./giveawayParticipation.model.js');
const GiveawayEntryTransaction = require('./giveawayEntryTransaction.model.js');
const GiveawayWinner = require('./giveawayWinner.model.js');
const PrizeClaim = require('./prizeClaim.model.js');
const FraudEvent = require('./fraudEvent.model.js');
const WalletReference = require('./walletReference.model.js');
const DevWalletBalance = require('./devWalletBalance.model.js');
const IdempotencyKey = require('./idempotencyKey.model.js');
const AuditLog = require('./auditLog.model.js');

module.exports = {
  User,
  Giveaway,
  Prize,
  GiveawayParticipation,
  GiveawayEntryTransaction,
  GiveawayWinner,
  PrizeClaim,
  FraudEvent,
  WalletReference,
  DevWalletBalance,
  IdempotencyKey,
  AuditLog,
};
