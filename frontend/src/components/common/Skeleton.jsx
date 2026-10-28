import styles from './Skeleton.module.css';

/**
 * Loading placeholder. variant="card" mimics a PrizeCard, "row" a list line,
 * "blocks" a countdown row. Decorative — hidden from assistive tech while
 * the surrounding region announces its busy state via aria-busy.
 */
export default function Skeleton({ variant = 'row', count = 1, className = '' }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`${styles[variant] ?? styles.row} ${className}`}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
