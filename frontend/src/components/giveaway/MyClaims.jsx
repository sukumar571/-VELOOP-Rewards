import { Link } from 'react-router-dom';
import { LogIn, Info } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getMyWonRecords } from '../../services/claimService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import SectionHeading from '../common/SectionHeading.jsx';
import Skeleton from '../common/Skeleton.jsx';
import ErrorState from '../common/ErrorState.jsx';
import EmptyState from '../common/EmptyState.jsx';
import WinnerClaimCard from './WinnerClaimCard.jsx';
import styles from './MyClaims.module.css';

/**
 * Personalized "Your prize claims" area. It lists ONLY the current authenticated
 * member's won, published draws — the record set is filtered server-side by the
 * account id, so one member can never see another's claim. Signed-out visitors
 * are pointed to the login flow instead of any claim data.
 */
export default function MyClaims() {
  const { authenticated } = useAuth();
  const { data, loading, error, reload } = useAsync(
    () => (authenticated ? getMyWonRecords() : Promise.resolve([])),
    [authenticated],
  );

  return (
    <section className={styles.section} aria-label="Your prize claims">
      <SectionHeading
        eyebrow="For winning members"
        title="Your prize claims"
        subtitle="If you've won a published draw, claim your prize here. Only the winning account can see and complete its own claim."
      />

      {!authenticated ? (
        <div className={styles.signIn}>
          <p className={styles.signInText}>
            <LogIn size={15} aria-hidden="true" />
            Sign in to check whether you&apos;ve won and to claim any prize.
          </p>
          <Link to="/login" className="vl-btn vl-btn-outline">
            Sign in
          </Link>
        </div>
      ) : loading ? (
        <div aria-busy="true">
          <Skeleton variant="blocks" count={2} />
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load your claims"
          message={error.message}
          onRetry={reload}
        />
      ) : !data.length ? (
        <EmptyState
          title="No prizes to claim yet"
          message="When you win a giveaway whose entries have closed, its claim card will appear right here."
        />
      ) : (
        <>
          <ul className={styles.list}>
            {data.map((record) => (
              <li key={record.giveawayId}>
                <WinnerClaimCard record={record} onUpdated={reload} />
              </li>
            ))}
          </ul>
          <p className={styles.hint} role="note">
            <Info size={13} aria-hidden="true" />
            Claim eligibility and deadlines are confirmed by the server — this list is a display
            of your own records only, never another member&apos;s.
          </p>
        </>
      )}
    </section>
  );
}
