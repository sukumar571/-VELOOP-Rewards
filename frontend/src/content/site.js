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
    '🎁  Enter Giveaway Codes · Unlock Amazing Rewards  🎁  Enter Giveaway Codes · Unlock Amazing Rewards  🎁  Enter Giveaway Codes · Unlock Amazing Rewards  🎁  Enter Giveaway Codes · Unlock Amazing Rewards  ',
  badge: 'Exclusive Giveaway',
  titlePlain: 'Enter special codes. Unlock amazing',
  titleGradient: 'Rewards',
  // "VEs" highlighted in violet, per Ref_01.
  subtitleLead: 'Enter special giveaway codes and unlock exciting',
  subtitleHighlight: 'VEs',
  subtitleTail: 'rewards instantly.',
  cta: { label: 'Enter Giveaway', to: '/giveaways' },
  ctaSecondary: { label: 'Recent winners', to: '/winners' },
  pills: [
    { icon: 'ShieldCheck', title: '100% Safe', sub: 'Secure & Trusted' },
    { icon: 'Zap', title: 'Instant Rewards', sub: 'Get Rewards Fast' },
    { icon: 'Gift', title: 'Exclusive VEs', sub: 'Special for You' },
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
    title: 'Get entries',
    text: 'Pay your entry fee in VEs, SVEs or Tokens — every entry is a fair chance.',
    icon: 'Ticket',
  },
  {
    title: 'Win rewards',
    text: 'Winners are selected randomly from the closed entry snapshot and announced publicly.',
    icon: 'Trophy',
  },
];

export const TRUST = [
  { icon: 'Scale', label: '100% Fair & Transparent' },
  { icon: 'Lock', label: 'Secure & Safe' },
  { icon: 'Users', label: 'Trusted by 10K+ Users' },
  { icon: 'Headphones', label: '24/7 Customer Support' },
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
