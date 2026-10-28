/**
 * ============================================================================
 * HOW-IT-WORKS TIMELINE — generated from real giveaway + currency data.
 * ============================================================================
 * Every step is derived from configuration (entry currency/fee, close time,
 * prize-type fulfilment) rather than hand-written per prize, so a new giveaway
 * gets a correct timeline automatically. Operational specifics that are NOT
 * confirmed by the project PDF (payout windows, refund rules) are deliberately
 * left out rather than invented.
 * ========================================================================= */
import { getCurrency } from './currencies.js';
import { getPrizeType } from './prizeTypes.js';
import { formatDate } from '../utils/format.js';

export function getHowItWorksSteps(giveaway) {
  const currency = getCurrency(giveaway.entry?.currency);
  const { deliveryMode } = getPrizeType(giveaway.prizeType);

  return [
    {
      title: 'Sign in to your VELOOP account',
      text: 'Entry is tied to a single verified account, so you must be signed in to take part.',
    },
    {
      title: `Confirm your ${currency.label} balance`,
      text: `Each entry costs ${giveaway.entry?.amount?.toLocaleString?.('en-IN') ?? giveaway.entry?.amount} ${currency.label}. You can join only while your ${currency.label} balance covers the fee.`,
    },
    {
      title: 'Review and confirm the entry fee',
      text: 'Joining always asks for an explicit confirmation showing the exact prize, currency and fee before anything is charged.',
    },
    {
      title: 'Entries close on the deadline',
      text: `The entry window ends ${formatDate(giveaway.endsAt)}. No entry after that time is counted or can affect the draw.`,
    },
    {
      title: 'Winners drawn after close',
      text: `The draw runs on the final, closed snapshot and selects ${giveaway.winners ?? 1} winner${(giveaway.winners ?? 1) > 1 ? 's' : ''}.`,
    },
    {
      title:
        deliveryMode === 'digital'
          ? 'Winners receive their code in-app'
          : 'Winners verify details, then the prize ships',
      text:
        deliveryMode === 'digital'
          ? 'Winners are notified privately and issued their voucher code inside the app.'
          : 'Winners are notified privately, confirm delivery details in the private claim flow, and the prize is dispatched.',
    },
  ];
}
