import { Flame, TicketPercent, Users, Trophy, TimerReset } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getProgrammeStats } from '../../services/giveawayService.js';
import { formatCount } from '../../utils/format.js';
import Skeleton from '../common/Skeleton.jsx';
import ErrorState from '../common/ErrorState.jsx';
import DemoNotice from '../common/DemoNotice.jsx';
import Countdown from '../common/Countdown.jsx';
import styles from './GiveawayStats.module.css';

const ITEMS = [
  { key: 'activeCount', icon: Flame, label: 'Active Giveaways' },
  { key: 'totalGiveaways', icon: TicketPercent, label: 'Total Giveaways' },
  { key: 'totalParticipants', icon: Users, label: 'Total Participants', format: formatCount },
  { key: 'prizesAwarded', icon: Trophy, label: 'Prizes Awarded' },
];

/**
 * Programme statistics strip (Ref_02). Values are derived from the mock
 * service and labelled as demo data right next to the heading — they must
 * never read as genuine live activity until a real API replaces the service.
 */
export default function GiveawayStats() {
  const { data, loading, error, reload } = useAsync(getProgrammeStats, []);

  return (
    <section className={styles.wrap} aria-labelledby="stats-heading">
      <div className={`container ${styles.inner}`}>
        <div className={styles.head}>
          <h2 id="stats-heading" className={styles.title}>
            Programme at a glance
          </h2>
          {data?.isDemo ? <DemoNotice variant="chip" /> : null}
        </div>

        {loading ? (
          <div className={styles.grid} aria-busy="true">
            <Skeleton variant="blocks" count={4} />
          </div>
        ) : error ? (
          <ErrorState
            title="Stats unavailable"
            message={error.message}
            onRetry={reload}
          />
        ) : (
          <ul className={styles.grid}>
            {ITEMS.map(({ key, icon: Icon, label, format }) => (
              <li key={key} className={styles.item}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className={styles.value}>
                  {format ? format(data[key]) : data[key]}
                </span>
                <span className={styles.label}>{label}</span>
              </li>
            ))}
            {data.nextEndsAt ? (
              <li className={`${styles.item} ${styles.next}`}>
                <span className={styles.icon} aria-hidden="true">
                  <TimerReset size={20} />
                </span>
                <span className={styles.value}>
                  <TimerChip endsAt={data.nextEndsAt} />
                </span>
                <span className={styles.label}>Next Draw Closes In</span>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}

function TimerChip({ endsAt }) {
  return <Countdown endsAt={endsAt} variant="chip" />;
}
