import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getGiveaways } from '../../services/giveawayService.js';
import { getPrizeType } from '../../config/prizeTypes.js';
import { formatCount, formatDate } from '../../utils/format.js';
import SectionHeading from '../common/SectionHeading.jsx';
import PrizeMedia from './PrizeMedia.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import FeeBadges from '../common/FeeBadges.jsx';
import Skeleton from '../common/Skeleton.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import styles from './Discovery.module.css';

const TABS = [
  { key: 'active', label: 'Active', status: 'active' },
  { key: 'upcoming', label: 'Upcoming', status: 'upcoming' },
  { key: 'completed', label: 'Completed', status: 'ended' },
];

const SORTS = [
  { key: 'ending', label: 'Closing soonest' },
  { key: 'newest', label: 'Newest first' },
  { key: 'entries', label: 'Most participants' },
];

/**
 * Discovery — the full collection, organised by lifecycle.
 * Everything is read from the existing giveaway service (same /api/v1 data the
 * listing page uses); filtering, search and sorting happen on that payload.
 */
export default function Discovery() {
  const { data, loading, error, reload } = useAsync(getGiveaways, []);
  const [tab, setTab] = useState('active');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('ending');

  const all = data ?? [];

  const counts = useMemo(
    () =>
      TABS.reduce((acc, t) => {
        acc[t.key] = all.filter((g) => g.status === t.status).length;
        return acc;
      }, {}),
    [all],
  );

  const categories = useMemo(() => {
    const seen = new Map();
    for (const g of all) {
      const key = g.prizeType || 'device';
      if (!seen.has(key)) seen.set(key, getPrizeType(key).label);
    }
    return [...seen.entries()];
  }, [all]);

  const items = useMemo(() => {
    const status = TABS.find((t) => t.key === tab)?.status;
    const needle = query.trim().toLowerCase();
    const list = all.filter((g) => {
      if (g.status !== status) return false;
      if (category !== 'all' && (g.prizeType || 'device') !== category) return false;
      if (!needle) return true;
      return `${g.title} ${g.tagline}`.toLowerCase().includes(needle);
    });

    const by = {
      ending: (a, b) =>
        tab === 'completed' ? (b.endsAt ?? 0) - (a.endsAt ?? 0) : (a.endsAt ?? 0) - (b.endsAt ?? 0),
      newest: (a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0),
      entries: (a, b) => (b.participants ?? 0) - (a.participants ?? 0),
    }[sort];

    return [...list].sort(by);
  }, [all, tab, category, query, sort]);

  return (
    <section className={`container ${styles.section}`} aria-labelledby="discovery-heading">
      <SectionHeading
        eyebrow="The collection"
        title="Explore every draw"
        subtitle="Active entries, upcoming rounds and completed draws — filtered by category, searchable by name."
      />
      <h2 id="discovery-heading" className="vl-visually-hidden">
        All giveaways
      </h2>

      <div className={styles.controls}>
        <div className={styles.tabs} role="group" aria-label="Giveaway status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className={styles.tabCount} aria-hidden="true">
                {loading ? '–' : counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.tools}>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <span className="vl-visually-hidden">Search giveaways</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by prize or draw"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <label className={styles.sort}>
            <span className="vl-visually-hidden">Sort giveaways</span>
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {categories.length > 1 ? (
        <div className={styles.chips} role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`${styles.chip} ${category === 'all' ? styles.chipActive : ''}`}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All categories
          </button>
          {categories.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${category === key ? styles.chipActive : ''}`}
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          <Skeleton variant="card" count={3} />
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load giveaways" message={error.message} onRetry={reload} />
      ) : !items.length ? (
        <EmptyState
          title={query ? 'No draw matches that search' : `No ${tab} giveaways`}
          message={
            query
              ? 'Try a different prize name, or clear the search to see the full collection.'
              : 'Draws move between upcoming, active and completed automatically as their dates pass.'
          }
        />
      ) : (
        <ul className={styles.grid}>
          {items.map((g) => (
            <li key={g.slug} className={styles.item}>
              <DiscoveryCard giveaway={g} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DiscoveryCard({ giveaway }) {
  const { slug, title, tagline, status, endingSoon, participants, entry, endsAt, prizeType } =
    giveaway;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <PrizeMedia
          giveaway={giveaway}
          categoryLabel={getPrizeType(prizeType).label}
          ratio="wide"
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

        <div className={styles.row}>
          <span className={styles.rowLabel}>Entry</span>
          {entry ? <FeeBadges entry={entry} /> : <span className="vl-faint">Unavailable</span>}
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>
            {status === 'active' ? 'Closes' : status === 'upcoming' ? 'Opens' : 'Closed'}
          </span>
          <span className={styles.rowValue}>{endsAt ? formatDate(endsAt) : '—'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Participants</span>
          <span className={`${styles.rowValue} vl-num`}>{formatCount(participants)}</span>
        </div>

        <Link
          to={`/giveaways/${slug}`}
          className={`vl-btn vl-btn-cta vl-btn-sm ${styles.cta}`}
          aria-label={`${status === 'active' ? 'View giveaway' : 'View details'}: ${title}`}
        >
          {status === 'active' ? 'View Giveaway' : 'View Details'}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
