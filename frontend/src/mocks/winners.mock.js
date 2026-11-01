/**
 * ============================================================================
 * WINNER MOCK DATA — explicitly FICTIONAL demo records (DEMO_DATA=true).
 * ============================================================================
 * Not real announcements. Records intentionally contain ONLY masked
 * identities: no email, phone or address exists on these objects at all, so
 * nothing sensitive can leak even if rendering code misbehaves. Each record
 * stays linked to its ORIGINAL giveaway via giveawayId (business rule:
 * historical winners remain associated with their giveaway).
 * Published winner records exist ONLY for ENDED giveaways — ACTIVE draws
 * never have winner rows, so the UI cannot falsely announce winners early
 * (service layer double-checks this on read).
 * ========================================================================= */

export const DEMO_DATA = true;

const DAY = 86_400_000;
const loadTime = Date.now();

export const WINNERS = [
  {
    id: 'wn-001',
    giveawayId: 'gv-009', // PlayStation 5 Slim — ENDED
    giveawaySlug: 'playstation-5',
    giveawayTitle: 'PlayStation 5 Slim',
    prize: 'PS5 Slim console + DualSense controller',
    maskedUserId: 'VU-••••-2291',
    displayAlias: 'Sukumar',
    announcedAt: loadTime - 4 * DAY,
    deliveryStatus: 'Claim verified',
  },
  {
    id: 'wn-002',
    giveawayId: 'gv-010', // Sony WH-1000XM5 — ENDED
    giveawaySlug: 'sony-headphones',
    giveawayTitle: 'Sony WH-1000XM5',
    prize: 'Sony WH-1000XM5 headphones',
    maskedUserId: 'VU-••••-7740',
    displayAlias: 'Nagoor',
    announcedAt: loadTime - 19 * DAY,
    deliveryStatus: 'Delivered',
  },
  {
    id: 'wn-003',
    giveawayId: 'gv-011', // Swiggy Gold Voucher — ENDED
    giveawaySlug: 'swiggy-gold-voucher',
    giveawayTitle: 'Swiggy Gold Voucher',
    prize: '6-month Swiggy Gold membership',
    maskedUserId: 'VU-••••-1053',
    displayAlias: 'Basha',
    announcedAt: loadTime - 39 * DAY,
    deliveryStatus: 'Delivered',
  },
  {
    id: 'wn-004',
    giveawayId: 'gv-arch-011', // archived draw (not in active catalogue)
    giveawaySlug: null,
    giveawayTitle: 'iPad Air Draw',
    prize: 'iPad Air 64 GB · Starlight',
    maskedUserId: 'VU-••••-8816',
    displayAlias: 'Manvitha',
    announcedAt: loadTime - 70 * DAY,
    deliveryStatus: 'Delivered',
  },
  {
    id: 'wn-005',
    giveawayId: 'gv-arch-012',
    giveawaySlug: null,
    giveawayTitle: 'VE Voucher Mega Drop',
    prize: '5,000 VE voucher bundle',
    maskedUserId: 'VU-••••-3307',
    displayAlias: 'R•••• B••',
    announcedAt: loadTime - 96 * DAY,
    deliveryStatus: 'Delivered',
  },
  {
    id: 'wn-006',
    giveawayId: 'gv-arch-013',
    giveawaySlug: null,
    giveawayTitle: 'Noise Cancelling Buds Draw',
    prize: 'Ank Music Pro 2 TWS buds',
    maskedUserId: 'VU-••••-5962',
    displayAlias: 'P•••• N••',
    announcedAt: loadTime - 120 * DAY,
    deliveryStatus: 'Delivered',
  },
];
