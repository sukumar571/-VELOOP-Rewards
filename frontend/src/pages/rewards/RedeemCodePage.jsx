import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Check, AlertTriangle, RefreshCw, Receipt } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCodes, fetchRedemptions, validateCode, redeemCode } from '../../services/rewardsService.js';
import { formatAmount } from '../../config/currencies.js';
import styles from './Rewards.module.css';

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/**
 * Redeem Code — validate first (the server resolves the amount), then redeem.
 * The submitted value is only a code string; no amount ever leaves this page.
 */
export default function RedeemCodePage() {
  const { authenticated, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null); // { type, text }
  const [busy, setBusy] = useState(null); // 'validate' | 'redeem'
  const [catalogue, setCatalogue] = useState({ loading: true, error: null, codes: [] });
  const [history, setHistory] = useState([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!authenticated) {
      setCatalogue({ loading: false, error: null, codes: [] });
      return;
    }
    setCatalogue((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [c, h] = await Promise.all([fetchCodes(), fetchRedemptions()]);
      setCatalogue({ loading: false, error: null, codes: c.codes });
      setHistory(h);
    } catch (err) {
      setCatalogue({ loading: false, error: err.message, codes: [] });
    }
  }, [authenticated]);

  useEffect(() => {
    load();
  }, [load, tick]);

  function reset() {
    setPreview(null);
    setResult(null);
  }

  async function onValidate(e) {
    e.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy('validate');
    setPreview(null);
    setResult(null);
    try {
      const res = await validateCode(value);
      setPreview(res);
    } catch (err) {
      setResult({ type: 'err', text: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function onRedeem() {
    if (!preview || busy) return;
    setBusy('redeem');
    try {
      const res = await redeemCode(preview.code);
      setResult({
        type: 'ok',
        text: `Redeemed ${preview.code}: ${formatAmount(res.currency, res.amount)} credited. New balance: ${formatAmount(
          res.currency,
          res.balance,
        )}.`,
      });
      setPreview(null);
      setCode('');
      if (refresh) await refresh();
      setTick((t) => t + 1);
    } catch (err) {
      setResult({ type: 'err', text: err.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Rewards"
        title="Redeem"
        gradientWord="Code"
        subtitle="Enter a VELOOP reward code. The amount is resolved by the server — never by this form."
      />

      {!authenticated ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <Ticket size={34} aria-hidden="true" />
          <p>Sign in to redeem a reward code.</p>
          <Link to="/login" className="vl-btn vl-btn-cta">
            Sign in
          </Link>
        </div>
      ) : (
        <div className={`vl-card ${styles.panel}`}>
          <form onSubmit={onValidate}>
            <label htmlFor="reward-code" className={styles.label}>
              Reward code
            </label>
            <div className={styles.formRow} style={{ marginTop: '0.35rem' }}>
              <input
                id="reward-code"
                className={styles.input}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  reset();
                }}
                placeholder="e.g. WELCOME250"
                autoComplete="off"
                spellCheck="false"
                aria-invalid={result?.type === 'err' || undefined}
              />
              <div className={styles.actions}>
                <button type="submit" className="vl-btn vl-btn-outline" disabled={!code.trim() || !!busy}>
                  {busy === 'validate' ? 'Checking…' : 'Check code'}
                </button>
                <button
                  type="button"
                  className="vl-btn vl-btn-cta"
                  disabled={!preview || !!busy}
                  onClick={onRedeem}
                >
                  {busy === 'redeem' ? 'Redeeming…' : 'Redeem'}
                </button>
              </div>
            </div>
          </form>

          {preview ? (
            <div className={`${styles.notice} ${styles.noticeInfo}`} style={{ marginTop: '0.9rem' }}>
              <Check size={16} />
              <span>
                <strong>{preview.code}</strong> — {preview.label || 'Reward code'} ·{' '}
                {formatAmount(preview.currency, preview.amount)}. This code may be redeemed{' '}
                {preview.remainingForUser} more time{preview.remainingForUser === 1 ? '' : 's'} on your account.
              </span>
            </div>
          ) : null}

          {result ? (
            <div
              role="status"
              className={`${styles.notice} ${result.type === 'ok' ? styles.noticeOk : styles.noticeErr}`}
              style={{ marginTop: '0.9rem' }}
            >
              {result.type === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}
              <span>{result.text}</span>
            </div>
          ) : null}
        </div>
      )}

      {authenticated ? (
        <div className={`vl-card ${styles.panel}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Available codes</h2>
              <p className={styles.muted}>Select a code to fill it in. Redeemed codes are marked.</p>
            </div>
          </div>

          {catalogue.loading ? (
            <div className={styles.stateBox}>
              <div className={styles.spinner} />
              <span>Loading codes…</span>
            </div>
          ) : catalogue.error ? (
            <div className={styles.errorBox}>
              <AlertTriangle size={22} />
              <p>{catalogue.error}</p>
              <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => setTick((t) => t + 1)}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : catalogue.codes.length === 0 ? (
            <div className={styles.emptyBox}>
              <Ticket size={26} />
              <p>No reward codes are published right now.</p>
            </div>
          ) : (
            <div className={styles.codeGrid}>
              {catalogue.codes.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={styles.codeCard}
                  disabled={c.redeemed || c.available === false}
                  onClick={() => {
                    setCode(c.code);
                    reset();
                  }}
                  title={c.redeemed ? 'Already redeemed on your account' : 'Fill this code'}
                >
                  <span className={styles.codeText}>{c.code}</span>
                  <span className={styles.codeLabel}>
                    {c.redeemed ? 'Redeemed' : `${c.label || 'Reward'} · ${formatAmount(c.currency, c.amount)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {authenticated && history.length ? (
        <div className={`vl-card ${styles.panel}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Your redemptions</h2>
              <p className={styles.muted}>Every code you have redeemed on this account.</p>
            </div>
          </div>
          <ul className={styles.list}>
            {history.map((r) => (
              <li key={r.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{r.code}</p>
                  <p className={styles.rowMeta}>
                    {fmtDate(r.redeemedAt)}
                    {r.count > 1 ? ` · ${r.count}×` : ''}
                  </p>
                </div>
                <span className={styles.amountUp}>+{formatAmount(r.currency, r.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={styles.hint}>
        <Receipt size={13} aria-hidden="true" /> Each code is checked for expiry, total redemption cap
        and your per-account limit before any amount is credited.
      </p>
    </div>
  );
}
