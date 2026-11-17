import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Zap,
  Gift,
  ArrowRight,
  Sparkles,
  Smartphone,
  Watch,
  Ticket,
} from 'lucide-react';
import { HERO } from '../../content/site.js';
import { asset } from '../../utils/assets.js';
import styles from './GiveawayHero.module.css';

const PILL_ICONS = { ShieldCheck, Zap, Gift };

/**
 * Premium giveaway hero: oversized display headline, layered violet/blue
 * radial lighting, a generated 3D-style mystery reward box (real artwork is
 * picked up automatically from src/assets/hero-gift.*), and two clear CTAs.
 */
export default function GiveawayHero() {
  const heroArt = asset('hero-gift') ?? asset('hero-phone');

  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      {/* Ambient light — decorative only */}
      <span className={styles.auroraA} aria-hidden="true" />
      <span className={styles.auroraB} aria-hidden="true" />
      <span className={styles.mesh} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className={styles.badge}>
            <Sparkles size={14} aria-hidden="true" />
            {HERO.badge}
          </span>

          <h1 id="hero-heading" className={`vl-display ${styles.title}`}>
            {HERO.titlePlain}{' '}
            <span className={`vl-gradient-text ${styles.gradient}`}>
              {HERO.titleGradient}
            </span>
          </h1>

          <p className={`vl-lead ${styles.sub}`}>{HERO.subtitle}</p>

          <div className={styles.actions}>
            <Link to={HERO.cta.to} className={`vl-btn vl-btn-cta vl-btn-lg ${styles.cta}`}>
              {HERO.cta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to={HERO.ctaSecondary.to} className="vl-btn vl-btn-outline vl-btn-lg">
              {HERO.ctaSecondary.label}
            </Link>
          </div>

          <ul className={styles.pills} aria-label="What every VELOOP entry includes">
            {HERO.pills.map(({ icon, title, sub }) => {
              const Icon = PILL_ICONS[icon] ?? Sparkles;
              return (
                <li key={title} className={styles.pill}>
                  <span className={styles.pillIcon} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className={styles.pillCopy}>
                    <span className={styles.pillTitle}>{title}</span>
                    <span className={styles.pillSub}>{sub}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.visualWrap}>
          {heroArt ? <HeroImage src={heroArt} /> : <HeroArt />}
        </div>
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
        width={640}
        height={640}
      />
    </div>
  );
}

/**
 * Generated mystery-box scene. Pure CSS/DOM so it stays crisp at every size and
 * never depends on a missing binary asset.
 */
function HeroArt() {
  return (
    <div
      className={styles.art}
      role="img"
      aria-label="A glowing mystery reward box hovering above a lit platform"
    >
      <span className={styles.artGlow} aria-hidden="true" />
      <span className={styles.halo} aria-hidden="true" />
      <span className={styles.plinth} aria-hidden="true" />
      <span className={styles.ringA} aria-hidden="true" />
      <span className={styles.ringB} aria-hidden="true" />

      <div className={styles.stage} aria-hidden="true">
        <span className={styles.ribbonBack} />
        <span className={styles.ribbonUp} />

        <div className={styles.box}>
          <span className={styles.boxBody} />
          <span className={styles.boxSheen} />
          <span className={styles.boxSeam} />
          <span className={styles.boxLogo}>
            <Gift size={26} strokeWidth={1.6} />
          </span>
          <span className={styles.ribbonV} />
          <span className={styles.ribbonH} />

          <span className={styles.boxLid}>
            <span className={styles.lidSheen} />
          </span>
          <span className={styles.lidRibbon} />
          <span className={styles.bow}>
            <span className={styles.bowLoopL} />
            <span className={styles.bowLoopR} />
            <span className={styles.bowKnot} />
          </span>
        </div>
      </div>

      <span className={`${styles.floatCard} ${styles.cardPhone}`}>
        <Smartphone size={16} aria-hidden="true" />
        <span>Devices</span>
      </span>
      <span className={`${styles.floatCard} ${styles.cardWatch}`}>
        <Watch size={16} aria-hidden="true" />
        <span>Wearables</span>
      </span>
      <span className={`${styles.floatCard} ${styles.cardVoucher}`}>
        <Ticket size={16} aria-hidden="true" />
        <span>Vouchers</span>
      </span>

      <Sparkles className={styles.sparkleA} size={24} aria-hidden="true" />
      <Sparkles className={styles.sparkleB} size={18} aria-hidden="true" />
      <span className={styles.particleA} aria-hidden="true" />
      <span className={styles.particleB} aria-hidden="true" />
      <span className={styles.particleC} aria-hidden="true" />
    </div>
  );
}
