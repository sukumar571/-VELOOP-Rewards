import { ScrollText } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getProgrammeRules } from '../../services/giveawayService.js';
import SectionHeading from '../common/SectionHeading.jsx';
import Skeleton from '../common/Skeleton.jsx';
import ErrorState from '../common/ErrorState.jsx';
import styles from './GiveawayRules.module.css';

/**
 * Programme rules & entry information (service-backed, so the copy can move
 * to a CMS/API later without touching this component).
 */
export default function GiveawayRules() {
  const { data, loading, error, reload } = useAsync(getProgrammeRules, []);

  return (
    <section className={styles.section} aria-labelledby="rules-heading">
      <div className="container">
        <SectionHeading
          eyebrow="Play fair, win fair"
          title="Giveaway Rules"
          subtitle="How entries, draws and winner announcements work across every VELOOP giveaway."
        />
        <h2 id="rules-heading" className="visually-hidden">
          Giveaway rules
        </h2>

        {loading ? (
          <div className={styles.list} aria-busy="true">
            <Skeleton variant="blocks" count={5} />
          </div>
        ) : error ? (
          <ErrorState title="Rules unavailable" message={error.message} onRetry={reload} />
        ) : (
          <ol className={styles.list}>
            {data.map((rule, i) => (
              <li key={rule.title} className={`${styles.rule} vl-card`}>
                <span className={styles.num} aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className={styles.ruleTitle}>
                    <ScrollText size={15} aria-hidden="true" />
                    {rule.title}
                  </h3>
                  <p className={styles.ruleText}>{rule.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
