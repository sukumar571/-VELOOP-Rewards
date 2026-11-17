import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Users,
  Trophy,
  CalendarClock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getFeaturedGiveaways } from '../../services/giveawayService.js';
import { formatCount, formatDate } from '../../utils/format.js';
import PrizeVisual from '../common/PrizeVisual.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import Countdown from '../common/Countdown.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import Skeleton from '../common/Skeleton.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import EligibilityList from './EligibilityList.jsx';
import styles from './FeaturedSpotlight.module.css';

/**
 * Featured giveaway spotlight — the soonest-closing ACTIVE draw straight from
 * the service layer. Shows real entry configuration (fee/currency), real
 * lifecycle timestamps, real counts and the programme's eligibility copy.
 * It never invents a prize value, winner or statistic.
 */
export default function FeaturedSpotlight() {
  const { data, loading, error, reload } = useAsync(getFeaturedGiveaways, []);
  const featured = data?.[0] ?? null;

  return (
    <section className={`${styles.section} container`} aria-labelledby="spotlight-heading">
      <div className={styles.head}>
        <div>
          <p className="vl-eyebrow">Featured draw</p>
          <h2 id="spotlight-heading" className={`vl-h2 ${styles.headTitle}`}>
            The one everyone is watching
          </h2>
        </div>
        <Link to="/giveaways" className="vl-btn vl-btn-outline vl-btn-sm">
          All giveaways
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className={`vl-card ${styles.state}`} aria-busy="true">
          <Skeleton variant="blocks" count={4} />
        </div>
      ) : error ? (
        <div className={`vl-card ${styles.state}`}>
          <ErrorState
            title="Couldn't load the featured draw"
            message={error.message}
            onRetry={reload}
          />
        </div>
      ) : !featured ? (
        <div className={`vl-card ${styles.state}`}>
          <EmptyState
            title="No live draw at the moment"
            message="A new giveaway round is being prepared. Upcoming draws appear on the giveaways page as soon as entries are scheduled."
          />
        </div>
      ) : (
        <SpotlightCard giveaway={featured} />
      )}
    </section>
  );
}

function SpotlightCard({ giveaway }) {
  const {
    slug,
    title,
    tagline,
    description,
    status,
    endingSoon,
    participants,
    winners,
    endsAt,
    entry,
  } = giveaway;

  return (
    <article className={`vl-card vl-card--lit ${styles.card}`}>
      <div className={styles.mediaCol}>
        <PrizeVisual giveaway={giveaway} size="hero" className={styles.visual} />
        <div className={styles.mediaOverlay}>
          <StatusBadge status={status} endingSoon={endingSoon} />
          <span className={styles.mediaHint}>
            <Sparkles size={13} aria-hidden="true" />
            Prize render
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.tagline}>{tagline}</p>
        {description ? <p className={styles.description}>{description}</p> : null}

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>
              <Users size={14} aria-hidden="true" /> Participants
            </dt>
            <dd>{formatCount(participants)}</dd>
          </div>
          <div className={styles.fact}>
            <dt>
              <Trophy size={14} aria-hidden="true" /> Winners
            </dt>
            <dd>{winners}</dd>
          </div>
          <div className={styles.fact}>
            <dt>
              <CalendarClock size={14} aria-hidden="true" /> Entries close
            </dt>
            <dd>{endsAt ? formatDate(endsAt) : '—'}</dd>
          </div>
        </dl>

        <div className={styles.timerRow}>
          <span className={styles.timerLabel}>Entries close in</span>
          {endsAt ? <Countdown endsAt={endsAt} variant="blocks" /> : null}
        </div>

        <div className={styles.entryRow}>
          <div className={styles.entry}>
            <span className={styles.entryLabel}>Entry fee</span>
            <FeeBadges entry={entry} size="lg" />
          </div>
          <Link
            to={`/giveaways/${slug}`}
            className={`vl-btn vl-btn-cta vl-btn-lg ${styles.join}`}
          >
            Enter this giveaway
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>

        <div className={styles.eligibility}>
          <h4 className={styles.eligibilityTitle}>
            <ShieldCheck size={15} aria-hidden="true" />
            Eligibility &amp; requirements
          </h4>
          <EligibilityList />
        </div>
      </div>
    </article>
  );
}
