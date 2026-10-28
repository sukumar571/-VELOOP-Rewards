import { getCurrency, formatAmountValue } from '../../config/currencies.js';
import styles from './FeeBadges.module.css';

/**
 * Entry-fee pill for one giveaway. Rendered entirely from structured `entry`
 * config ({ currency, amount }) via the generic currency registry — it never
 * inspects the prize name, so every currency/prize is handled the same way.
 */
export default function FeeBadges({ entry, size = 'sm' }) {
  if (!entry || !entry.currency) return null;
  const c = getCurrency(entry.currency);
  return (
    <ul className={styles.list} data-size={size} aria-label="Entry fee">
      <li className={`${styles.badge} ${styles[c.accent] ?? styles.ve}`}>
        <span className={styles.amount}>{formatAmountValue(entry.currency, entry.amount)}</span>
        <span className={styles.currency}>{c.label}</span>
      </li>
    </ul>
  );
}
