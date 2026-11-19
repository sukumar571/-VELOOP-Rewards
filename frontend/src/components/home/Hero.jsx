import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Gift, Gem, ShieldCheck, Lock } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getProgrammeStats } from '../../services/giveawayService.js';
import { HOME_HERO } from '../../content/site.js';
import { asset } from '../../utils/assets.js';
import { formatCount } from '../../utils/format.js';
import styles from './Hero.module.css';

const ASSURANCE_ICONS = { Gem, ShieldCheck, Lock };

/**
 * Homepage hero — editorial promise on the left, product collection on the
 * right.
 *
 * The artwork is the supplied collection photograph (src/assets/
 * hero-collection.webp). The live programme figures below the actions come
 * from the giveaway service; nothing on this hero is an invented statistic.
 */
export default function Hero() {
  const { data: stats } = useAsync(getProgrammeStats, []);
  const art = asset('hero-collection');

  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <span className={styles.glow} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className={styles.badge}>
            <Gift size={14} aria-hidden="true" />
            {HOME_HERO.badge}
          </p>

          <h1 id="hero-heading" className={styles.title}>
            <span className={styles.titleLine}>{HOME_HERO.titleLineOne}</span>
            <span className={`${styles.titleLine} ${styles.titleAccent}`}>
              {HOME_HERO.titleLineTwo}
            </span>
          </h1>

          <p className={styles.kicker}>{HOME_HERO.kicker}</p>
          <p className={styles.sub}>{HOME_HERO.subtitle}</p>

          <div className={styles.actions}>
            <Link to={HOME_HERO.cta.to} className={`vl-btn vl-btn-gold vl-btn-lg ${styles.cta}`}>
              {HOME_HERO.cta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              to={HOME_HERO.ctaSecondary.to}
              className={`vl-btn vl-btn-outline vl-btn-lg ${styles.cta}`}
            >
              {HOME_HERO.ctaSecondary.label}
              <ChevronDown size={16} aria-hidden="true" />
            </Link>
          </div>

          <ul className={styles.assurances}>
            {HOME_HERO.assurances.map(({ icon, label }) => {
              const Icon = ASSURANCE_ICONS[icon] ?? Gem;
              return (
                <li key={label} className={styles.assurance}>
                  <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                  {label}
                </li>
              );
            })}
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

        <figure className={styles.stage}>
          {art ? (
            <img
              className={styles.art}
              src={art}
              alt=""
              width={900}
              height={900}
              decoding="async"
              fetchPriority="high"
            />
          ) : null}
        </figure>
      </div>
    </section>
  );
}
