import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchTransactions } from '../../services/rewardsService.js';
import { CURRENCIES, formatAmount } from '../../config/currencies.js';
import styles from './Rewards.module.css';

const TYPES = [
  { value: '', label: 'All movements' },
  { value: 'ACTIVITY_REWARD', label: 'Activity reward' },
  { value: 'REFERRAL_REWARD', label: 'Referral reward' },
  { value: 'PROMO_CODE', label: 'Reward code' },
  { value: 'GIVEAWAY_ENTRY', label: 'Giveaway entry' },
  { value: 'ADMIN_ADJUSTMENT', label: 'Admin adjustment' },
];

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function typeLabel(type) {
  const found = TYPES.find((t) => t.value === type);
  return found ? found.label : String(type || '—').replace(/_/g, ' ').toLowerCase();
}

/**
 * Transaction History — the member's own reward-ledger rows, newest first, with
 * the balance before/after each movement and the server's filter support.
 */
export default function TransactionsPage() {
  const { authenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [currency, setCurrency] = useState('');
  const [type, setType] = useState('');
  const [state, setState] = useState({ loading: true, error: null });

  const load = useCallback(
    async (page = 1) => {
      if (!authenticated) {
        setState({ loading: false, error: null });
        setItems([]);
        return;
      }
      setState({ loading: true, error: null });
      try {
        const query = { page, limit: 20 };
        if (currency) query.currency = currency;
        if (type) query.type = type;
        const res = await fetchTransactions(query);
        setItems(res.items);
        setMeta(res.meta);
        setState({ loading: false, error: null });
      } catch (err) {
        setState({ loading: false, error: err.message });
        setItems([]);
      }
    },
    [authenticated, currency, type],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="VELOOP · Rewards"
        title="Transaction"
        gradientWord="History"
        subtitle="Every credit and debit on your reward wallet, with the resulting balance."
      />

      {!authenticated ? (
        <div className={`vl-card ${styles.panel} ${styles.stateBox}`}>
          <Receipt size={34} aria-hidden="true" />
          <p>Sign in to see your reward transaction history.</p>
          <Link to="/login" className="vl-btn vl-btn-cta">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <div className={`vl-card ${styles.panel}`}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="tx-currency">
                  Currency
                </label>
                <select
                  id="tx-currency"
                  className={styles.select}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="">All currencies</option>
                  {Object.values(CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="tx-type">
                  Movement type
                </label>
                <select id="tx-type" className={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={`vl-card ${styles.panel}`}>
            {state.loading ? (
              <div className={styles.stateBox}>
                <div className={styles.spinner} />
                <span>Loading transactions…</span>
              </div>
            ) : state.error ? (
              <div className={styles.errorBox}>
                <AlertTriangle size={24} aria-hidden="true" />
                <p>{state.error}</p>
                <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => load(1)}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className={styles.emptyBox}>
                <Receipt size={30} aria-hidden="true" />
                <p>No transactions match this filter yet.</p>
              </div>
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Balance before</th>
                        <th>Balance after</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((tx) => (
                        <tr key={tx.id || tx.transactionId}>
                          <td>{fmtDate(tx.createdAt)}</td>
                          <td>{tx.description || '—'}</td>
                          <td>{typeLabel(tx.type)}</td>
                          <td>
                            <span className={tx.direction === 'DEBIT' ? styles.amountDown : styles.amountUp}>
                              {tx.direction === 'DEBIT' ? (
                                <ArrowDownRight size={12} aria-hidden="true" />
                              ) : (
                                <ArrowUpRight size={12} aria-hidden="true" />
                              )}{' '}
                              {tx.direction === 'DEBIT' ? '−' : '+'}
                              {formatAmount(tx.currency, tx.amount)}
                            </span>
                          </td>
                          <td>{typeof tx.balanceBefore === 'number' ? formatAmount(tx.currency, tx.balanceBefore) : '—'}</td>
                          <td>{typeof tx.balanceAfter === 'number' ? formatAmount(tx.currency, tx.balanceAfter) : '—'}</td>
                          <td>
                            <span
                              className={`${styles.tag} ${
                                tx.status === 'SUCCESS' ? styles.tagOk : tx.status === 'FAILED' ? styles.tagWarn : ''
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={styles.pagination}>
                  <span className={styles.paginationMeta}>
                    Page {meta.page} of {meta.totalPages} · {meta.total} movements
                  </span>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="vl-btn vl-btn-ghost vl-btn-sm"
                      disabled={meta.page <= 1}
                      onClick={() => load(meta.page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="vl-btn vl-btn-ghost vl-btn-sm"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => load(meta.page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
