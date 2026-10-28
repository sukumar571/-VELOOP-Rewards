import { Scale, Lock, Users, Headphones, ShieldCheck } from 'lucide-react';
import { TRUST } from '../../content/site.js';
import styles from './TrustSection.module.css';

const ICONS = { Scale, Lock, Users, Headphones };

/**
 * Fairness / trust strip (Ref_02 bottom row). Anchored as #trust because the
 * footer links to it.
 */
export default function TrustSection() {
  return (
    <section className={`container ${styles.wrap}`} aria-labelledby="trust-heading">
      <div id="trust" className="vl-anchor-offset">
        <h2 id="trust-heading" className={styles.title}>
          Why members trust VELOOP Rewards
        </h2>
        <ul className={styles.grid}>
          {TRUST.map(({ icon, label }) => {
            const Icon = ICONS[icon] ?? ShieldCheck;
            return (
              <li key={label} className={styles.item}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className={styles.label}>{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
