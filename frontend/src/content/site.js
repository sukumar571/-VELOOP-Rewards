/**
 * Static marketing copy & navigation structure.
 * Not backend data: nothing here describes a prize, price, winner or statistic.
 */

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Giveaways', to: '/giveaways' },
  { label: 'Winners', to: '/winners' },
  { label: 'How it works', to: '/#how-it-works' },
];

export const HERO = {
  badge: 'VELOOP Rewards · Season 04',
  titleLineOne: 'Exceptional Rewards.',
  titleLineTwo: 'Extraordinary Possibilities.',
  subtitle:
    'Discover exclusive rewards, explore premium giveaways, and experience a smarter way to participate.',
  cta: { label: 'Explore Giveaways', to: '/giveaways' },
  ctaSecondary: { label: 'Discover How It Works', to: '/#how-it-works' },
  /** Each statement is a property of the entry flow, not a marketing claim. */
  assurances: [
    'Server-validated entries',
    'One charge per entry',
    'Masked winner identities',
  ],
};

/**
 * Homepage hero copy (home only — HERO above is still consumed by the
 * legacy giveaway hero). Presentational text only: no numbers, prizes or
 * claims that the application does not implement.
 */
export const HOME_HERO = {
  badge: 'VELOOP Rewards · Exclusive Collection',
  titleLineOne: 'Rewards Worth',
  titleLineTwo: 'More Than You Imagine.',
  kicker: 'Discover. Participate. Win.',
  subtitle:
    'Explore exclusive giveaways featuring premium smartphones, laptops, tablets, smartwatches and lifestyle tech. Your next favourite gadget could be just one entry away.',
  cta: { label: 'Explore Giveaways', to: '/giveaways' },
  ctaSecondary: { label: 'How It Works', to: '/#how-it-works' },
  assurances: [
    { icon: 'Gem', label: 'Premium gadgets' },
    { icon: 'ShieldCheck', label: 'Exclusive giveaways' },
    { icon: 'Lock', label: 'Transparent entries' },
  ],
};

/** The four real stages of an entry (consumed by the homepage steps). */
export const STEPS = [
  {
    title: 'Create your account',
    text: 'Sign in with your VELOOP account or create one to get started.',
    icon: 'UserPlus',
  },
  {
    title: 'Choose your draw',
    text: 'Browse open giveaways and open any card to see its prize, entry fee and closing date.',
    icon: 'ListChecks',
  },
  {
    title: 'Secure your entry',
    text: 'The server validates lifecycle, quota, eligibility and balance before the entry fee is charged.',
    icon: 'Ticket',
  },
  {
    title: 'Wait for the draw',
    text: 'Winners are selected from the closed entry snapshot and announced with masked identities.',
    icon: 'Trophy',
  },
];

/**
 * Why VELOOP — every line maps to behaviour the application implements:
 * server-authoritative pricing, eligibility resolution, idempotent charging,
 * ledger + audit records, masked identities and role-protected admin surfaces.
 */
export const EXPERIENCE = {
  eyebrow: 'Why VELOOP',
  title: 'Built on record, not on promises.',
  subtitle:
    'Five properties of the platform you can verify yourself — in the entry flow, on the draw page, and in the records every entry leaves behind.',
  items: [
    {
      icon: 'Scale',
      title: 'Transparent participation',
      text: 'Entry currency, fee, closing date and draw rules are shown before you enter. Nothing changes after you press the button.',
    },
    {
      icon: 'ShieldCheck',
      title: 'Verified eligibility',
      text: 'Lifecycle state, entry quota, account eligibility and balance are resolved on the server at the moment of entry — never in the browser.',
    },
    {
      icon: 'ReceiptText',
      title: 'Clear reward information',
      text: 'Every draw lists its prize tier and winner count. Policy that is not yet confirmed is marked pending instead of being presented as fact.',
    },
    {
      icon: 'ListChecks',
      title: 'Reliable participation records',
      text: 'Each entry is written with an idempotency key and a ledger row, so a double-click or a retry is never charged twice.',
    },
    {
      icon: 'Lock',
      title: 'Secure account experience',
      text: 'Sign-in issues a verified credential that the API checks on every request, and administrative surfaces require an admin role on the server.',
    },
  ],
};

/** Kept for components that still render the trust strip (winners page). */
export const TRUST = [
  {
    icon: 'Scale',
    label: 'One entry, one chance',
    text: 'Winners are drawn from the closed entry snapshot, so additional entries only ever add chances.',
  },
  {
    icon: 'ShieldCheck',
    label: 'Checked before charged',
    text: 'Lifecycle, quota, eligibility and balance are validated before any entry fee is taken.',
  },
  {
    icon: 'Lock',
    label: 'Masked identities',
    text: 'Winner announcements show masked account IDs — never personal details.',
  },
  {
    icon: 'Headphones',
    label: 'A claim window',
    text: 'Winners follow a private claim flow with a visible deadline for their prize.',
  },
];

export const FOOTER = {
  blurb:
    'VELOOP Rewards runs exclusive giveaway draws where members enter with VEs, SVEs and Tokens, and win premium prizes — fairly, transparently and securely.',
  columns: [
    {
      title: 'Explore',
      links: [
        { label: 'Home', to: '/' },
        { label: 'All giveaways', to: '/giveaways' },
        { label: 'Winner wall', to: '/winners' },
      ],
    },
    {
      title: 'Programme',
      links: [
        { label: 'How it works', to: '/#how-it-works' },
        { label: 'Fairness & trust', to: '/#how-it-works' },
        { label: 'Ending soon', to: '/giveaways?filter=ending_soon' },
      ],
    },
    {
      title: 'Support',
      links: [
        { label: 'Your balance', to: '/earn' },
        { label: 'Entry & fees', to: '/giveaways' },
        { label: 'Terms & privacy', to: '/legal' },
      ],
    },
  ],
  legal: [
    { label: 'Terms & conditions', to: '/legal#terms' },
    { label: 'Privacy policy', to: '/legal#privacy' },
  ],
  note: 'Giveaway terms follow the official VELOOP programme rules.',
};
