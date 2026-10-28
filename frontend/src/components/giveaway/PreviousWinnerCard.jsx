import { Link } from 'react-router-dom';
import { CalendarDays, Gift, Lock, Trophy } from 'lucide-react';
import { formatDate } from '../../utils/format.js';
import styles from './PreviousWinnerCard.module.css';

/**
 * Historical winner record: giveaway name, prize, announcement date and the
 * masked identity only. Kept linked to its ORIGINAL giveaway (giveawayId
 * travels with the record from the service layer; live draws link to their
 * detail page, archived draws render plain text).
 */
export default function PreviousWinnerCard({ winner }) {
  const {
    giveawayId,
    giveawayTitle,
    giveawaySlug,
    prize,
    maskedUserId,
    displayAlias,
    announcedAt,
    deliveryStatus,
  } = winner;

  const title = giveawaySlug ? (
    <Link to={`/giveaways/${giveawaySlug}`} className={styles.giveaway}>
      {giveawayTitle}
    </Link>
  ) : (
    <span className={styles.giveawayArchived}>{giveawayTitle}</span>
  );

  return (
    <article
      className={`vl-card ${styles.card}`}
      data-giveaway-id={giveawayId}
      aria-label={`Previous winner of ${giveawayTitle}`}
    >
      <header className={styles.top}>
        <h3 className={styles.title}>{title}</h3>
        <span className={styles.date}>
          <CalendarDays size={13} aria-hidden="true" />
          {formatDate(announcedAt)}
        </span>
      </header>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>
            <Trophy size={13} aria-hidden="true" /> Prize
          </dt>
          <dd>{prize}</dd>
        </div>
        <div className={styles.row}>
          <dt>
            <Gift size={13} aria-hidden="true" /> Winner
          </dt>
          <dd>
            <span className={styles.alias}>{displayAlias}</span>{' '}
            <span className={styles.maskedId}>
              <Lock size={11} aria-hidden="true" />
              {maskedUserId}
            </span>
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Status</dt>
          <dd>
            <span className={styles.delivery}>{deliveryStatus}</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}
