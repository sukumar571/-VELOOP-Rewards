/**
 * ============================================================================
 * GIVEAWAY MOCK DATA — explicitly FICTIONAL development data (DEMO_DATA=true).
 * ============================================================================
 * NOT live activity. This module is the ONLY source of giveaway content in the
 * UI; all pages read it through src/services/giveawayService.js (swapped to
 * /api/v1 HTTP calls unchanged at integration — docs/PLAN.md — D).
 *
 * ENTRY FEES below are the authoritative figures from the project
 * specification (single currency per prize). They are consumed as structured
 * `entry: { currency, amount }` config — never hard-coded in a component and
 * never keyed off the prize name. The client and the UI display these values,
 * but the participation API (sessionService) re-reads them server-side and is
 * the only authority when a join is actually charged.
 * ========================================================================= */
import { MS } from '../utils/format.js';

export const DEMO_DATA = true;

const loadTime = Date.now();

export const GIVEAWAYS = [
  {
    id: 'gv-001',
    slug: 'iphone-15-pro',
    title: 'iPhone 15 Pro',
    tagline: 'iPhone 15 Pro · 128 GB · Titanium finish',
    icon: 'Smartphone',
    assetKey: 'iphone-15-pro',
    accent: 'violet',
    prizeType: 'device',
    startsAt: loadTime - 3 * MS.DAY,
    endsAt: loadTime + 12 * MS.DAY + 8 * MS.HOUR + 58 * MS.MIN,
    participants: 2300,
    winners: 1,
    // Spec: iPhone 15 Pro — VEs — 250
    entry: { currency: 'VE', amount: 250 },
    maxEntries: 10,
    description:
      'Our flagship draw of the season. One participant wins a brand-new iPhone 15 Pro (128 GB). Every entry is a fair, audited chance — winners are drawn from the closed entry snapshot.',
    rules: [
      'One winner selected from all confirmed entries after the entry window closes.',
      'Entry costs 250 VEs per entry, charged at entry time.',
      'A per-account entry cap applies for this draw.',
      'Winners are announced publicly and contacted through the private claim flow.',
    ],
  },
  {
    id: 'gv-002',
    slug: 'apple-watch-series-9',
    title: 'Apple Watch Series 9',
    tagline: 'Apple Watch Series 9 · GPS · 45 mm',
    icon: 'Watch',
    assetKey: 'apple-watch-series-9',
    accent: 'blue',
    prizeType: 'wearable',
    startsAt: loadTime - 6 * MS.DAY,
    endsAt: loadTime + 9 * MS.DAY + 6 * MS.HOUR + 30 * MS.MIN,
    participants: 1800,
    winners: 1,
    // Spec: Apple Watch — VEs — 200
    entry: { currency: 'VE', amount: 200 },
    maxEntries: 10,
    description:
      'Track every beat of the win. Enter for a chance to win the Apple Watch Series 9 with a sport band of your choice at claim time.',
    rules: [
      'One winner drawn after entries close.',
      'Entry costs 200 VEs per entry, charged at entry time.',
      'Duplicate idempotent submissions are charged exactly once.',
    ],
  },
  {
    id: 'gv-003',
    slug: 'airpods-pro-2',
    title: 'AirPods Pro 2',
    tagline: 'AirPods Pro 2 with MagSafe charging case',
    icon: 'Headphones',
    assetKey: 'airpods-pro-2',
    accent: 'violet',
    prizeType: 'audio',
    startsAt: loadTime - 9 * MS.DAY,
    endsAt: loadTime + 7 * MS.DAY + 8 * MS.HOUR + 20 * MS.MIN,
    participants: 3000,
    winners: 2,
    // Spec: AirPods — SVEs — 500
    entry: { currency: 'SVE', amount: 500 },
    maxEntries: 8,
    description:
      'Two winners, twice the chance. The most popular audio draw on VELOOP Rewards — this one is entered with SVEs.',
    rules: [
      'Two winners drawn from the closed entry snapshot.',
      'Entry costs 500 SVEs per entry, charged at entry time.',
      'Each participant may hold multiple entries where the cap allows.',
    ],
  },
  {
    id: 'gv-004',
    slug: 'amazon-voucher-2000',
    title: '₹2,000 Amazon Voucher',
    tagline: '₹2,000 Amazon pay gift voucher',
    icon: 'Gift',
    assetKey: 'amazon-voucher-2000',
    accent: 'gold',
    prizeType: 'voucher',
    startsAt: loadTime - 11 * MS.DAY,
    endsAt: loadTime + 2 * MS.DAY + 2 * MS.HOUR + 5 * MS.MIN,
    participants: 13000,
    winners: 1,
    // Spec: ₹2,000 Amazon voucher — VEs — 500
    entry: { currency: 'VE', amount: 500 },
    maxEntries: 5,
    description:
      'Closing soon — a ₹2,000 Amazon voucher, delivered digitally to the winner. The entry window for this draw ends in days.',
    rules: [
      'One winner; the draw runs immediately after entries close.',
      'Entry costs 500 VEs per entry, charged at entry time.',
      'The voucher code is delivered digitally inside the claim flow.',
    ],
  },
  {
    id: 'gv-005',
    slug: 'amazon-voucher-500',
    title: '₹500 Amazon Voucher',
    tagline: '₹500 Amazon pay gift voucher',
    icon: 'Gift',
    assetKey: 'amazon-voucher-500',
    accent: 'gold',
    prizeType: 'voucher',
    startsAt: loadTime - 2 * MS.DAY,
    endsAt: loadTime + 15 * MS.DAY,
    participants: 6800,
    winners: 4,
    // Spec: ₹500 Amazon voucher — VEs — 300
    entry: { currency: 'VE', amount: 300 },
    maxEntries: 6,
    description:
      'Four winners, ₹500 each. A quick, low-cost entry into one of our most-used voucher draws — paid in VEs.',
    rules: [
      'Four winners drawn from the closed entry snapshot.',
      'Entry costs 300 VEs per entry, charged at entry time.',
      'Voucher codes are delivered digitally within the claim window.',
    ],
  },
  {
    id: 'gv-006',
    slug: 'voucher-20',
    title: '₹20 Voucher',
    tagline: '₹20 quick-redeem voucher · micro draw',
    icon: 'Gift',
    assetKey: 'voucher-20',
    accent: 'blue',
    prizeType: 'voucher',
    startsAt: loadTime - 1 * MS.DAY,
    endsAt: loadTime + 4 * MS.DAY,
    participants: 21000,
    winners: 50,
    // Spec: ₹20 voucher — Tokens — 2,000
    entry: { currency: 'TOKEN', amount: 2000 },
    maxEntries: 20,
    description:
      'Our highest-volume micro draw — 50 winners. Enter with Reward Tokens for a ₹20 voucher, redeemed instantly in-app.',
    rules: [
      'Fifty winners drawn from the closed entry snapshot.',
      'Entry costs 2,000 Tokens per entry, charged at entry time.',
      'Voucher is credited to the winner account digitally.',
    ],
  },
  {
    id: 'gv-007',
    slug: 'flipkart-voucher',
    title: 'Flipkart Voucher',
    tagline: '₹10,000 Flipkart shopping voucher',
    icon: 'ShoppingBag',
    assetKey: 'flipkart-voucher',
    accent: 'blue',
    prizeType: 'voucher',
    startsAt: loadTime - 4 * MS.DAY,
    endsAt: loadTime + 6 * MS.DAY + 12 * MS.HOUR,
    participants: 5400,
    winners: 3,
    entry: { currency: 'VE', amount: 400 },
    maxEntries: 5,
    description:
      'Three winners, ten thousand rupees each. Spend it your way across millions of products on Flipkart.',
    rules: [
      'Three winners drawn from the closed entry snapshot.',
      'Entry costs 400 VEs per entry, charged at entry time.',
      'Voucher codes are delivered digitally within the claim window.',
    ],
  },
  {
    id: 'gv-008',
    slug: 'uber-voucher',
    title: 'Uber Voucher',
    tagline: '$50 Uber travel voucher',
    icon: 'CarFront',
    assetKey: 'uber-voucher',
    accent: 'violet',
    prizeType: 'voucher',
    startsAt: loadTime + 2 * MS.DAY,
    endsAt: loadTime + 14 * MS.DAY,
    participants: 0,
    winners: 1,
    entry: { currency: 'VE', amount: 250 },
    maxEntries: 5,
    description:
      'Opening soon. Rides on us — one winner takes a $50 Uber voucher. Set your reminder and be first in line.',
    rules: [
      'Entries open at the scheduled start time.',
      'One winner drawn after entries close.',
    ],
  },
  {
    id: 'gv-009',
    slug: 'playstation-5',
    title: 'PlayStation 5 Slim',
    tagline: 'PS5 Slim console + DualSense controller',
    icon: 'Gamepad2',
    assetKey: 'playstation-5',
    accent: 'violet',
    prizeType: 'console',
    startsAt: loadTime - 25 * MS.DAY,
    endsAt: loadTime - 5 * MS.DAY,
    participants: 8700,
    winners: 1,
    entry: { currency: 'VE', amount: 300 },
    maxEntries: 5,
    description:
      'Completed draw. The published winner is shown on the winner wall and the prize is in the claim flow.',
    rules: [
      'Draw completed from the closed entry snapshot.',
      'Winner announced publicly; prize delivered through the claim flow.',
    ],
  },
  {
    id: 'gv-010',
    slug: 'sony-headphones',
    title: 'Sony WH-1000XM5',
    tagline: 'Industry-leading noise-cancelling headphones',
    icon: 'Headphones',
    assetKey: 'sony-headphones',
    accent: 'gold',
    prizeType: 'audio',
    startsAt: loadTime - 40 * MS.DAY,
    endsAt: loadTime - 20 * MS.DAY,
    participants: 6100,
    winners: 1,
    entry: { currency: 'SVE', amount: 200 },
    maxEntries: 5,
    description: 'Completed draw, winner delivered.',
    rules: ['Draw completed from the closed entry snapshot.'],
  },
  {
    id: 'gv-011',
    slug: 'swiggy-gold-voucher',
    title: 'Swiggy Gold Voucher',
    tagline: '6-month Swiggy Gold membership voucher',
    icon: 'UtensilsCrossed',
    assetKey: 'swiggy-gold-voucher',
    accent: 'violet',
    prizeType: 'voucher',
    startsAt: loadTime - 60 * MS.DAY,
    endsAt: loadTime - 40 * MS.DAY,
    participants: 4200,
    winners: 1,
    entry: { currency: 'TOKEN', amount: 800 },
    maxEntries: 5,
    description: 'Completed draw, voucher delivered to the winner.',
    rules: ['Draw completed from the closed entry snapshot.'],
  },
];

/**
 * Derive the lifecycle state shown in the UI: ACTIVE | UPCOMING | ENDED.
 * Authoritative state names/transitions are [PDF]-pending.
 */
export function statusOf(giveaway, now = Date.now()) {
  const { startsAt, endsAt } = giveaway;
  if (startsAt && now < startsAt) return 'upcoming';
  if (now >= endsAt) return 'ended';
  return 'active';
}

/** Urgency flag (not a separate lifecycle state): final 5 days of an ACTIVE draw. */
export function isEndingSoon(giveaway, now = Date.now()) {
  return (
    statusOf(giveaway, now) === 'active' &&
    giveaway.endsAt - now <= 5 * MS.DAY
  );
}

/** Attach derived status fields for consumers (service layer). */
export function decorate(giveaway, now = Date.now()) {
  return {
    ...giveaway,
    status: statusOf(giveaway, now),
    endingSoon: isEndingSoon(giveaway, now),
  };
}
