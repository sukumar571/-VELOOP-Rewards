import { useEffect, useState } from 'react';
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
 *
 * Spec §54: the visible message rotates slowly through giveaway-themed copy.
 * The rotating line is aria-hidden — screen readers instead receive ONE stable
 * label (the `label` prop, default "Loading giveaways…") from the status
 * region, so rotation never becomes live-region spam. Passing a custom label
 * freezes the visible message to it (per-draw loading keeps its exact title).
 * ========================================================================= */

/** Visible rotating messages (spec §54). Changed slowly on purpose. */
export const LOADER_MESSAGES = [
  'Preparing today’s rewards…',
  'Checking active giveaways…',
  'Loading available prizes…',
  'Bringing your rewards closer…',
];

const ROTATE_MS = 2200;

const DEFAULT_LABEL = 'Loading giveaways…';

export default function GiveawayLoader({ label = DEFAULT_LABEL, compact = false, rotate }) {
  // Rotate themed copy only for the generic default state; a custom label (or
  // an explicit rotate={false}) freezes the visible message.
  const rotating = rotate ?? label === DEFAULT_LABEL;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!rotating) return undefined;
    const id = setInterval(
      () => setMessageIndex((i) => (i + 1) % LOADER_MESSAGES.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [rotating]);

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
      <span className={styles.label} aria-hidden={rotating || undefined}>
        {rotating ? LOADER_MESSAGES[messageIndex] : label}
      </span>
      {rotating ? <span className={styles.srOnly}>{label}</span> : null}
    </div>
  );
}
