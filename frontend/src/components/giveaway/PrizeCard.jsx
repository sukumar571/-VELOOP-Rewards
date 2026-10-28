import { Link } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { formatCount } from '../../utils/format.js';
import PrizeVisual from '../common/PrizeVisual.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Countdown from '../common/Countdown.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import styles from './PrizeCard.module.css';

/** Per-status label for the card's single action. Every variant is a pure
 *  navigation to that prize's detail page — a card NEVER joins a giveaway. */
const ACTION_LABEL = {
  active: 'Join Now',
  upcoming: 'View Details',
  ended: 'View Result',
  cancelled: 'View Details',
};

/**
 * Prize card for one giveaway (Ref_02 featured grid).
 * "Join Now" is a <Link> to /giveaways/:slug — entry (auth + wallet fees)
 * only ever happens on the detail page after backend integration.
 */
export default function PrizeCard({ giveaway }) {
  const { slug, title, tagline, status, endingSoon, participants, endsAt, entry } = giveaway;
  const actionLabel = ACTION_LABEL[status] ?? 'View Details';

  return (
    <article className={`vl-card ${styles.card}`}>
      <div className={styles.visual}>
        <PrizeVisual giveaway={giveaway} size="card" />
        <StatusBadge status={status} endingSoon={endingSoon} className={styles.badge} />
        {status === 'active' ? (
          <Countdown endsAt={endsAt} variant="chip" className={styles.countdown} />
        ) : null}
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <Link to={`/giveaways/${slug}`} className={styles.titleLink}>
            {title}
          </Link>
        </h3>
        <p className={styles.tagline}>{tagline}</p>

        <div className={styles.metaRow}>
          <span className={styles.meta} title="Participants (demo data)">
            <Users size={14} aria-hidden="true" />
            {formatCount(participants)}
          </span>
          <FeeBadges entry={entry} />
        </div>

        <Link
          to={`/giveaways/${slug}`}
          className={`vl-btn ${status === 'active' ? 'vl-btn-cta' : 'vl-btn-outline'} ${styles.join}`}
          aria-label={`${actionLabel}: ${title}`}
        >
          {actionLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
