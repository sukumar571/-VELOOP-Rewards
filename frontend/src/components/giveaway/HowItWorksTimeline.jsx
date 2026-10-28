import { Check } from 'lucide-react';
import styles from './HowItWorksTimeline.module.css';

/**
 * Accessible "How This Giveaway Works" timeline — a semantic ordered list so
 * screen readers announce step order. Steps are generated from giveaway config
 * (see src/config/howItWorks.js), not hand-written per prize.
 */
export default function HowItWorksTimeline({ steps = [] }) {
  if (!steps.length) return null;
  return (
    <ol className={styles.list}>
      {steps.map((step, i) => (
        <li key={step.title} className={styles.item}>
          <span className={styles.marker} aria-hidden="true">
            <Check size={15} />
          </span>
          <div className={styles.content}>
            <span className={styles.stepLabel}>Step {i + 1}</span>
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.text}>{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
