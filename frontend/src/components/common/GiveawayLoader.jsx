import styles from './GiveawayLoader.module.css';

/**
 * ============================================================================
 * VELOOP GIVEAWAY LOADER — branded initial-loading experience.
 * ============================================================================
 * Replaces the generic Bootstrap spinner for the first giveaway fetch. A violet
 * conic-gradient orbit ring (brand --vl-grad-cta) spins around a pulsing gold
 * core while the VELOOP wordmark shimmer-animates underneath. Purely presentational:
 * the surrounding region announces its busy state via aria-busy, and this node is a
 * polite live-region label so screen readers get "Loading giveaways".
 * ========================================================================= */
export default function GiveawayLoader({ label = 'Loading giveaways…', compact = false }) {
  return (
    <div
      className={`${styles.loader} ${compact ? styles.compact : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.orbit} aria-hidden="true">
        <span className={styles.ring} />
        <span className={styles.track} />
        <span className={styles.core} />
      </div>
      <span className={styles.wordmark} aria-hidden="true">
        VELOOP
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
