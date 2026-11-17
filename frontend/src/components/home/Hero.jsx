import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getFeaturedGiveaways, getProgrammeStats } from '../../services/giveawayService.js';
import { HERO } from '../../content/site.js';
import { getPrizeType } from '../../config/prizeTypes.js';
import { formatCount } from '../../utils/format.js';
import PrizeMedia from './PrizeMedia.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Countdown from '../common/Countdown.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import Skeleton from '../common/Skeleton.jsx';
import styles from './Hero.module.css';

/**
 * Homepage hero — cinematic, asymmetric editorial layout.
 *
 * The right column is a live featured-draw panel built from the giveaway
 * service (no invented numbers, no decorative product illustration). When a
 * real prize photograph is added to src/assets/, PrizeMedia swaps it in.
 */
export default function Hero() {
  const { data: featured, loading, error } = useAsync(getFeaturedGiveaways, []);
  const { data: stats } = useAsync(getProgrammeStats, []);

  const lead = featured?.[0] ?? null;
  const category = lead ? getPrizeType(lead.prizeType).label : 'Prize';

  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <span className={styles.lightA} aria-hidden="true" />
      <span className={styles.lightB} aria-hidden="true" />
      <span className={styles.hairline} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className={styles.badge}>
            <span className={styles.badgeDot} aria-hidden="true" />
            {HERO.badge}
          </p>

          <h1 id="hero-heading" className={styles.title}>
            <span className={styles.titleLine}>{HERO.titleLineOne}</span>
            <span className={`${styles.titleLine} ${styles.titleAccent}`}>
              {HERO.titleLineTwo}
            </span>
          </h1>

          <p className={styles.sub}>{HERO.subtitle}</p>

          <div className={styles.actions}>
            <Link to={HERO.cta.to} className="vl-btn vl-btn-cta vl-btn-lg">
              {HERO.cta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to={HERO.ctaSecondary.to} className="vl-btn vl-btn-outline vl-btn-lg">
              {HERO.ctaSecondary.label}
            </Link>
          </div>

          <ul className={styles.assurances}>
            {HERO.assurances.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {stats ? (
            <p className={styles.liveLine}>
              <span className={styles.liveDot} aria-hidden="true" />
              {stats.activeCount} live {stats.activeCount === 1 ? 'draw' : 'draws'}
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              {formatCount(stats.totalParticipants)} participants recorded
            </p>
          ) : null}
        </div>

        <div className={styles.visualCol}>
          <p className={styles.visualLabel}>Featured draw</p>

          <div className={styles.panel}>
            {loading ? (
              <div className={styles.panelState} aria-busy="true">
                <Skeleton variant="card" />
              </div>
            ) : lead ? (
              <>
                <HeroMediaSlot giveaway={lead} category={category} />
                <div className={styles.panelBody}>
                  <div className={styles.panelTop}>
                    <StatusBadge status={lead.status} endingSoon={lead.endingSoon} />
                    <Countdown endsAt={lead.endsAt} variant="chip" />
                  </div>
                  <h2 className={styles.panelTitle}>
                    <Link to={`/giveaways/${lead.slug}`}>{lead.title}</Link>
                  </h2>
                  <p className={styles.panelTagline}>{lead.tagline}</p>
                  <div className={styles.panelFoot}>
                    <FeeBadges entry={lead.entry} />
                    <Link to={`/giveaways/${lead.slug}`} className={styles.panelLink}>
                      View giveaway
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.panelState}>
                <p className={styles.panelEmpty}>
                  {error
                    ? 'Live draws are unavailable right now.'
                    : 'No draw is open for entry at this moment.'}
                </p>
                <Link to="/giveaways" className="vl-btn vl-btn-outline vl-btn-sm">
                  Browse giveaways
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMediaSlot({ giveaway, category }) {
  return (
    <div className={styles.mediaWrap}>
      <PrizeMedia giveaway={giveaway} categoryLabel={category} ratio="landscape" priority />
    </div>
  );
}
