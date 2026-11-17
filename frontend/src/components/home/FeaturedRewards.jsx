import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getFeaturedGiveaways } from '../../services/giveawayService.js';
import { getPrizeType } from '../../config/prizeTypes.js';
import { formatCount, formatDate } from '../../utils/format.js';
import SectionHeading from '../common/SectionHeading.jsx';
import Reveal from '../common/Reveal.jsx';
import Skeleton from '../common/Skeleton.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import PrizeMedia from './PrizeMedia.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Countdown from '../common/Countdown.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import styles from './FeaturedRewards.module.css';

/**
 * Featured rewards — image-first editorial grid with deliberately varied card
 * proportions (one feature, two companions, then equal thirds).
 *
 * Only verified values are shown: the draw's own title, tagline, status, entry
 * fee and participant count from the service. Brand names and reward values are
 * NOT displayed because the API/models carry no such field — nothing is invented.
 */
export default function FeaturedRewards() {
  const { data, loading, error, reload } = useAsync(getFeaturedGiveaways, []);
  const items = (data ?? []).slice(0, 5);

  return (
    <section className={`container ${styles.section}`} aria-labelledby="featured-rewards-heading">
      <SectionHeading
        eyebrow="Curated collection"
        title="Featured rewards"
        subtitle="The draws currently open for entry, presented in full. Each card carries its own status, entry fee and closing date."
        link={{ to: '/giveaways', label: 'All giveaways' }}
      />
      <h2 id="featured-rewards-heading" className="vl-visually-hidden">
        Featured rewards
      </h2>

      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true">
          <Skeleton variant="card" count={3} />
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load featured rewards"
          message={error.message}
          onRetry={reload}
        />
      ) : !items.length ? (
        <EmptyState
          title="No draw is open right now"
          message="A new round is being prepared. Explore the archive or the winner wall in the meantime."
        />
      ) : (
        <div className={styles.grid} data-count={Math.min(items.length, 3)}>
          {items.map((giveaway, i) => (
            <Reveal
              key={giveaway.slug}
              className={`${styles.cell} ${styles[`cell${i}`] ?? ''}`}
              delay={Math.min(i, 4) * 60}
            >
              <RewardCard giveaway={giveaway} feature={i === 0} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

function RewardCard({ giveaway, feature = false }) {
  const { slug, title, tagline, status, endingSoon, participants, entry, endsAt, prizeType } =
    giveaway;

  return (
    <article className={`${styles.card} ${feature ? styles.cardFeature : ''}`}>
      <div className={styles.media}>
        <PrizeMedia
          giveaway={giveaway}
          categoryLabel={getPrizeType(prizeType).label}
          ratio={feature ? 'wide' : 'landscape'}
          priority={feature}
        />
        <span className={styles.badge}>
          <StatusBadge status={status} endingSoon={endingSoon} />
        </span>
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link to={`/giveaways/${slug}`} className={styles.titleLink}>
            {title}
          </Link>
        </h3>
        {tagline ? <p className={styles.tagline}>{tagline}</p> : null}

        <dl className={styles.meta}>
          <div className={styles.metaItem}>
            <dt>Entry</dt>
            <dd>
              {entry ? <FeeBadges entry={entry} /> : <span className="vl-muted">Unavailable</span>}
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Participants</dt>
            <dd className="vl-num">{formatCount(participants)}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>{status === 'active' ? 'Closes' : status === 'upcoming' ? 'Opens' : 'Closed'}</dt>
            <dd>{endsAt ? formatDate(endsAt) : '—'}</dd>
          </div>
        </dl>

        <div className={styles.foot}>
          {status === 'active' ? <Countdown endsAt={endsAt} variant="chip" /> : <span />}
          <Link
            to={`/giveaways/${slug}`}
            className="vl-btn vl-btn-outline vl-btn-sm"
            aria-label={`View giveaway: ${title}`}
          >
            View Giveaway
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
