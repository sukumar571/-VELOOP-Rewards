import { useAsync } from '../../hooks/useAsync.js';
import { getEligibilityRequirements } from '../../services/giveawayService.js';
import { CircleAlert } from 'lucide-react';
import Skeleton from '../common/Skeleton.jsx';
import ErrorState from '../common/ErrorState.jsx';
import styles from './EligibilityList.module.css';

/**
 * Eligibility & participation requirements, loaded through the service so the
 * copy stays data-driven. Unconfirmed rules (pending) are surfaced with an
 * explicit marker instead of being presented as approved policy.
 */
export default function EligibilityList() {
  const { data, loading, error, reload } = useAsync(getEligibilityRequirements, []);

  if (loading) {
    return (
      <div className={styles.wrap} aria-busy="true">
        <Skeleton variant="blocks" count={3} />
      </div>
    );
  }
  if (error) {
    return <ErrorState title="Eligibility unavailable" message={error.message} onRetry={reload} />;
  }

  return (
    <ul className={styles.list}>
      {(data || []).map((item, i) => (
        <li key={i} className={styles.row}>
          {item.pending ? (
            <CircleAlert size={15} className={styles.pendingIcon} aria-hidden="true" />
          ) : (
            <span className={styles.bullet} aria-hidden="true" />
          )}
          <span className={styles.text}>
            {item.text}
            {item.pending ? (
              <em className={styles.pendingTag}>Pending confirmation — not approved policy</em>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
