import styles from './StatusBadge.module.css';

const COPY = {
  active: 'Active',
  upcoming: 'Upcoming',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

/**
 * Giveaway lifecycle state badge: ACTIVE / UPCOMING / ENDED (+ ending-soon
 * urgency variant of ACTIVE). State derivation lives in the mock/service
 * layer; authoritative names are [PDF]-pending.
 */
export default function StatusBadge({ status, endingSoon = false, className = '' }) {
  const key = COPY[status] ? status : 'ended';
  const urgent = key === 'active' && endingSoon;
  const label = urgent ? 'Active · Ending soon' : COPY[key];
  return (
    <span
      className={[styles.badge, urgent ? styles.urgent : styles[key], className]
        .filter(Boolean)
        .join(' ')}
      data-status={key}
    >
      {key === 'active' ? <span className={styles.dot} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
