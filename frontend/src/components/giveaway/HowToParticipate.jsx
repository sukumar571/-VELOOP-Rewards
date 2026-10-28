import { UserPlus, ListChecks, Ticket, Trophy } from 'lucide-react';
import { STEPS } from '../../content/site.js';
import SectionHeading from '../common/SectionHeading.jsx';
import styles from './HowToParticipate.module.css';

const ICONS = { UserPlus, ListChecks, Ticket, Trophy };

/**
 * "How to Participate?" numbered steps (Ref_02).
 */
export default function HowToParticipate() {
  return (
    <div id="how-it-works" className="vl-anchor-offset">
      <SectionHeading
        eyebrow="Simple by design"
        title="How to Participate?"
        subtitle="Four steps from sign-in to a prize at your door — every draw is audited and every entry is a fair chance."
      />

      <ol className={styles.grid}>
        {STEPS.map((step, i) => {
          const Icon = ICONS[step.icon] ?? Trophy;
          return (
            <li key={step.title} className={styles.step}>
              <div className={styles.stepTop}>
                <span className={styles.num} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.iconWrap} aria-hidden="true">
                  <Icon size={20} />
                </span>
              </div>
              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.text}>{step.text}</p>
              {i < STEPS.length - 1 ? (
                <span className={styles.connector} aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
