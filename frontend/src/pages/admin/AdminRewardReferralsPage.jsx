import { useCallback, useEffect, useState } from 'react';
import { Share2, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import {
  fetchReferralConfig,
  updateReferralConfig,
  fetchAdminReferrals,
  reviewReferral,
} from '../../services/rewardsService.js';
import { CURRENCIES, formatAmount } from '../../config/currencies.js';
import styles from './RewardAdmin.module.css';

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/**
 * Admin · Referrals — programme configuration and referral review. Approving a
 * pending referral qualifies it (crediting the configured rewards once), and the
 * server derives every amount from this configuration.
 */
export default function AdminRewardReferralsPage() {
  const [config, setConfig] = useState(null);
  const [configState, setConfigState] = useState({ loading: true, error: null });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [listState, setListState] = useState({ loading: true, error: null });
  const [busyId, setBusyId] = useState(null);

  const loadConfig = useCallback(async () => {
    setConfigState({ loading: true, error: null });
    try {
      const cfg = await fetchReferralConfig();
      setConfig({
        enabled: cfg.enabled !== false,
        referrerCurrency: cfg.referrerReward?.currency || 'VE',
        referrerAmount: String(cfg.referrerReward?.amount ?? ''),
        refereeEnabled: !!cfg.refereeReward,
        refereeCurrency: cfg.refereeReward?.currency || 'VE',
        refereeAmount: String(cfg.refereeReward?.amount ?? ''),
        minAccountAgeHours: String(cfg.qualification?.minAccountAgeHours ?? 24),
        requireParticipation: !!cfg.qualification?.requireParticipation,
        autoApprove: cfg.qualification?.autoApprove !== false,
        maxReferralsPerUser: String(cfg.maxReferralsPerUser ?? 100),
      });
      setConfigState({ loading: false, error: null });
    } catch (err) {
      setConfigState({ loading: false, error: err.message });
    }
  }, []);

  const loadList = useCallback(
    async (page = 1) => {
      setListState({ loading: true, error: null });
      try {
        const res = await fetchAdminReferrals(status ? { status, page, limit: 20 } : { page, limit: 20 });
        setRows(res.items);
        setMeta(res.meta);
        setListState({ loading: false, error: null });
      } catch (err) {
        setListState({ loading: false, error: err.message });
        setRows([]);
      }
    },
    [status],
  );

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadList(1);
  }, [loadList]);

  function set(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function saveConfig(e) {
    e.preventDefault();
    if (!config || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await updateReferralConfig({
        enabled: config.enabled,
        referrerReward: {
          currency: config.referrerCurrency,
          amount: Number(config.referrerAmount),
        },
        refereeReward: config.refereeEnabled
          ? { currency: config.refereeCurrency, amount: Number(config.refereeAmount) }
          : null,
        qualification: {
          minAccountAgeHours: Number(config.minAccountAgeHours),
          requireParticipation: config.requireParticipation,
          autoApprove: config.autoApprove,
        },
        maxReferralsPerUser: Number(config.maxReferralsPerUser),
      });
      setNotice({ type: 'ok', text: 'Referral configuration saved.' });
      await loadConfig();
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function decide(row, decision) {
    setBusyId(row.id);
    setNotice(null);
    try {
      await reviewReferral(row.id, { decision });
      setNotice({
        type: 'ok',
        text: decision === 'APPROVE' ? 'Referral approved and qualified.' : 'Referral rejected.',
      });
      await loadList(meta.page);
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  const statusClass = (s) =>
    s === 'QUALIFIED' ? styles.tagOk : s === 'REJECTED' ? styles.tagBad : styles.tagWarn;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>Referrals</h2>
          <p className={styles.pageLead}>
            Referral qualification rules and reward amounts. A referral pays once, when it satisfies
            these rules or an administrator approves it.
          </p>
        </div>
        <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => { loadConfig(); loadList(1); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {notice ? (
        <div className={`${styles.notice} ${notice.type === 'ok' ? styles.noticeOk : styles.noticeErr}`}>
          {notice.type === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <div className={`vl-card ${styles.panel}`}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Programme configuration</h3>
        </div>

        {configState.loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <span>Loading configuration…</span>
          </div>
        ) : configState.error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={22} />
            <p>{configState.error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={loadConfig}>
              Retry
            </button>
          </div>
        ) : config ? (
          <form onSubmit={saveConfig}>
            <div className={styles.formGrid}>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={config.enabled} onChange={(e) => set('enabled', e.target.checked)} />
                Programme enabled
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={config.autoApprove}
                  onChange={(e) => set('autoApprove', e.target.checked)}
                />
                Auto-approve qualified referrals
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={config.requireParticipation}
                  onChange={(e) => set('requireParticipation', e.target.checked)}
                />
                Require a giveaway entry
              </label>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-age">
                  Min account age (hours)
                </label>
                <input
                  id="r-age"
                  type="number"
                  min="0"
                  className={styles.input}
                  value={config.minAccountAgeHours}
                  onChange={(e) => set('minAccountAgeHours', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-max">
                  Max referrals per member
                </label>
                <input
                  id="r-max"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={config.maxReferralsPerUser}
                  onChange={(e) => set('maxReferralsPerUser', e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-cur">
                  Referrer reward currency
                </label>
                <select
                  id="r-cur"
                  className={styles.select}
                  value={config.referrerCurrency}
                  onChange={(e) => set('referrerCurrency', e.target.value)}
                >
                  {Object.values(CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-amt">
                  Referrer reward amount
                </label>
                <input
                  id="r-amt"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={config.referrerAmount}
                  onChange={(e) => set('referrerAmount', e.target.value)}
                  required
                />
              </div>

              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={config.refereeEnabled}
                  onChange={(e) => set('refereeEnabled', e.target.checked)}
                />
                Reward the referred member too
              </label>
              {config.refereeEnabled ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="rr-cur">
                      Referee currency
                    </label>
                    <select
                      id="rr-cur"
                      className={styles.select}
                      value={config.refereeCurrency}
                      onChange={(e) => set('refereeCurrency', e.target.value)}
                    >
                      {Object.values(CURRENCIES).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="rr-amt">
                      Referee amount
                    </label>
                    <input
                      id="rr-amt"
                      type="number"
                      min="1"
                      className={styles.input}
                      value={config.refereeAmount}
                      onChange={(e) => set('refereeAmount', e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              <div className={styles.actions}>
                <button type="submit" className="vl-btn vl-btn-cta vl-btn-sm" disabled={saving}>
                  {saving ? 'Saving…' : 'Save configuration'}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>

      <div className={`vl-card ${styles.panel}`}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Referral records</h3>
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {listState.loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <span>Loading referrals…</span>
          </div>
        ) : listState.error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={22} />
            <p>{listState.error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadList(1)}>
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyBox}>
            <Share2 size={26} />
            <p>No referrals match this status.</p>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Referrer</th>
                    <th>Referred member</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Qualified</th>
                    <th>Rewards</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.referrer}</td>
                      <td>{r.referee}</td>
                      <td className={styles.mono}>{r.code}</td>
                      <td>
                        <span className={`${styles.tag} ${statusClass(r.status)}`}>{r.status}</span>
                      </td>
                      <td>{fmtDate(r.createdAt)}</td>
                      <td>{fmtDate(r.qualifiedAt)}</td>
                      <td>
                        {(r.rewards || []).length
                          ? r.rewards.map((x) => `${x.role}: ${formatAmount(x.currency, x.amount)}`).join(' · ')
                          : '—'}
                      </td>
                      <td>
                        {r.status === 'PENDING' ? (
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className="vl-btn vl-btn-cta vl-btn-sm"
                              disabled={busyId === r.id}
                              onClick={() => decide(r, 'APPROVE')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="vl-btn vl-btn-ghost vl-btn-sm"
                              disabled={busyId === r.id}
                              onClick={() => decide(r, 'REJECT')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <span className={styles.paginationMeta}>
                Page {meta.page} of {meta.totalPages} · {meta.total} referrals
              </span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="vl-btn vl-btn-ghost vl-btn-sm"
                  disabled={meta.page <= 1}
                  onClick={() => loadList(meta.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="vl-btn vl-btn-ghost vl-btn-sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => loadList(meta.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
