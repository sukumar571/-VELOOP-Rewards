/**
 * Presentation-time formatting helpers (pure functions, no network calls).
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/** 2300 -> "2.3K+", 1_250_000 -> "1.3M+" */
export function formatCount(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M+`;
  if (n >= 1_000) return `${trim(n / 1_000)}K+`;
  return String(n);
}

function trim(x) {
  return x.toFixed(1).replace(/\.0$/, '');
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "12d 08h 58m" style compact remaining-time label (for meta text/aria). */
export function remainingLabel({ days, hours, minutes, ended }) {
  if (ended) return 'Entry window closed';
  if (days > 0) return `${days}d ${pad2(hours)}h ${pad2(minutes)}m remaining`;
  return `${pad2(hours)}h ${pad2(minutes)}m remaining`;
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const MS = { DAY, HOUR, MIN };
