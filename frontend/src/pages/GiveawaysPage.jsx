import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { getGiveaways } from '../services/giveawayService.js';
import PageHeader from '../components/common/PageHeader.jsx';
import PrizeCard from '../components/giveaway/PrizeCard.jsx';
import Skeleton from '../components/common/Skeleton.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import styles from './Giveaways.module.css';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'ending_soon', label: 'Ending soon' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ended', label: 'Ended' },
];

/**
 * Full giveaway listing ("Giveaway Section") with lifecycle-state filtering
 * driven by configured timestamps. Service-backed; deep-linkable via
 * /giveaways?filter=ending_soon (footer link).
 */
export default function GiveawaysPage() {
  const [params, setParams] = useSearchParams();
  const urlFilter = params.get('filter');
  const [filter, setFilter] = useState(
    FILTERS.some((f) => f.key === urlFilter) ? urlFilter : 'all',
  );

  // Keep chip state in sync when the query changes (e.g. footer deep link).
  useEffect(() => {
    if (FILTERS.some((f) => f.key === urlFilter)) setFilter(urlFilter);
  }, [urlFilter]);

  const { data, loading, error, reload } = useAsync(getGiveaways, []);

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data;
    if (filter === 'ending_soon') return data.filter((g) => g.endingSoon);
    return data.filter((g) => g.status === filter);
  }, [data, filter]);

  const onPick = (key) => {
    setFilter(key);
    setParams(key === 'all' ? {} : { filter: key }, { replace: true });
  };

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Exclusive Giveaways"
        title="Giveaway"
        gradientWord="Section"
        subtitle="Join exciting giveaways, complete simple tasks and win amazing rewards from VELOOP Rewards. More participation, more chances to win!"
      />

      <div className={styles.chips} role="group" aria-label="Filter giveaways by lifecycle state">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`${styles.chip} ${filter === key ? styles.chipActive : ''}`}
            aria-pressed={filter === key}
            onClick={() => onPick(key)}
          >
            {label}
          </button>
        ))}
        <DemoNotice variant="chip" />
      </div>

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={styles.gridItem}>
              <Skeleton variant="card" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load giveaways"
          message={error.message}
          onRetry={reload}
        />
      ) : shown.length ? (
        <div className={styles.grid}>
          {shown.map((g) => (
            <div key={g.slug} className={styles.gridItem}>
              <PrizeCard giveaway={g} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            filter === 'all'
              ? 'No giveaways yet'
              : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase() ?? ''} giveaways`
          }
          message="Draws move between upcoming, active and ended automatically as their configured timestamps pass — check back soon."
        />
      )}
    </div>
  );
}
