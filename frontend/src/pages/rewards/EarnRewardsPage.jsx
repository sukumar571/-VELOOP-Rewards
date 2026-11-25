import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, AlertTriangle, Check, RefreshCw, Clock } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchActivities, claimActivity } from '../../services/rewardsService.js';
import { formatAmount } from '../../config/currencies.js';
import styles from './Rewards.module.css';

function claimModeLabel(item) {
  if (item.claimMode === 'DAILY') return 'Daily';
  if (item.claimMode === 'COOLDOWN') return `Every ${item.cooldownHours}h`;
  return 'Once';
}

function availabilityLabel(item) {
  if (item.available === false) {
    if (item.availabilityReason === 'EXPIRED') return 'Ended';
    if (item.availabilityReason === 'NOT_STARTED') return 'Starts soon';
    return 'Unavailable';
  }
  if (item.claim?.claimedThisPeriod) return 'Claimed';
  if (item.eligibility && item.eligibility.eligible === false) {
    if (item.eligibility.reason === 'LIMIT_REACHED') return 'Limit reached';
    if (item.eligibility.reason === 'ACCOUNT_TOO_NEW') return 'Not yet eligible';
    if (item.eligibility.reason === 'KYC_REQUIRED') return 'Verification needed';
    if (item.eligibility.reason === 'PARTICIPATION_REQUIRED') return 'Enter a giveaway first';
    if (item.eligibility.reason === 'ALREADY_CLAIMED') return 'Claimed';
    return 'Not eligible';
  }
  return 'Available';
}

/**
 * Earn Rewards — the server-configured activity catalogue. The client sends
 * only the activity id; the amount, eligibility, cooldown and limits are decided
 * by the backend on claim.
 */
export default function EarnRewardsPage() {
  const { authenticated, refresh } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { type, text }
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!authenticated) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchActivities());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    load();
  }, [load, tick]);

  async function onClaim(item) {
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await claimActivity(item.id);
      setNotice({
        type: 'ok',
        text: `Claimed ${formatAmount(res.currency, res.amount)}. New balance: ${formatAmount(
          res.currency,
          res.balance,
        )}.`,
      });
      if (refresh) await refresh();
      setTick((t) => t + 1);
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
      setTick((t) => t + 1);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Rewards"
        title="Earn"
        gradientWord="Rewards"
        subtitle="Server-verified activities. Each reward, cooldown and limit is set by VELOOP — never by this page."
      />

      {notice ? (
        <div
          role="status"
          className={`${styles.notice} ${notice.type === 'ok' ? styles.noticeOk : styles.noticeErr}`}
        >
          {notice.type === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{notice.text}</span>
        </div>
      ) : null}

      {!authenticated ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <Gift size={34} aria-hidden="true" />
          <p>Sign in to see the activities you can claim.</p>
          <Link to="/login" className="vl-btn vl-btn-cta">
            Sign in
          </Link>
        </div>
      ) : loading ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <div className={styles.spinner} />
          <span>Loading reward activities…</span>
        </div>
      ) : error ? (
        <div className={`vl-card ${styles.panel} ${styles.errorBox}`}>
          <AlertTriangle size={26} aria-hidden="true" />
          <p>{error}</p>
          <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={`vl-card ${styles.panel} ${styles.emptyBox}`}>
          <Gift size={30} aria-hidden="true" />
          <p>No activities are open right now. Please check back soon.</p>
        </div>
      ) : (
        <div className={styles.activityList}>
          {items.map((item) => {
            const label = availabilityLabel(item);
            const claimable = item.available !== false && !item.claim?.claimedThisPeriod && item.eligibility?.eligible;
            return (
              <article key={item.id} className={styles.activityCard}>
                <div className={styles.activityTop}>
                  <div>
                    <h2 className={styles.sectionTitle}>{item.title}</h2>
                    <p className={styles.rowMeta}>
                      <Clock size={11} aria-hidden="true" /> {claimModeLabel(item)} ·{' '}
                      {item.claim ? `${item.claim.claimed}/${item.claim.limit} claimed` : ''}
                    </p>
                  </div>
                  <span className={styles.activityReward}>+{formatAmount(item.currency, item.amount)}</span>
                </div>

                {item.description ? <p className={styles.activityDesc}>{item.description}</p> : null}

                <div className={styles.activityFoot}>
                  <span
                    className={`${styles.tag} ${claimable ? styles.tagOk : styles.tagWarn}`}
                  >
                    {label}
                  </span>
                  <button
                    type="button"
                    className="vl-btn vl-btn-cta vl-btn-sm"
                    disabled={!claimable || busyId === item.id}
                    onClick={() => onClaim(item)}
                  >
                    {busyId === item.id ? 'Claiming…' : 'Claim'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className={styles.hint}>
        Activity eligibility, cooldowns and per-account limits are enforced on the server when you
        claim. A claim can never be paid twice.
      </p>
    </div>
  );
}
