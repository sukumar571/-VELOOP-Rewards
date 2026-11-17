import { Scale, ShieldCheck, ReceiptText, ListChecks, Lock } from 'lucide-react';
import { EXPERIENCE } from '../../content/site.js';
import SectionHeading from '../common/SectionHeading.jsx';
import Reveal from '../common/Reveal.jsx';
import styles from './Experience.module.css';

const ICONS = { Scale, ShieldCheck, ReceiptText, ListChecks, Lock };

/**
 * "What makes VELOOP different" — every statement here maps to behaviour the
 * application implements (server-authoritative pricing, eligibility checks,
 * idempotent charging, ledger records, role-protected admin). No marketing
 * statistics, testimonials or unbuilt promises.
 */
export default function Experience() {
  return (
    <section className={`container ${styles.section}`} aria-labelledby="experience-heading">
      <SectionHeading eyebrow={EXPERIENCE.eyebrow} title={EXPERIENCE.title} />
      <h2 id="experience-heading" className="vl-visually-hidden">
        {EXPERIENCE.title}
      </h2>
      <p className={styles.intro}>{EXPERIENCE.subtitle}</p>

      <ol className={styles.list}>
        {EXPERIENCE.items.map((item, i) => {
          const Icon = ICONS[item.icon] ?? Scale;
          return (
            <Reveal as="li" key={item.title} className={styles.item} delay={Math.min(i, 4) * 60}>
              <span className={styles.index} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className={styles.body}>
                <h3 className={styles.title}>
                  <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                  {item.title}
                </h3>
                <p className={styles.text}>{item.text}</p>
              </div>
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}
