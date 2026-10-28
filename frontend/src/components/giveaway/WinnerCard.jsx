import { Link } from 'react-router-dom';
import { Trophy, BadgeCheck, UserRoundSearch } from 'lucide-react';
import { formatDate } from '../../utils/format.js';
import styles from './WinnerCard.module.css';

/**
 * One announced winner, shown in the slider and winner lists.
 * Identity is rendered ONLY from masked fields (displayAlias / maskedUserId)
 * supplied by the service layer — raw names/emails/phones never reach this
 * component, so a non-masked value cannot accidentally be displayed.
 */
export default function WinnerCard({ winner, compact = false }) {
  const { displayAlias, maskedUserId, prize, giveawayTitle, giveawaySlug, announcedAt, deliveryStatus } =
    winner;

  const title = giveawaySlug ? (
    <Link to={`/giveaways/${giveawaySlug}`} className={styles.giveawayLink}>
      {giveawayTitle}
    </Link>
  ) : (
    <span>{giveawayTitle}</span>
  );

  return (
    <article className={`vl-card ${styles.card}`} data-compact={compact || undefined}>
      <span className={styles.avatar} aria-hidden="true">
        <Trophy size={20} />
      </span>
      <div className={styles.info}>
        <p className={styles.name}>
          {displayAlias}
          <BadgeCheck size={16} aria-label="Verified winner" className={styles.verified} />
        </p>
        <p className={styles.userId}>
          <UserRoundSearch size={13} aria-hidden="true" />
          {maskedUserId}
        </p>
        <p className={styles.prize}>
          <Trophy size={14} aria-hidden="true" />
          {prize}
        </p>
        <p className={styles.meta}>
          {title} · {formatDate(announcedAt)}
        </p>
        <span className={styles.status}>{deliveryStatus}</span>
      </div>
    </article>
  );
}
