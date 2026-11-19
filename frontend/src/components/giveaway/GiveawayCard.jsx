import { Link } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { formatCount } from '../../utils/format.js';
import PrizeMedia from '../home/PrizeMedia.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Countdown from '../common/Countdown.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import { getPrizeType } from '../../config/prizeTypes.js';
import styles from './GiveawayCard.module.css';

/**
 * Canonical discovery card.
 *
 * Image-first: the reward's own photograph when supplied (src/assets via
 * PrizeMedia), otherwise the composed monogram plate. Shows only verified data
 * — the draw's title, tagline, lifecycle status, entry fee, participant count
 * and closing date. A countdown renders only when the API supplied an end date
 * for a live draw. The card is navigation only; it never joins a giveaway.
 */
export default function GiveawayCard({ giveaway, priority = false }) {
  const { slug, title, tagline, status, endingSoon, participants, entry, endsAt, prizeType } =
    giveaway;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <PrizeMedia
          giveaway={giveaway}
          categoryLabel={getPrizeType(prizeType).label}
          ratio="landscape"
          priority={priority}
        />
        <span className={styles.badge}>
          <StatusBadge status={status} endingSoon={endingSoon} />
        </span>
        {status === 'active' && endsAt ? (
          <span className={styles.countdown}>
            <Countdown endsAt={endsAt} variant="chip" />
          </span>
        ) : null}
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link to={`/giveaways/${slug}`} className={styles.titleLink}>
            {title}
          </Link>
        </h3>
        {tagline ? <p className={styles.tagline}>{tagline}</p> : null}

        <div className={styles.meta}>
          <span className={styles.participants} title="Recorded participants">
            <Users size={14} aria-hidden="true" />
            {formatCount(participants)}
          </span>
          <span className={styles.entry}>
            {entry ? <FeeBadges entry={entry} /> : <span className="vl-faint">Entry unavailable</span>}
          </span>
        </div>

        <Link
          to={`/giveaways/${slug}`}
          className={`vl-btn vl-btn-cta vl-btn-sm ${styles.cta}`}
          aria-label={`View details: ${title}`}
        >
          View Details
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
