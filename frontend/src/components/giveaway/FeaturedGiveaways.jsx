import { useAsync } from '../../hooks/useAsync.js';
import { getFeaturedGiveaways } from '../../services/giveawayService.js';
import SectionHeading from '../common/SectionHeading.jsx';
import GiveawayLoader from '../common/GiveawayLoader.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import PrizeCard from './PrizeCard.jsx';
import styles from './FeaturedGiveaways.module.css';

/**
 * Homepage featured grid — ACTIVE draws from the service layer only.
 * Loading (skeletons), empty and error (retry) states are all explicit.
 */
export default function FeaturedGiveaways() {
  const { data, loading, error, reload } = useAsync(getFeaturedGiveaways, []);

  return (
    <section className={`vl-section container ${styles.section}`} aria-labelledby="featured-heading">
      <div id="giveaways" className="vl-anchor-offset">
        <SectionHeading
          eyebrow="Handpicked draws"
          title="Featured Giveaways"
          subtitle="Live prize draws you can join right now — tap a prize to open its entry page."
          link={{ to: '/giveaways', label: 'View All Giveaways' }}
        />
        <h2 id="featured-heading" className="visually-hidden">
          Featured giveaways
        </h2>

        <div className={styles.grid} aria-busy={loading || undefined}>
          {loading ? (
            <div className={styles.state}>
              <GiveawayLoader />
            </div>
          ) : error ? (
            <div className={styles.state}>
              <ErrorState
                title="Couldn't load giveaways"
                message={error.message}
                onRetry={reload}
              />
            </div>
          ) : data.length === 0 ? (
            <div className={styles.state}>
              <EmptyState
                title="No live draws right now"
                message="A new giveaway round is being prepared — browse the winner wall in the meantime."
              />
            </div>
          ) : (
            data.map((giveaway) => (
              <div key={giveaway.slug} className={styles.gridItem}>
                <PrizeCard giveaway={giveaway} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
