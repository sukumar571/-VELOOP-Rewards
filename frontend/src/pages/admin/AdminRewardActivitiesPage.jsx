import { useCallback, useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, RefreshCw, Check, Pencil, X } from 'lucide-react';
import {
  fetchAdminActivities,
  createActivity,
  updateActivity,
} from '../../services/rewardsService.js';
import { CURRENCIES, formatAmount } from '../../config/currencies.js';
import styles from './RewardAdmin.module.css';

const EMPTY = {
  key: '',
  title: '',
  description: '',
  currency: 'VE',
  amount: '',
  claimMode: 'ONCE',
  cooldownHours: '24',
  maxClaimsPerUser: '1',
  startsAt: '',
  endsAt: '',
  active: true,
};

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function bodyFrom(form, partial) {
  const body = {};
  if (!partial) body.key = form.key.trim().toLowerCase();
  if (!partial || form.title !== undefined) body.title = form.title.trim();
  body.description = form.description ? form.description.trim() : undefined;
  body.currency = form.currency;
  body.amount = Number(form.amount);
  body.claimMode = form.claimMode;
  if (form.claimMode === 'COOLDOWN') body.cooldownHours = Number(form.cooldownHours);
  body.maxClaimsPerUser = Number(form.maxClaimsPerUser);
  body.active = form.active;
  body.startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
  body.endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;
  return body;
}

/**
 * Admin · Reward Activities — create and edit the claimable earning catalogue.
 * Amounts, currencies and windows are set here by an administrator; members can
 * only claim an activity id.
 */
export default function AdminRewardActivitiesPage() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState({ loading: true, error: null });
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      setItems(await fetchAdminActivities());
      setState({ loading: false, error: null });
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(a) {
    setEditingId(a.id);
    setNotice(null);
    setForm({
      key: a.key,
      title: a.title,
      description: a.description || '',
      currency: a.currency,
      amount: String(a.amount),
      claimMode: a.claimMode,
      cooldownHours: String(a.cooldownHours || 24),
      maxClaimsPerUser: String(a.maxClaimsPerUser ?? 1),
      startsAt: toLocalInput(a.startsAt),
      endsAt: toLocalInput(a.endsAt),
      active: a.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      if (editingId) {
        await updateActivity(editingId, bodyFrom(form, true));
        setNotice({ type: 'ok', text: 'Activity updated.' });
      } else {
        await createActivity(bodyFrom(form, false));
        setNotice({ type: 'ok', text: 'Activity created.' });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a) {
    try {
      await updateActivity(a.id, { active: !a.active });
      await load();
    } catch (err) {
      setNotice({ type: 'err', text: err.message });
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>Reward Activities</h2>
          <p className={styles.pageLead}>
            The earning catalogue members can claim. Each claim is verified server-side against
            eligibility, cooldown and per-account limits.
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

      <div className={`vl-card ${styles.panel}`}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{editingId ? 'Edit activity' : 'New activity'}</h3>
          {editingId ? (
            <button type="button" className="vl-btn vl-btn-ghost vl-btn-sm" onClick={cancelEdit}>
              <X size={14} /> Cancel edit
            </button>
          ) : null}
        </div>

        <form onSubmit={submit}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-key">
                Key
              </label>
              <input
                id="a-key"
                className={styles.input}
                value={form.key}
                onChange={(e) => set('key', e.target.value)}
                placeholder="daily-login"
                disabled={!!editingId}
                required
              />
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} htmlFor="a-title">
                Title
              </label>
              <input
                id="a-title"
                className={styles.input}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Daily login"
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-currency">
                Currency
              </label>
              <select
                id="a-currency"
                className={styles.select}
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
              >
                {Object.values(CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-amount">
                Amount
              </label>
              <input
                id="a-amount"
                type="number"
                min="1"
                className={styles.input}
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-mode">
                Claim mode
              </label>
              <select
                id="a-mode"
                className={styles.select}
                value={form.claimMode}
                onChange={(e) => set('claimMode', e.target.value)}
              >
                <option value="ONCE">Once</option>
                <option value="DAILY">Daily</option>
                <option value="COOLDOWN">Cooldown</option>
              </select>
            </div>
            {form.claimMode === 'COOLDOWN' ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="a-cooldown">
                  Cooldown (hours)
                </label>
                <input
                  id="a-cooldown"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={form.cooldownHours}
                  onChange={(e) => set('cooldownHours', e.target.value)}
                />
              </div>
            ) : null}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-limit">
                Max claims per user
              </label>
              <input
                id="a-limit"
                type="number"
                min="1"
                className={styles.input}
                value={form.maxClaimsPerUser}
                onChange={(e) => set('maxClaimsPerUser', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-start">
                Starts at
              </label>
              <input
                id="a-start"
                type="datetime-local"
                className={styles.input}
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-end">
                Ends at
              </label>
              <input
                id="a-end"
                type="datetime-local"
                className={styles.input}
                value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} htmlFor="a-desc">
                Description
              </label>
              <input
                id="a-desc"
                className={styles.input}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Short description shown to members"
              />
            </div>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Active
            </label>
            <div className={styles.actions}>
              <button type="submit" className="vl-btn vl-btn-cta vl-btn-sm" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create activity'}
              </button>
            </div>
          </div>
        </form>
        <p className={styles.hint}>
          Members never submit an amount. Changing the amount here changes what future claims pay.
        </p>
      </div>

      <div className={`vl-card ${styles.panel}`}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Activities</h3>
        </div>

        {state.loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <span>Loading activities…</span>
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
            <Sparkles size={26} />
            <p>No reward activities have been created yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Reward</th>
                  <th>Mode</th>
                  <th>Claims</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.title}</strong>
                      <div className={styles.mono}>{a.key}</div>
                    </td>
                    <td>{formatAmount(a.currency, a.amount)}</td>
                    <td>{a.claimMode === 'COOLDOWN' ? `${a.cooldownHours}h` : a.claimMode}</td>
                    <td>
                      {a.stats?.claims ?? 0} ·{' '}
                      <span className={styles.mono}>{formatAmount(a.currency, a.stats?.credited ?? 0)}</span>
                    </td>
                    <td>
                      {fmtDate(a.startsAt)} → {fmtDate(a.endsAt)}
                    </td>
                    <td>
                      <span className={`${styles.tag} ${a.active ? styles.tagOk : styles.tagWarn}`}>
                        {a.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button type="button" className="vl-btn vl-btn-ghost vl-btn-sm" onClick={() => startEdit(a)}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" className="vl-btn vl-btn-ghost vl-btn-sm" onClick={() => toggleActive(a)}>
                          {a.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
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
