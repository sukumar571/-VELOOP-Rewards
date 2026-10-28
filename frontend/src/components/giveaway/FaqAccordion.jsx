import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getFaqs } from '../../services/giveawayService.js';
import SectionHeading from '../common/SectionHeading.jsx';
import Skeleton from '../common/Skeleton.jsx';
import ErrorState from '../common/ErrorState.jsx';
import EmptyState from '../common/EmptyState.jsx';
import styles from './FaqAccordion.module.css';

/**
 * Accessible FAQ accordion: one button per question with aria-expanded /
 * aria-controls, panels are regions hidden from AT when collapsed, and a
 * single item is open at a time (clicking the open one closes it).
 */
export default function FaqAccordion() {
  const { data, loading, error, reload } = useAsync(getFaqs, []);
  const [openIndex, setOpenIndex] = useState(0);
  const uid = useId();

  return (
    <section className={styles.section} aria-labelledby="faq-heading">
      <div className="container">
        <SectionHeading
          eyebrow="Good questions"
          title="Frequently Asked Questions"
          subtitle="Everything members usually ask before joining their first draw."
        />
        <h2 id="faq-heading" className="visually-hidden">
          Frequently asked questions
        </h2>

        {loading ? (
          <div className={styles.list} aria-busy="true">
            <Skeleton variant="blocks" count={4} />
          </div>
        ) : error ? (
          <ErrorState title="FAQs unavailable" message={error.message} onRetry={reload} />
        ) : !data.length ? (
          <EmptyState title="No questions yet" message="FAQs will appear here soon." />
        ) : (
          <div className={styles.list}>
            {data.map((faq, i) => {
              const open = i === openIndex;
              const btnId = `${uid}-q${i}`;
              const panelId = `${uid}-a${i}`;
              return (
                <div key={faq.q} className={`${styles.item} vl-card ${open ? styles.open : ''}`}>
                  <h3 className={styles.qHead}>
                    <button
                      type="button"
                      id={btnId}
                      className={styles.qBtn}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => setOpenIndex(open ? -1 : i)}
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={styles.chev}
                        size={18}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={btnId}
                    hidden={!open}
                    className={styles.panel}
                  >
                    <p className={styles.aText}>{faq.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
