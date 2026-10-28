import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Zap,
  Gift,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { HERO } from '../../content/site.js';
import { asset } from '../../utils/assets.js';
import styles from './GiveawayHero.module.css';

const PILL_ICONS = { ShieldCheck, Zap, Gift };

/**
 * Premium giveaway hero (Ref_01): eyebrow badge, gradient display headline,
 * trust pills, clear CTA and a reward illustration (real Drive asset when
 * provided in src/assets/hero-gift.*, otherwise the generated gift scene).
 */
export default function GiveawayHero() {
  const heroArt = asset('hero-gift') ?? asset('hero-phone');

  return (
    <section className={styles.hero} aria-label="VELOOP Rewards giveaways">
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className={styles.badge}>
            <Sparkles size={14} aria-hidden="true" />
            {HERO.badge}
          </span>

          <h1 className="vl-display">
            {HERO.titlePlain}{' '}
            <span className="vl-gradient-text">{HERO.titleGradient}.</span>
          </h1>

          <p className={`vl-lead ${styles.sub}`}>
            {HERO.subtitleLead}{' '}
            <span className={styles.highlight}>{HERO.subtitleHighlight}</span>{' '}
            {HERO.subtitleTail}
          </p>

          <ul className={styles.pills} aria-label="Why members trust VELOOP Rewards">
            {HERO.pills.map(({ icon, title, sub }) => {
              const Icon = PILL_ICONS[icon] ?? Sparkles;
              return (
                <li key={title} className={styles.pill}>
                  <span className={styles.pillIcon} aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span>
                    <span className={styles.pillTitle}>{title}</span>
                    <span className={styles.pillSub}>{sub}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className={styles.actions}>
            <Link to={HERO.cta.to} className={`vl-btn vl-btn-cta vl-btn-lg ${styles.cta}`}>
              {HERO.cta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              to={HERO.ctaSecondary.to}
              className={`vl-btn vl-btn-outline ${styles.ctaGhost}`}
            >
              {HERO.ctaSecondary.label}
            </Link>
          </div>
        </div>

        <div className={styles.visualWrap}>{heroArt ? <HeroImage src={heroArt} /> : <HeroArt />}</div>
      </div>
    </section>
  );
}

function HeroImage({ src }) {
  return (
    <div className={styles.artFrame}>
      <img
        className={styles.artImg}
        src={src}
        alt="Exclusive VELOOP Rewards giveaway illustration"
        width={600}
        height={600}
      />
    </div>
  );
}

/** Generated fallback reward illustration (real Drive art slots in via src/assets). */
function HeroArt() {
  return (
    <div
      className={styles.art}
      role="img"
      aria-label="Illustration of an exclusive VELOOP giveaway prize draw"
    >
      <span className={styles.artGlow} aria-hidden="true" />
      <span className={styles.artRing} aria-hidden="true" />
      <span className={styles.giftBox} aria-hidden="true">
        <span className={styles.giftLid} />
        <span className={styles.giftBody} />
        <span className={styles.giftRibbonV} />
        <span className={styles.giftRibbonH} />
        <span className={styles.giftBowL} />
        <span className={styles.giftBowR} />
      </span>
      <Sparkles className={styles.sparkleA} size={26} aria-hidden="true" />
      <Gift className={styles.sparkleB} size={22} aria-hidden="true" />
      <ShieldCheck className={styles.sparkleC} size={22} aria-hidden="true" />
    </div>
  );
}
