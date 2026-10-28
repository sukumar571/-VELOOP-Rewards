import { Clock, Hourglass } from 'lucide-react';
import { useCountdown } from '../../hooks/useCountdown.js';
import { pad2, remainingLabel } from '../../utils/format.js';
import styles from './Countdown.module.css';

/**
 * Live countdown driven by configured timestamps (startsAt/endsAt).
 * variant="chip" for cards, variant="blocks" for detail pages.
 * role="timer" with an aria-label refreshed at minute granularity only.
 */
export default function Countdown({ endsAt, variant = 'chip', className = '' }) {
  const t = useCountdown(endsAt);
  const base = [styles.root, variant === 'blocks' ? styles.blocks : styles.chip, className]
    .filter(Boolean)
    .join(' ');

  if (t.ended) {
    return (
      <span className={`${base} ${styles.ended}`} role="status">
        <Hourglass size={14} aria-hidden="true" />
        Entries closed
      </span>
    );
  }

  if (variant === 'blocks') {
    return (
      <div
        className={base}
        role="timer"
        aria-label={`${t.days} days, ${t.hours} hours and ${t.minutes} minutes remaining`}
      >
        <Unit value={pad2(t.days)} label="Days" />
        <Sep />
        <Unit value={pad2(t.hours)} label="Hours" />
        <Sep />
        <Unit value={pad2(t.minutes)} label="Minutes" />
        <Sep />
        <Unit value={pad2(t.seconds)} label="Seconds" />
      </div>
    );
  }

  return (
    <span
      className={base}
      role="timer"
      aria-label={remainingLabel(t)}
      title={remainingLabel(t)}
    >
      <Clock size={14} aria-hidden="true" />
      <span aria-hidden="true">
        {t.days}d : {pad2(t.hours)}h : {pad2(t.minutes)}m :{' '}
        <span className={styles.sec}>{pad2(t.seconds)}s</span>
      </span>
    </span>
  );
}

function Unit({ value, label }) {
  return (
    <span className={styles.unit} aria-hidden="true">
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}

function Sep() {
  return (
    <span className={styles.sep} aria-hidden="true">
      :
    </span>
  );
}
