import { useState, useEffect, useCallback } from 'react';
import { Receipt, Search, Filter, AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { fetchLedger } from '../../services/adminService.js';
import styles from './AdminLedgerPage.module.css';

export default function AdminLedgerPage() {
  const [transactions, setTransactions] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page, limit: 20 };
      if (statusFilter) query.status = statusFilter;

      const res = await fetchLedger(query);
      setTransactions(res.items || []);
      setMeta(res.meta || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load ledger transactions.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>Financial & Entry Ledger</h2>
          <p className={styles.pageLead}>
            Immutable ledger of entry fee debits, wallet observations, and compensating refunds.
          </p>
        </div>

        <div className={styles.filters}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.select}>
            <option value="">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
      </div>

      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Loading ledger entries...</span>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={24} />
            <p>{error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadData(1)}>
              Retry
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className={styles.emptyBox}>
            <Receipt size={36} />
            <h3>No Ledger Records</h3>
            <p>No transactions match the selected filter criteria.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Txn ID</th>
                  <th>User ID</th>
                  <th>Type</th>
                  <th>Amount & Currency</th>
                  <th>Entries</th>
                  <th>Balance (Before / After)</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isDebit = tx.type === 'ENTRY_DEBIT';
                  return (
                    <tr key={tx.id}>
                      <td>
                        <code>{tx.id.slice(-8)}</code>
                      </td>
                      <td>
                        <code>{tx.userId}</code>
                      </td>
                      <td>
                        <span className={styles.typeBadge}>{tx.type}</span>
                      </td>
                      <td>
                        <div className={styles.amountWrap}>
                          {isDebit ? (
                            <ArrowDownRight size={14} className={styles.iconDebit} />
                          ) : (
                            <ArrowUpRight size={14} className={styles.iconRefund} />
                          )}
                          <strong>
                            {tx.amount} {tx.currency}
                          </strong>
                        </div>
                      </td>
                      <td>
                        <span>+{tx.entriesGranted ?? 0}</span>
                      </td>
                      <td>
                        <span className={styles.balanceTrack}>
                          {tx.balanceBefore ?? '—'} &rarr; {tx.balanceAfter ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.dateSub}>
                          {new Date(tx.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.statusChip} ${styles[`status_${tx.status}`]}`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className={styles.pagination}>
            <span className={styles.pageMeta}>
              Page {meta.page} of {meta.totalPages} ({meta.total} transactions)
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => loadData(meta.page - 1)}
                className="vl-btn vl-btn-ghost vl-btn-sm"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => loadData(meta.page + 1)}
                className="vl-btn vl-btn-ghost vl-btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
