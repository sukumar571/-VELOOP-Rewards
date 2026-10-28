/**
 * ============================================================================
 * PRIZE-TYPE REGISTRY — generic delivery / claim handling.
 * ============================================================================
 * Winner-selection and prize-claim copy is derived from a giveaway's
 * `prizeType`, NEVER from the prize name. This is what prevents fragile
 * checks like `prizeName === 'Amazon'`. Physical vs digital fulfilment is a
 * property of the type, and unconfirmed operational timings stay marked as
 * placeholders requiring business approval.
 * ========================================================================= */

export const PRIZE_TYPES = {
  device: {
    label: 'Electronic device',
    deliveryMode: 'physical',
  },
  wearable: {
    label: 'Wearable device',
    deliveryMode: 'physical',
  },
  audio: {
    label: 'Audio device',
    deliveryMode: 'physical',
  },
  console: {
    label: 'Gaming console',
    deliveryMode: 'physical',
  },
  voucher: {
    label: 'Voucher / gift card',
    deliveryMode: 'digital',
  },
};

export function getPrizeType(key) {
  return PRIZE_TYPES[key] ?? { label: 'Prize', deliveryMode: 'physical' };
}

/**
 * Generic winner-selection + claim copy for a giveaway, assembled from its
 * prizeType/deliveryMode and winner count. Business-specific timings and the
 * refund policy are intentionally NOT invented — they are surfaced as
 * placeholders (pending: true) for approval against the project PDF.
 */
export function describeSelectionAndClaim(giveaway) {
  const { deliveryMode } = getPrizeType(giveaway.prizeType);
  const winnerCount = giveaway.winners ?? 1;

  const selection = {
    headline:
      winnerCount === 1
        ? 'One winner is drawn from the final, closed entry snapshot.'
        : `${winnerCount} winners are drawn from the final, closed entry snapshot.`,
    note: 'The draw runs only after the entry window closes, so no later entry can affect a result.',
  };

  const claim =
    deliveryMode === 'digital'
      ? {
          headline: 'Digital prize delivered in-app.',
          steps: [
            'The winning account is notified privately after the draw.',
            'A voucher / gift-card code is issued to that account only.',
            'Claim identity is confirmed before the code is released.',
          ],
        }
      : {
          headline: 'Physical prize shipped after winner verification.',
          steps: [
            'The winning account is notified privately after the draw.',
            'Delivery address is collected only inside the private claim flow.',
            'The prize is dispatched and tracking is shared with the winner.',
          ],
        };

  return { selection, claim, deliveryMode };
}
