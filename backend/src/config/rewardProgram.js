/**
 * ============================================================================
 * REWARD PROGRAM DEFAULTS — the backend's starting configuration.
 * ============================================================================
 * These values are the SERVER's configuration defaults, not client-side numbers:
 * the frontend never computes a reward. An administrator can change every one of
 * them from the admin reward pages, and the runtime always reads the stored row.
 *
 * `DEFAULT_ACTIVITIES` is only written when the activity collection is empty (or
 * by `npm run seed:rewards`), so an operator's edits are never overwritten.
 * ========================================================================= */

/** systemSettings key holding the referral configuration. */
const REFERRAL_SETTING_KEY = 'reward.referral';

const DEFAULT_REFERRAL_CONFIG = Object.freeze({
  enabled: true,
  referrerReward: { currency: 'VE', amount: 100 },
  /** null = the referred account receives nothing (administrator's choice). */
  refereeReward: null,
  qualification: {
    /** A brand-new account must be at least this old before the reward lands. */
    minAccountAgeHours: 24,
    /** Require the referred account to have entered at least one giveaway. */
    requireParticipation: false,
    /** Auto-qualify once the rules are met (false = an admin must approve). */
    autoApprove: true,
  },
  maxReferralsPerUser: 100,
});

const DEFAULT_ACTIVITIES = Object.freeze([
  {
    key: 'daily-login',
    title: 'Daily login reward',
    description: 'Sign in and collect a daily reward. One claim per calendar day (UTC).',
    currency: 'VE',
    amount: 25,
    claimMode: 'DAILY',
    maxClaimsPerUser: 365,
    sortOrder: 10,
    active: true,
  },
  {
    key: 'explore-draws',
    title: 'Explore this week’s draws',
    description: 'Browse the open giveaways and claim a one-time exploration reward.',
    currency: 'VE',
    amount: 50,
    claimMode: 'ONCE',
    maxClaimsPerUser: 1,
    sortOrder: 20,
    active: true,
  },
  {
    key: 'social-share',
    title: 'Share a draw with friends',
    description: 'Share a giveaway on your social channel and collect a one-time SVEs reward.',
    currency: 'SVE',
    amount: 20,
    claimMode: 'ONCE',
    maxClaimsPerUser: 1,
    sortOrder: 30,
    active: true,
  },
  {
    key: 'event-bonus',
    title: 'Seasonal event bonus',
    description: 'Limited promotional campaign. Enabled by the VELOOP team for the event window.',
    currency: 'TOKEN',
    amount: 100,
    claimMode: 'ONCE',
    maxClaimsPerUser: 1,
    sortOrder: 40,
    // A campaign stays off until an administrator opens its window.
    active: false,
  },
  {
    key: 'approved-activity',
    title: 'Approved platform activity',
    description: 'Complete a verified platform activity to receive a one-time reward.',
    currency: 'VE',
    amount: 30,
    claimMode: 'ONCE',
    maxClaimsPerUser: 1,
    sortOrder: 50,
    active: true,
  },
]);

module.exports = { REFERRAL_SETTING_KEY, DEFAULT_REFERRAL_CONFIG, DEFAULT_ACTIVITIES };
