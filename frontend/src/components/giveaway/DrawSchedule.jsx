import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Users,
  Gift,
  Smartphone,
  Watch,
  Headphones,
  Gamepad2,
  ShoppingBag,
  CarFront,
  UtensilsCrossed,
} from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getGiveaways } from '../../services/giveawayService.js';
import { formatCount, formatDate } from '../../utils/format.js';
import StatusBadge from '../common/StatusBadge.jsx';
import Countdown from '../common/Countdown.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import Skeleton from '../common/Skeleton.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import Reveal from '../common/Reveal.jsx';
import styles from './DrawSchedule.module.css';

const ICONS = {
  Smartphone,
  Watch,
  Headphones,
  Gift,
  Gamepad2,
  ShoppingBag,
  CarFront,
  UtensilsCrossed,
};

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ended', label: 'Ended' },
  { key: 'all', label: 'All draws' },
];

/**
 * Active & upcoming giveaways as a tabbed draw schedule. Every row is real
 * service data (lifecycle state, timestamps, participants, entry fee) and links
 * to its detail page — this list never starts a participation flow itself.
 */
export default function DrawSchedule() {
  const { data, loading, error, reload } = useAsync(getGiveaways, []);
  const [tab, setTab] = useState('active');

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === 'all') return data;
    return data.filter((g) => g.status === tab);
  }, [data, tab]);

  const counts = useMemo(() => {
    const base = { all: data?.length ?? 0, active: 0, upcoming: 0, ended: 0 };
    for (const g of data ?? []) base[g.status] = (base[g.status] ?? 0) + 1;
    return base;
  }, [data]);

  return (
    <section className={`${styles.section} container`} aria-labelledby="schedule-heading">
      <div className={styles.head}>
        <div>
          <p className="vl-eyebrow">Draw calendar</p>
          <h2 id="schedule-heading" className={`vl-h2 ${styles.title}`}>
            Active &amp; upcoming giveaways
          </h2>
        </div>

        <div className={styles.tablist} role="tablist" aria-label="Filter draws by state">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              <span className={styles.count}>{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.list} aria-busy="true">
          <Skeleton variant="blocks" count={4} />
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load the draw schedule" message={error.message} onRetry={reload} />
      ) : !rows.length ? (
        <EmptyState
          title={tab === 'all' ? 'No draws yet' : `No ${labelFor(tab)} draws right now`}
          message="Draws move between upcoming, active and ended automatically as their configured timestamps pass."
        />
      ) : (
        <ul className={styles.list}>
          {rows.map((g, i) => {
            const Icon = ICONS[g.icon] ?? Gift;
            const open = g.status === 'active';
            return (
              <Reveal
                as="li"
                key={g.slug}
                className={styles.item}
                delay={Math.min(i, 8) * 40}
              >
                <Link to={`/giveaways/${g.slug}`} className={styles.row}>
                  <span className={`${styles.tile} ${styles[g.accent] ?? ''}`} aria-hidden="true">
                    <Icon size={22} strokeWidth={1.5} />
                  </span>

                  <span className={styles.main}>
                    <span className={styles.rowTitle}>{g.title}</span>
                    <span className={styles.rowTagline}>{g.tagline}</span>
                  </span>

                  <span className={styles.meta}>
                    <span className={styles.metaItem}>
                      <Users size={13} aria-hidden="true" />
                      {formatCount(g.participants)}
                    </span>
                    <span className={styles.metaItem}>
                      {g.status === 'upcoming'
                        ? `Opens ${formatDate(g.startsAt)}`
                        : `Closed ${formatDate(g.endsAt)}`}
                    </span>
                  </span>

                  <span className={styles.status}>
                    <StatusBadge status={g.status} endingSoon={g.endingSoon} />
                  </span>

                  <span className={styles.timing}>
                    {open && g.endsAt ? (
                      <Countdown endsAt={g.endsAt} variant="chip" />
                    ) : (
                      <FeeBadges entry={g.entry} />
                    )}
                  </span>

                  <span className={styles.chevron} aria-hidden="true">
                    <ArrowRight size={16} />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function labelFor(key) {
  return TABS.find((t) => t.key === key)?.label.toLowerCase() ?? key;
}
