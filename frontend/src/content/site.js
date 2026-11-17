/**
 * Static marketing copy & navigation structure, transcribed from the project
 * design references (Ref_01 hero, Ref_02 page sections). Not backend data.
 */

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Giveaways', to: '/giveaways' },
  { label: 'Winners', to: '/winners' },
  { label: 'How it works', to: '/#how-it-works' },
];

export const HERO = {
  marquee:
    '✦  Exclusive draws open now  ✦  Premium prizes every season  ✦  Verified entries, transparent draws  ✦  Rewards, reimagined  ✦  ',
  badge: 'VELOOP Rewards · Season 04',
  titlePlain: 'Unlock',
  titleGradient: 'Extraordinary Rewards.',
  subtitle: 'Discover exclusive giveaways. Experience rewards differently.',
  cta: { label: 'Explore Giveaways', to: '/giveaways' },
  ctaSecondary: { label: 'How It Works', to: '/#how-it-works' },
  pills: [
    { icon: 'ShieldCheck', title: 'Verified entry', sub: 'Checked before every charge' },
    { icon: 'Zap', title: 'Instant confirmation', sub: 'Enter in a single tap' },
    { icon: 'Gift', title: 'Premium prizes', sub: 'Devices, vouchers & more' },
  ],
};

export const STEPS = [
  {
    title: 'Create your account',
    text: 'Sign in with your VELOOP account or create one to get started.',
    icon: 'UserPlus',
  },
  {
    title: 'Complete tasks',
    text: 'Finish simple tasks to earn extra entries towards live giveaways.',
    icon: 'ListChecks',
  },
  {
    title: 'Secure your entry',
    text: 'Pay your entry fee in VEs, SVEs or Tokens — every entry is a fair chance.',
    icon: 'Ticket',
  },
  {
    title: 'Win rewards',
    text: 'Winners are selected randomly from the closed entry snapshot and announced publicly.',
    icon: 'Trophy',
  },
];

/**
 * Trust points. Each one describes behaviour the application actually
 * implements (entry validation, idempotent charging, masked winners, claim
 * windows) — no invented guarantees, statistics or user counts.
 */
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
        { label: 'Fairness & trust', to: '/#trust' },
        { label: 'Ending soon', to: '/giveaways?filter=ending_soon' },
      ],
    },
  ],
};
