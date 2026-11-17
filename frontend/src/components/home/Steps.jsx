import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { STEPS } from '../../content/site.js';
import SectionHeading from '../common/SectionHeading.jsx';
import Reveal from '../common/Reveal.jsx';
import styles from './Steps.module.css';

/**
 * How it works — the four real stages of an entry: sign in, choose a draw,
 * have the entry validated and charged server-side, then wait for the draw.
 * Copy comes from content/site.js (STEPS) so it stays in one place.
 */
export default function Steps() {
  return (
    <section className={styles.section} aria-labelledby="steps-heading">
      <div className="container">
        <SectionHeading
          eyebrow="The process"
          title="How it works"
          subtitle="Four steps, no hidden mechanics. The server validates every entry before anything is charged."
        />
        <h2 id="steps-heading" className="vl-visually-hidden">
          How it works
        </h2>

        <ol className={styles.list}>
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} className={styles.step} delay={i * 60}>
              <span className={styles.num} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.text}>{step.text}</p>
            </Reveal>
          ))}
        </ol>

        <p className={styles.cta}>
          <Link to="/giveaways" className="vl-btn vl-btn-outline">
            Browse open draws
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}
