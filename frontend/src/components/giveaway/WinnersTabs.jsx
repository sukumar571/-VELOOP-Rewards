import { useCallback, useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import {
  getRecentWinners,
  getPreviousWinners,
} from '../../services/giveawayService.js';
import Skeleton from '../common/Skeleton.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import DemoNotice from '../common/DemoNotice.jsx';
import WinnerSlider from './WinnerSlider.jsx';
import PreviousWinnerCard from './PreviousWinnerCard.jsx';
import styles from './WinnersTabs.module.css';

const TABS = [
  { key: 'winners', label: 'Winners' },
  { key: 'previous', label: 'Previous Winners' },
];

/**
 * Winners / Previous Winners tab widget.
 * role=tablist with roving tabindex + arrow-key navigation; inactive panel
 * uses `hidden`. Both panels are service-backed with explicit loading,
 * empty and error states, and demo labelling is always visible.
 */
export default function WinnersTabs() {
  const [active, setActive] = useState('winners');
  const recent = useAsync(getRecentWinners, []);
  const previous = useAsync(getPreviousWinners, []);

  const idx = TABS.findIndex((t) => t.key === active);

  const onTabKeyDown = useCallback(
    (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = TABS[(idx + dir + TABS.length) % TABS.length];
      setActive(next.key);
      document.getElementById(`vl-tab-${next.key}`)?.focus();
    },
    [idx],
  );

  const renderPanel = ({ data, loading, error, reload }, kind) => {
    if (loading) {
      return (
        <div aria-busy="true">
          <Skeleton variant="blocks" count={3} />
        </div>
      );
    }
    if (error) {
      return <ErrorState title="Winners unavailable" message={error.message} onRetry={reload} />;
    }
    if (!data.length) {
      return (
        <EmptyState
          title="No published winners yet"
          message="Winner records appear here after the first draw closes. This demo has no further history to show."
        />
      );
    }
    if (kind === 'winners') {
      return <WinnerSlider winners={data} />;
    }
    return (
      <ul className={styles.prevGrid}>
        {data.map((winner) => (
          <li key={winner.id} className={styles.prevItem}>
            <PreviousWinnerCard winner={winner} />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <div
          className={styles.tablist}
          role="tablist"
          aria-label="Winner announcements"
        >
          {TABS.map((tab) => {
            const selected = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`vl-tab-${tab.key}`}
                className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
                aria-selected={selected}
                aria-controls={`vl-tabpanel-${tab.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.key)}
                onKeyDown={onTabKeyDown}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <DemoNotice variant="chip" text="Demo winners — fictional masked IDs" />
      </div>

      <div
        role="tabpanel"
        id="vl-tabpanel-winners"
        aria-labelledby="vl-tab-winners"
        hidden={active !== 'winners'}
      >
        {renderPanel(recent, 'winners')}
      </div>

      <div
        role="tabpanel"
        id="vl-tabpanel-previous"
        aria-labelledby="vl-tab-previous"
        hidden={active !== 'previous'}
      >
        {renderPanel(previous, 'previous')}
      </div>
    </div>
  );
}
