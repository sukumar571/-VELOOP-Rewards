import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Ticket, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getDemoCodes } from '../services/earnService.js';
import { CURRENCIES, formatAmount } from '../config/currencies.js';
import PageHeader from '../components/common/PageHeader.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import styles from './EarnVes.module.css';

/**
 * Demo "Earn VEs" page — the destination of the entry panel's "Earn More …" CTA.
 * Redeeming a code credits the fictional in-browser session wallet so the demo
 * join flow can be exercised. It is NOT real earning (see the honest note below)
 * and is inert once the real VELOOP API is wired up (earnService refuses then).
 */
export default function EarnVesPage() {
  const { authenticated, balanceOf, redeem } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { type: 'ok' | 'err', text }
  const [tick, setTick] = useState(0); // re-read redeemed flags after a success

  const codes = useMemo(() => getDemoCodes(), [tick, authenticated]);

  async function submit(e) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await redeem(code);
      if (res.ok) {
        setResult({
          type: 'ok',
          text: `Credited ${formatAmount(res.currency, res.amount)} — new balance ${formatAmount(
            res.currency,
            res.balance,
          )}.`,
        });
        setCode('');
        setTick((t) => t + 1);
      } else {
        setResult({ type: 'err', text: res.message });
      }
    } finally {
      setBusy(false);
    }
  }

  function fill(c) {
    if (!c.redeemed && authenticated) setCode(c.code);
  }

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Earn Rewards"
        title="Earn"
        gradientWord="VEs"
        subtitle="Redeem giveaway codes to top up your wallet so you can enter more draws."
      />

      {authenticated ? (
        <div className={styles.balances} aria-label="Your current balances">
          {Object.values(CURRENCIES).map((c) => {
            const bal = balanceOf(c.code);
            return (
              <div key={c.code} className={`${styles.balancePill} ${styles[c.accent]}`}>
                <span className={styles.balanceLabel}>{c.label}</span>
                <span className={styles.balanceValue}>{bal == null ? '—' : formatAmount(c.code, bal)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.signInNote}>
          <p>You’re signed out. Sign in to credit your wallet.</p>
          <Link to="/login" className="vl-btn vl-btn-cta">
            Sign in
          </Link>
        </div>
      )}

      <div className={`vl-card ${styles.card}`}>
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="redeem-code" className={styles.label}>
            <Ticket size={15} aria-hidden="true" /> Enter your code
          </label>
          <div className={styles.row}>
            <input
              id="redeem-code"
              className={styles.input}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setResult(null);
              }}
              placeholder="e.g. WELCOME250"
              autoComplete="off"
              spellCheck="false"
              disabled={!authenticated || busy}
              aria-invalid={result?.type === 'err' || undefined}
            />
            <button
              type="submit"
              className={`vl-btn vl-btn-cta ${styles.redeemBtn}`}
              disabled={!authenticated || busy || !code.trim()}
            >
              <TrendingUp size={16} aria-hidden="true" />
              {busy ? 'Redeeming…' : 'Redeem'}
            </button>
          </div>

          {result ? (
            <p role="alert" className={result.type === 'ok' ? styles.ok : styles.err}>
              {result.type === 'ok' ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <AlertTriangle size={15} aria-hidden="true" />
              )}
              {result.text}
            </p>
          ) : null}
        </form>

        <div className={styles.catalog}>
          <h2 className={styles.catalogTitle}>Demo codes</h2>
          <p className={styles.catalogHint}>
            {authenticated ? 'Tap a code to fill it in, then Redeem.' : 'Sign in to redeem codes.'}
          </p>
          <ul className={styles.codeList}>
            {codes.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className={`${styles.codeBtn} ${c.redeemed ? styles.codeUsed : ''}`}
                  onClick={() => fill(c)}
                  disabled={c.redeemed || !authenticated}
                  title={c.redeemed ? 'Already redeemed on this device' : 'Click to fill the code'}
                >
                  <span className={styles.codeText}>{c.code}</span>
                  {c.redeemed ? (
                    <span className={styles.usedTag}>Used</span>
                  ) : (
                    <span className={styles.codeReward}>+{formatAmount(c.currency, c.amount)}</span>
                  )}
                  <span className={styles.codeLabel}>{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.noticeWrap}>
        <DemoNotice variant="chip" text="Demo earning — codes credit a fictional in-browser wallet" />
      </div>
      <p className={styles.note}>
        This demo credits a fictional in-browser wallet only — it is <strong>not</strong> real
        VELOOP currency. Real VEs are earned on the VELOOP platform (giveaway codes, tasks and
        activity), which this build does not integrate; when the live API is connected this page
        stops adding balance and says so.
      </p>
    </div>
  );
}
