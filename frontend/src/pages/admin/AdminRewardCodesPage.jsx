import { useCallback, useEffect, useState } from 'react';
import { Ticket, AlertTriangle, RefreshCw, Check, KeyRound } from 'lucide-react';
import {
  fetchAdminCodes,
  createCode,
  updateCode,
  generateCodes,
} from '../../services/rewardsService.js';
import { CURRENCIES, formatAmount } from '../../config/currencies.js';
import styles from './RewardAdmin.module.css';

const EMPTY_CODE = {
  code: '',
  label: '',
  currency: 'VE',
  amount: '',
  maxRedemptions: '',
  perUserLimit: '1',
  expiresAt: '',
};

const EMPTY_GEN = {
  count: '5',
  prefix: 'VELOOP',
  label: 'Generated reward code',
  currency: 'VE',
  amount: '',
  maxRedemptions: '1',
  perUserLimit: '1',
  expiresAt: '',
};

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/**
 * Admin · Reward Codes — create single codes, generate a batch, and
 * activate/deactivate. Totals and per-user limits are enforced by the server at
 * redemption time.
 */
export default function AdminRewardCodesPage() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState({ loading: true, error: null });
  const [form, setForm] = useState(EMPTY_CODE);
  const [gen, setGen] = useState(EMPTY_GEN);
  const [saving, setSaving] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      setItems(await fetchAdminCodes());
      setState({ loading: false, error: null });
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitCode(e) {
    e.preventDefault();
    setSaving('create');
    setNotice(null);
    try {
      await createCode({
        code: form.code.trim().toUpperCase(),
        label: form.label.trim() || undefined,
        currency: form.currency,
        amount: Number(form.amount),
        maxRedemptions: form.maxRedemptions === '' ? null : Number(form.maxRedemptions),
        perUserLimit: Number(form.perUserLimit),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      setNotice({ type: 'ok', text: 'Reward code created.' });
      setForm(EMPTY_CODE);
      await load();
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    } finally {
      setSaving(null);
    }
  }

  async function submitGenerate(e) {
    e.preventDefault();
    setSaving('generate');
    setNotice(null);
    try {
      const res = await generateCodes({
        count: Number(gen.count),
        prefix: gen.prefix.trim() || undefined,
        label: gen.label.trim() || undefined,
        currency: gen.currency,
        amount: Number(gen.amount),
        maxRedemptions: gen.maxRedemptions === '' ? null : Number(gen.maxRedemptions),
        perUserLimit: Number(gen.perUserLimit),
        expiresAt: gen.expiresAt ? new Date(gen.expiresAt).toISOString() : null,
      });
      setNotice({
        type: 'ok',
        text: `Generated ${res.created?.length ?? 0} code(s): ${(res.created || []).map((c) => c.code).join(', ')}`,
      });
      setGen(EMPTY_GEN);
      await load();
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    } finally {
      setSaving(null);
    }
  }

  async function toggleActive(c) {
    try {
      await updateCode(c.id, { active: !c.active });
      await load();
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>Reward Codes</h2>
          <p className={styles.pageLead}>
            Codes are the only way a member can add an amount without an activity. The amount and
            every limit are stored here and enforced at redemption.
          </p>
        </div>
        <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {notice ? (
        <div className={`${styles.notice} ${notice.type === 'ok' ? styles.noticeOk : styles.noticeErr}`}>
          {notice.type === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <div className={styles.formGrid} style={{ alignItems: 'stretch' }}>
        <div className={`vl-card ${styles.panel}`}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Create a code</h3>
          </div>
          <form onSubmit={submitCode}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-code">
                  Code
                </label>
                <input
                  id="c-code"
                  className={styles.input}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER100"
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-label">
                  Label
                </label>
                <input
                  id="c-label"
                  className={styles.input}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Summer bonus"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-currency">
                  Currency
                </label>
                <select
                  id="c-currency"
                  className={styles.select}
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  {Object.values(CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-amount">
                  Amount
                </label>
                <input
                  id="c-amount"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-max">
                  Max redemptions (blank = unlimited)
                </label>
                <input
                  id="c-max"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-per">
                  Per-user limit
                </label>
                <input
                  id="c-per"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={form.perUserLimit}
                  onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="c-exp">
                  Expires at
                </label>
                <input
                  id="c-exp"
                  type="datetime-local"
                  className={styles.input}
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
              <div className={styles.actions}>
                <button type="submit" className="vl-btn vl-btn-cta vl-btn-sm" disabled={saving === 'create'}>
                  {saving === 'create' ? 'Creating…' : 'Create code'}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className={`vl-card ${styles.panel}`}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Generate a batch</h3>
          </div>
          <form onSubmit={submitGenerate}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="g-count">
                  Count (max 50)
                </label>
                <input
                  id="g-count"
                  type="number"
                  min="1"
                  max="50"
                  className={styles.input}
                  value={gen.count}
                  onChange={(e) => setGen({ ...gen, count: e.target.value })}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="g-prefix">
                  Prefix
                </label>
                <input
                  id="g-prefix"
                  className={styles.input}
                  value={gen.prefix}
                  onChange={(e) => setGen({ ...gen, prefix: e.target.value.toUpperCase() })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="g-currency">
                  Currency
                </label>
                <select
                  id="g-currency"
                  className={styles.select}
                  value={gen.currency}
                  onChange={(e) => setGen({ ...gen, currency: e.target.value })}
                >
                  {Object.values(CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="g-amount">
                  Amount per code
                </label>
                <input
                  id="g-amount"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={gen.amount}
                  onChange={(e) => setGen({ ...gen, amount: e.target.value })}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="g-max">
                  Max redemptions per code
                </label>
                <input
                  id="g-max"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={gen.maxRedemptions}
                  onChange={(e) => setGen({ ...gen, maxRedemptions: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="g-per">
                  Per-user limit
                </label>
                <input
                  id="g-per"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={gen.perUserLimit}
                  onChange={(e) => setGen({ ...gen, perUserLimit: e.target.value })}
                />
              </div>
              <div className={styles.actions}>
                <button type="submit" className="vl-btn vl-btn-outline vl-btn-sm" disabled={saving === 'generate'}>
                  <KeyRound size={14} /> {saving === 'generate' ? 'Generating…' : 'Generate codes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className={`vl-card ${styles.panel}`}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Codes</h3>
          <span className={styles.paginationMeta}>{items.length} code(s)</span>
        </div>

        {state.loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <span>Loading codes…</span>
          </div>
        ) : state.error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={22} />
            <p>{state.error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={load}>
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyBox}>
            <Ticket size={26} />
            <p>No reward codes exist yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Label</th>
                  <th>Reward</th>
                  <th>Redemptions</th>
                  <th>Per user</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td className={styles.mono}>{c.code}</td>
                    <td>{c.label || '—'}</td>
                    <td>{formatAmount(c.currency, c.amount)}</td>
                    <td>
                      {c.redemptionCount ?? 0}
                      {c.maxRedemptions === null ? ' / ∞' : ` / ${c.maxRedemptions}`}
                    </td>
                    <td>{c.perUserLimit}</td>
                    <td>{fmtDate(c.expiresAt)}</td>
                    <td>
                      <span className={`${styles.tag} ${c.active ? styles.tagOk : styles.tagWarn}`}>
                        {c.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="vl-btn vl-btn-ghost vl-btn-sm" onClick={() => toggleActive(c)}>
                        {c.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
