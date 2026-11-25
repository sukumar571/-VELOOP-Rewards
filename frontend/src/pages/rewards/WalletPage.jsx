import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Gift,
  Ticket,
  Share2,
  Receipt,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchWallet } from '../../services/rewardsService.js';
import { CURRENCIES, formatAmount } from '../../config/currencies.js';
import styles from './Rewards.module.css';

const CURRENCY_ORDER = ['VE', 'SVE', 'TOKEN'];

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/**
 * My Wallet — the authoritative reward balances plus the latest movements.
 * Every number is read from GET /rewards/wallet; a currency the server does not
 * report is rendered as 0 for a member with an account (the server initialises
 * new wallets at zero).
 */
export default function WalletPage() {
  const { authenticated, balances: contextBalances } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!authenticated) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchWallet();
      setState({ loading: false, error: null, data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }, [authenticated]);

  useEffect(() => {
    load();
  }, [load, tick]);

  const balances = state.data?.balances || contextBalances || null;
  const recent = state.data?.recentTransactions || [];

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Rewards"
        title="My"
        gradientWord="Wallet"
        subtitle="Your VEs, SVEs and Tokens — credited only by VELOOP, with every movement recorded."
      />

      {!authenticated ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <Wallet size={34} aria-hidden="true" />
          <p>Sign in to see your reward wallet.</p>
          <Link to="/login" className="vl-btn vl-btn-cta">
            Sign in
          </Link>
        </div>
      ) : state.loading ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <div className={styles.spinner} />
          <span>Loading your wallet…</span>
        </div>
      ) : state.error ? (
        <div className={`vl-card ${styles.panel} ${styles.errorBox}`}>
          <AlertTriangle size={26} aria-hidden="true" />
          <p>{state.error}</p>
          <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className={styles.grid} aria-label="Balances">
            {CURRENCY_ORDER.map((code) => {
              const meta = CURRENCIES[code];
              const raw = balances && typeof balances[code] === 'number' ? balances[code] : 0;
              return (
                <div key={code} className={styles.balanceCard}>
                  <span className={styles.balanceLabel}>{meta?.label || code}</span>
                  <span className={styles.balanceValue}>{formatAmount(code, raw)}</span>
                  <span className={styles.balanceHint}>{meta?.longName || code}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.linkRow}>
            <Link to="/earn" className={styles.linkCard}>
              <Gift size={16} /> Earn rewards
            </Link>
            <Link to="/redeem" className={styles.linkCard}>
              <Ticket size={16} /> Redeem a code
            </Link>
            <Link to="/refer" className={styles.linkCard}>
              <Share2 size={16} /> Refer &amp; earn
            </Link>
            <Link to="/transactions" className={styles.linkCard}>
              <Receipt size={16} /> Transaction history
            </Link>
          </div>

          <div className={`vl-card ${styles.panel}`}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Recent activity</h2>
                <p className={styles.muted}>The latest movements on your reward wallet.</p>
              </div>
              <Link to="/transactions" className="vl-btn vl-btn-ghost vl-btn-sm">
                View all
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className={styles.emptyBox}>
                <Receipt size={28} aria-hidden="true" />
                <p>No wallet movements yet. Claim an activity or redeem a code to start.</p>
              </div>
            ) : (
              <ul className={styles.list}>
                {recent.map((tx) => (
                  <li key={tx.id || tx.transactionId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>{tx.description || tx.type}</p>
                      <p className={styles.rowMeta}>
                        {fmtDate(tx.createdAt)} · {String(tx.type || '').replace(/_/g, ' ').toLowerCase()}
                      </p>
                    </div>
                    <span className={tx.direction === 'DEBIT' ? styles.amountDown : styles.amountUp}>
                      {tx.direction === 'DEBIT' ? (
                        <ArrowDownRight size={13} aria-hidden="true" />
                      ) : (
                        <ArrowUpRight size={13} aria-hidden="true" />
                      )}{' '}
                      {tx.direction === 'DEBIT' ? '−' : '+'}
                      {formatAmount(tx.currency, tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
