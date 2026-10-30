/**
 * ============================================================================
 * CLAIM LEDGER MOCK — explicitly FICTIONAL, development-only (DEMO_DATA=true).
 * ============================================================================
 * This is the *internal, private* server-side table that links a winner record
 * to the account that must claim it. It is the counterpart to winners.mock.js:
 * the public winner list only ever shows masked IDs, while this ledger (which a
 * real backend would guard behind authentication) carries the internal userId,
 * the claim deadline and the claim status.
 *
 * It is keyed to the ORIGINAL giveaway of each ended draw and NEVER overwrites
 * winners.mock history — it only adds claim metadata on top of existing winner
 * ids. The current demo member (usr-demo-001) is made the winner of some draws
 * purely so the personalized claim experience can be demonstrated in the UI.
 *
 * Scenario coverage (all fictional):
 *   gv-009 PlayStation 5 (physical) → demo user, NOT_SUBMITTED, open  → claimable
 *   gv-010 Sony headphones (physical) → ANOTHER account, COMPLETED     → non-winner
 *   gv-011 Swiggy voucher (digital)   → demo user, deadline passed     → EXPIRED
 * ========================================================================= */

export const DEMO_DATA = true;

const DAY = 86_400_000;
const loadTime = Date.now();

/**
 * winnerId links back to the public record in winners.mock.js (association kept,
 * never overwritten). userId is the private account that owns the claim.
 */
export const CLAIM_RECORDS = [
  {
    giveawayId: 'gv-009',
    winnerId: 'wn-001',
    userId: 'usr-demo-001',
    status: 'NOT_SUBMITTED',
    deadline: loadTime + 7 * DAY,
  },
  {
    giveawayId: 'gv-010',
    winnerId: 'wn-002',
    userId: 'usr-other-5521', // another member — the demo user must NOT access this
    status: 'COMPLETED',
    deadline: loadTime + 7 * DAY,
  },
  {
    giveawayId: 'gv-011',
    winnerId: 'wn-003',
    userId: 'usr-demo-001',
    status: 'NOT_SUBMITTED',
    deadline: loadTime - 2 * DAY, // already past → service derives EXPIRED
  },
];
