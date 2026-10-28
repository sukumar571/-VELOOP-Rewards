import { Link } from 'react-router-dom';
import { ArrowRight, Ticket } from 'lucide-react';
import { HERO } from '../../content/site.js';
import styles from './GiveawayBanner.module.css';

/**
 * Reusable promo banner.
 *  variant="marquee" — scrolling giveaway-code callout strip (hero top)
 *  variant="cta"     — mid-page gradient banner inviting code entry
 */
export default function GiveawayBanner({ variant = 'marquee' }) {
  if (variant === 'cta') {
    return (
      <section className={styles.ctaBanner} aria-labelledby="code-cta-h">
        <div className={styles.ctaInner}>
          <span className={styles.ctaIcon} aria-hidden="true">
            <Ticket size={26} />
          </span>
          <div className={styles.ctaText}>
            <h2 id="code-cta-h" className={styles.ctaTitle}>
              Got a giveaway code?
            </h2>
            <p className={styles.ctaSub}>
              Enter special giveaway codes and unlock exciting VEs rewards instantly.
            </p>
          </div>
          <Link to="/giveaways" className={`vl-btn vl-btn-cta ${styles.ctaBtn}`}>
            Enter Giveaway
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.marquee} aria-hidden="true">
      <div className={styles.marqueeTrack}>
        <span className={styles.marqueeText}>{HERO.marquee}</span>
        <span className={styles.marqueeText}>{HERO.marquee}</span>
      </div>
    </div>
  );
}
