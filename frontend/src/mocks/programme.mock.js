/**
 * ============================================================================
 * PROGRAMME MOCK DATA — rules & FAQ copy (development content).
 * ============================================================================
 * Wording follows the design references and the owner brief. The definitive
 * rule text is [PDF]-pending; this module feeds GiveawayRules and the FAQ
 * accordion via the service layer so it can be replaced by API/CMS content
 * without touching components.
 * ========================================================================= */

export const DEMO_DATA = true;

export const PROGRAMME_RULES = [
  {
    title: 'One account, one identity',
    text: 'Each member may enter with a single verified VELOOP account. Duplicate or shared accounts are flagged and removed from the draw pool.',
  },
  {
    title: 'Entry fees are per entry',
    text: 'Every entry costs the published fee in VE, SVE or Token. Fees are deducted securely at entry time and refunded automatically if a draw is cancelled.',
  },
  {
    title: 'Winners drawn after entries close',
    text: 'Draws run only from the final, closed entry snapshot. No entry added after the deadline can affect — or see — a result.',
  },
  {
    title: 'Announcements are public and permanent',
    text: 'Once a draw completes, its winners are published on the winner wall and stay linked to that giveaway forever, even as new rounds launch.',
  },
  {
    title: 'Privacy by default',
    text: 'Public winner records show masked identities only — never full emails, phone numbers or home addresses. Claim details stay private to the winner.',
  },
];

export const FAQS = [
  {
    q: 'What are VEs, SVEs and Tokens?',
    a: 'They are the three VELOOP reward balances you can use to pay a giveaway entry fee. Your wallet page shows each balance, and the entry panel lets you choose which one to spend per entry.',
  },
  {
    q: 'How do I enter a giveaway?',
    a: 'Open the giveaway’s details page from any prize card’s Join Now button, choose your entry currency and quantity, and confirm. Entry payments activate once your VELOOP account and wallet are connected.',
  },
  {
    q: 'When are winners announced?',
    a: 'Immediately after the entry window closes. The draw runs from the final entry snapshot, and the announcement appears on the Winners tab and on the giveaway’s details page.',
  },
  {
    q: 'Why do winners show as masked IDs like VU-••••-2291?',
    a: 'For privacy. Public records never display full emails, phone numbers or addresses. Only the winner and the VELOOP admin team can see contact details, and only inside the private claim flow.',
  },
  {
    q: 'What happens if a giveaway is cancelled?',
    a: 'Entry fees are refunded to the same balance they were paid from, and the giveaway card moves to a Cancelled state. Refunds are automatic and audited.',
  },
  {
    q: 'Is this page showing real activity?',
    a: 'This build runs on clearly-labelled fictional development data. Live statistics, prizes and winners appear once the frontend is connected to the VELOOP API.',
  },
];

/**
 * ----------------------------------------------------------------------------
 * DETAIL-PAGE LEGAL / ELIGIBILITY CONTENT
 * ----------------------------------------------------------------------------
 * The project PDF is the authoritative source for these. Until it is provided
 * every item is a PLACEHOLDER flagged `pending: true`, so the UI renders it
 * under an explicit "awaiting approval" marker. No refund or eligibility rule
 * is presented as confirmed policy.
 * ------------------------------------------------------------------------- */

export const ELIGIBILITY_REQUIREMENTS = [
  {
    text: 'You must be signed in to a single verified VELOOP account to enter.',
    pending: false,
  },
  {
    text: 'Your balance in the required currency must cover the entry fee at the moment you join.',
    pending: false,
  },
  {
    text: 'Minimum age and regional eligibility rules are not yet confirmed.',
    pending: true,
  },
];

export const TERMS_AND_CONDITIONS = [
  {
    text: 'One account may enter a giveaway; duplicate or shared accounts may be removed from the draw pool.',
    pending: false,
  },
  {
    text: 'Entry fees are charged per confirmed entry from the stated currency only.',
    pending: false,
  },
  {
    text: 'Refund and cancellation handling policy is pending confirmation in the project specification.',
    pending: true,
  },
  {
    text: 'Full, binding terms of participation are pending legal/business approval.',
    pending: true,
  },
];

export const IMPORTANT_INFO = [
  {
    text: 'Winner announcements for an active draw are never published before its entry window closes.',
    pending: false,
  },
  {
    text: 'Public winner records show masked identities only — never full email, phone or home address.',
    pending: false,
  },
  {
    text: 'Prize dispatch / payout timeframes are pending confirmation in the project specification.',
    pending: true,
  },
];
