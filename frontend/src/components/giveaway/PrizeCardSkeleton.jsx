import styles from './PrizeCardSkeleton.module.css';

/**
 * Loading placeholder shaped exactly like <PrizeCard> (16:9 art, two-line
 * title, tagline, meta row, CTA), so the grid never jumps when data lands.
 * Decorative only — the surrounding region carries aria-busy.
 */
export default function PrizeCardSkeleton({ count = 4 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className={`vl-card ${styles.card}`} aria-hidden="true">
      <div className={styles.visual} />
      <div className={styles.body}>
        <span className={styles.title} />
        <span className={styles.tagline} />
        <span className={styles.metaRow} />
        <span className={styles.cta} />
      </div>
    </div>
  ));
}
