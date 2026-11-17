import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAsync } from '../hooks/useAsync.js';
import { getGiveaways } from '../services/giveawayService.js';
import { getPrizeType } from '../config/prizeTypes.js';
import { formatCount, formatDate } from '../utils/format.js';
import PageHeader from '../components/common/PageHeader.jsx';
import GiveawayCard from '../components/giveaway/GiveawayCard.jsx';
import PrizeCardSkeleton from '../components/giveaway/PrizeCardSkeleton.jsx';
import Reveal from '../components/common/Reveal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import PrizeMedia from '../components/home/PrizeMedia.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Countdown from '../components/common/Countdown.jsx';
import FeeBadges from '../components/common/FeeBadges.jsx';
import styles from './Giveaways.module.css';

const TAB_STATUS = { all: null, active: 'active', upcoming: 'upcoming', completed: 'ended' };

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

const SORTS = [
  { key: 'ending', label: 'Closing soonest' },
  { key: 'newest', label: 'Newest first' },
  { key: 'participants', label: 'Most participants' },
  { key: 'title', label: 'A–Z' },
];

const PAGE_SIZE = 9;

/** Map legacy URL filters (?filter=ending_soon from the footer) onto the tabs. */
function readFilter(raw) {
  if (raw === 'ending_soon') return 'active';
  return Object.prototype.hasOwnProperty.call(TAB_STATUS, raw) ? raw : 'all';
}

/**
 * Giveaway listing — premium discovery.
 *
 * Reads the same service as before (getGiveaways → GET /api/v1/giveaways plus
 * per-draw prize tiers). Filtering, category, search, sorting and pagination are
 * applied to that payload client-side; no endpoint or contract changes.
 */
export default function GiveawaysPage() {
  const [params, setParams] = useSearchParams();
  const urlFilter = params.get('filter');

  const [tab, setTab] = useState(() => readFilter(urlFilter));
  const [endingOnly, setEndingOnly] = useState(urlFilter === 'ending_soon');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('ending');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (urlFilter) {
      setTab(readFilter(urlFilter));
      setEndingOnly(urlFilter === 'ending_soon');
    }
  }, [urlFilter]);

  const { data, loading, error, reload } = useAsync(getGiveaways, []);
  const all = data ?? [];

  const pickTab = (key) => {
    setTab(key);
    setEndingOnly(false);
    setPage(1);
    setParams(key === 'all' ? {} : { filter: key }, { replace: true });
  };

  const categories = useMemo(() => {
    const seen = new Map();
    for (const g of all) {
      const key = g.prizeType || 'device';
      if (!seen.has(key)) seen.set(key, getPrizeType(key).label);
    }
    return [...seen.entries()];
  }, [all]);

  const counts = useMemo(() => {
    const base = { all: all.length };
    for (const key of ['active', 'upcoming', 'completed']) {
      base[key] = all.filter((g) => g.status === TAB_STATUS[key]).length;
    }
    return base;
  }, [all]);

  const featured = useMemo(
    () =>
      all
        .filter((g) => g.status === 'active')
        .sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0))[0] ?? null,
    [all],
  );

  const filtered = useMemo(() => {
    const status = TAB_STATUS[tab];
    const needle = query.trim().toLowerCase();
    const list = all.filter((g) => {
      if (status && g.status !== status) return false;
      if (endingOnly && !g.endingSoon) return false;
      if (category !== 'all' && (g.prizeType || 'device') !== category) return false;
      if (!needle) return true;
      return `${g.title} ${g.tagline}`.toLowerCase().includes(needle);
    });

    const by = {
      ending: (a, b) =>
        tab === 'completed' ? (b.endsAt ?? 0) - (a.endsAt ?? 0) : (a.endsAt ?? 0) - (b.endsAt ?? 0),
      newest: (a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0),
      participants: (a, b) => (b.participants ?? 0) - (a.participants ?? 0),
      title: (a, b) => a.title.localeCompare(b.title),
    }[sort];

    return [...list].sort(by);
  }, [all, tab, endingOnly, category, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const liveCount = counts.active ?? 0;

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Exclusive Giveaways"
        title="The Giveaway"
        gradientWord="Collection"
        subtitle="Explore every open draw, its entry fee and its closing date. Cards open the full detail page — joining always happens there, with the fee verified by the server."
      />

      <p className={styles.stats}>
        <span className={styles.statsDot} aria-hidden="true" />
        {loading
          ? 'Loading draws…'
          : `${liveCount} live ${liveCount === 1 ? 'draw' : 'draws'} · ${formatCount(
              all.reduce((s, g) => s + (g.participants || 0), 0),
            )} participants recorded`}
      </p>

      {featured && !loading ? <FeaturedBanner giveaway={featured} /> : null}

      {/* ---- Toolbar ---- */}
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              aria-pressed={tab === t.key}
              onClick={() => pickTab(t.key)}
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
            <span className="vl-visually-hidden">Search giveaways</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search prizes or draws"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className={styles.sortWrap}>
            <span className="vl-visually-hidden">Sort giveaways</span>
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
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

      <div className={styles.chips} role="group" aria-label="Filter by category">
        <button
          type="button"
          className={`${styles.chip} ${category === 'all' ? styles.chipActive : ''}`}
          aria-pressed={category === 'all'}
          onClick={() => {
            setCategory('all');
            setPage(1);
          }}
        >
          All categories
        </button>
        {categories.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.chip} ${category === key ? styles.chipActive : ''}`}
            aria-pressed={category === key}
            onClick={() => {
              setCategory(key);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.chip} ${endingOnly ? styles.chipActive : ''}`}
          aria-pressed={endingOnly}
          onClick={() => {
            setEndingOnly((v) => !v);
            setPage(1);
          }}
        >
          Ending soon
        </button>
        <DemoNotice variant="chip" />
      </div>

      {/* ---- Results ---- */}
      {loading ? (
        <div className={styles.grid} aria-busy="true">
          <PrizeCardSkeleton count={6} />
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load giveaways" message={error.message} onRetry={reload} />
      ) : !shown.length ? (
        <EmptyState
          title={query ? 'No draw matches that search' : 'Nothing here yet'}
          message={
            query
              ? 'Try a different prize name, or clear the search to see the whole collection.'
              : 'Draws move between upcoming, active and completed automatically as their dates pass.'
          }
        />
      ) : (
        <>
          <div className={styles.grid}>
            {shown.map((g, i) => (
              <Reveal key={g.slug} className={styles.gridItem} delay={Math.min(i, 6) * 50}>
                <GiveawayCard giveaway={g} priority={i < 3} />
              </Reveal>
            ))}
          </div>

          {totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Giveaway pages">
              <button
                type="button"
                className="vl-btn vl-btn-outline vl-btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={current === 1}
              >
                Previous
              </button>
              <span className={styles.pageLabel}>
                Page {current} of {totalPages}
              </span>
              <button
                type="button"
                className="vl-btn vl-btn-outline vl-btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={current === totalPages}
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Editorial feature band — the soonest-closing live draw. */
function FeaturedBanner({ giveaway }) {
  const { slug, title, tagline, endsAt, entry, participants, endingSoon, status } = giveaway;

  return (
    <article className={styles.featured}>
      <div className={styles.featuredMedia}>
        <PrizeMedia
          giveaway={giveaway}
          categoryLabel={getPrizeType(giveaway.prizeType).label}
          ratio="wide"
          priority
        />
        <span className={styles.featuredBadge}>
          <StatusBadge status={status} endingSoon={endingSoon} />
        </span>
      </div>

      <div className={styles.featuredBody}>
        <p className={styles.featuredEyebrow}>Featured draw</p>
        <h2 className={styles.featuredTitle}>
          <Link to={`/giveaways/${slug}`}>{title}</Link>
        </h2>
        {tagline ? <p className={styles.featuredTagline}>{tagline}</p> : null}

        <dl className={styles.featuredFacts}>
          <div>
            <dt>Entry</dt>
            <dd>{entry ? <FeeBadges entry={entry} /> : <span className="vl-faint">Unavailable</span>}</dd>
          </div>
          <div>
            <dt>Participants</dt>
            <dd className="vl-num">{formatCount(participants)}</dd>
          </div>
          <div>
            <dt>Closes</dt>
            <dd>{endsAt ? formatDate(endsAt) : '—'}</dd>
          </div>
        </dl>

        <div className={styles.featuredFoot}>
          {endsAt ? <Countdown endsAt={endsAt} variant="blocks" /> : null}
          <Link to={`/giveaways/${slug}`} className="vl-btn vl-btn-cta">
            View Details
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
