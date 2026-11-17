import { Scale, Lock, Users, Headphones, ShieldCheck } from 'lucide-react';
import { TRUST } from '../../content/site.js';
import Reveal from '../common/Reveal.jsx';
import styles from './TrustSection.module.css';

const ICONS = { Scale, Lock, Users, Headphones };

/**
 * Fairness & transparency (#trust — footer links here). Every point describes
 * behaviour the application actually implements; no guarantees, counts or
 * statistics are invented.
 */
export default function TrustSection() {
  return (
    <section className={`container ${styles.wrap}`} aria-labelledby="trust-heading">
      <div id="trust" className="vl-anchor-offset">
        <div className={styles.head}>
          <p className="vl-eyebrow">Fairness &amp; transparency</p>
          <h2 id="trust-heading" className={`vl-h2 ${styles.title}`}>
            Trust, by design
          </h2>
          <p className={styles.lead}>
            Nothing below is a promise in small print — each point describes exactly how a
            VELOOP draw behaves today.
          </p>
        </div>

        <ul className={styles.grid}>
          {TRUST.map(({ icon, label, text }, i) => {
            const Icon = ICONS[icon] ?? ShieldCheck;
            return (
              <Reveal as="li" key={label} className={styles.item} delay={i * 60}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={19} />
                </span>
                <h3 className={styles.label}>{label}</h3>
                <p className={styles.text}>{text}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
