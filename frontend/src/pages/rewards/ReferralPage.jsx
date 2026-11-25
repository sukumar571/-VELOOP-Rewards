import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Copy, Check, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchReferral } from '../../services/rewardsService.js';
import { formatAmount } from '../../config/currencies.js';
import styles from './Rewards.module.css';

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function absoluteLink(link) {
  if (!link || typeof window === 'undefined') return link || '';
  if (/^https?:\/\//i.test(link)) return link;
  return `${window.location.origin}${link.startsWith('/') ? '' : '/'}${link}`;
}

/**
 * Refer & Earn — the member's code, share link, referral progress and reward
 * history. Qualification rules and reward amounts are read from the server.
 */
export default function ReferralPage() {
  const { authenticated } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    if (!authenticated) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      setState({ loading: false, error: null, data: await fetchReferral() });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }, [authenticated]);

  useEffect(() => {
    load();
  }, [load, tick]);

  async function copy(value, key) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  const data = state.data;
  const shareLink = absoluteLink(data?.link);

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Rewards"
        title="Refer &"
        gradientWord="Earn"
        subtitle="Share your code. When a referred member meets the qualification rules, the reward is credited to your wallet."
      />

      {!authenticated ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <Share2 size={34} aria-hidden="true" />
          <p>Sign in to get your referral code.</p>
          <Link to="/login" className="vl-btn vl-btn-cta">
            Sign in
          </Link>
        </div>
      ) : state.loading ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <div className={styles.spinner} />
          <span>Loading your referral details…</span>
        </div>
      ) : state.error ? (
        <div className={`vl-card ${styles.panel} ${styles.errorBox}`}>
          <AlertTriangle size={26} aria-hidden="true" />
          <p>{state.error}</p>
          <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : data ? (
        <>
          {data.enabled === false ? (
            <div className={`${styles.notice} ${styles.noticeInfo}`}>
              <AlertTriangle size={16} />
              <span>The referral programme is currently paused. Existing referrals are kept.</span>
            </div>
          ) : null}

          <div className={styles.grid}>
            <div className={styles.balanceCard}>
              <span className={styles.balanceLabel}>Your referral code</span>
              <span className={styles.balanceValue} style={{ fontFamily: 'ui-monospace, monospace' }}>
                {data.code}
              </span>
              <button
                type="button"
                className="vl-btn vl-btn-ghost vl-btn-sm"
                onClick={() => copy(data.code, 'code')}
              >
                {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
            </div>

            <div className={styles.balanceCard}>
              <span className={styles.balanceLabel}>You earn per qualified referral</span>
              <span className={styles.balanceValue}>
                {data.reward ? formatAmount(data.reward.currency, data.reward.amount) : '—'}
              </span>
              <span className={styles.balanceHint}>
                Referred member: {data.refereeReward ? formatAmount(data.refereeReward.currency, data.refereeReward.amount) : 'no reward'}
              </span>
            </div>

            <div className={styles.balanceCard}>
              <span className={styles.balanceLabel}>Referrals</span>
              <span className={styles.balanceValue}>{data.counts?.qualified ?? 0}</span>
              <span className={styles.balanceHint}>
                {data.counts?.pending ?? 0} pending · {data.counts?.total ?? 0} total
              </span>
            </div>
          </div>

          <div className={`vl-card ${styles.panel}`}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Your invite link</h2>
                <p className={styles.muted}>Anyone who signs up through this link is recorded as your referral.</p>
              </div>
              <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => copy(shareLink, 'link')}>
                {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <input className={styles.input} value={shareLink} readOnly aria-label="Referral link" />
            <p className={styles.hint}>
              Qualification: a referral becomes payable after the referred account reaches{' '}
              {data.qualification?.minAccountAgeHours ?? 0} hours
              {data.qualification?.requireParticipation ? ' and enters a giveaway' : ''}.
              {data.qualification?.autoApprove === false
                ? ' An administrator reviews each referral before it is paid.'
                : ' Referrals are approved automatically once qualified.'}
            </p>
          </div>

          <div className={`vl-card ${styles.panel}`}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Referral activity</h2>
                <p className={styles.muted}>Masked member aliases only — never personal details.</p>
              </div>
            </div>

            {!data.referrals?.length ? (
              <div className={styles.emptyBox}>
                <Users size={28} aria-hidden="true" />
                <p>No referrals yet. Share your code to get started.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Qualified</th>
                      <th>Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.map((r) => {
                      const mine = (r.rewards || []).find((x) => x.role === 'REFERRER');
                      return (
                        <tr key={r.id}>
                          <td>{r.member}</td>
                          <td>
                            <span className={`${styles.tag} ${r.status === 'QUALIFIED' ? styles.tagOk : styles.tagWarn}`}>
                              {r.status}
                            </span>
                          </td>
                          <td>{fmtDate(r.joinedAt)}</td>
                          <td>{fmtDate(r.qualifiedAt)}</td>
                          <td>{mine ? formatAmount(mine.currency, mine.amount) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.rewardHistory?.length ? (
            <div className={`vl-card ${styles.panel}`}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Referral rewards</h2>
              </div>
              <ul className={styles.list}>
                {data.rewardHistory.map((r, i) => (
                  <li key={`${r.referralId}-${i}`} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>Referral reward</p>
                      <p className={styles.rowMeta}>{fmtDate(r.at)}</p>
                    </div>
                    <span className={styles.amountUp}>+{formatAmount(r.currency, r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
