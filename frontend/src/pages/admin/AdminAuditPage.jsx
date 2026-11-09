import { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Filter, Eye, Clock, User, AlertTriangle } from 'lucide-react';
import { fetchAuditTrail } from '../../services/adminService.js';
import styles from './AdminAuditPage.module.css';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inspector modal
  const [inspectLog, setInspectLog] = useState(null);

  const loadData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page, limit: 20 };
      if (actionFilter.trim()) query.action = actionFilter.trim();
      if (entityFilter) query.entityType = entityFilter;

      const res = await fetchAuditTrail(query);
      setLogs(res.items || []);
      setMeta(res.meta || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>Immutable Audit Trail</h2>
          <p className={styles.pageLead}>
            Cryptographically audited record of every configuration change, draw execution, and claim transition.
          </p>
        </div>

        <div className={styles.filters}>
          <input
            type="text"
            placeholder="Filter by action (e.g. prize.create)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className={styles.input}
          />

          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className={styles.select}>
            <option value="">All Entities</option>
            <option value="Giveaway">Giveaway</option>
            <option value="Prize">Prize</option>
            <option value="PrizeClaim">PrizeClaim</option>
            <option value="GiveawayParticipation">GiveawayParticipation</option>
            <option value="FraudEvent">FraudEvent</option>
          </select>
        </div>
      </div>

      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Loading audit log entries...</span>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={24} />
            <p>{error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadData(1)}>
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className={styles.emptyBox}>
            <FileText size={36} />
            <h3>No Audit Logs Found</h3>
            <p>No actions match the active query parameters.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Entity ID</th>
                  <th>Actor (Operator)</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id || log._id}>
                    <td>
                      <div className={styles.dateCell}>
                        <Clock size={12} />
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.actionBadge}>{log.action}</span>
                    </td>
                    <td>
                      <strong>{log.entityType}</strong>
                    </td>
                    <td>
                      <code>{String(log.entityId).slice(-8)}</code>
                    </td>
                    <td>
                      <div className={styles.actorCell}>
                        <User size={13} />
                        <span>{log.actorId ? `usr:${String(log.actorId).slice(-6)}` : 'System'}</span>
                        <span className={styles.roleSub}>({log.actorRole || 'admin'})</span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="vl-btn vl-btn-outline vl-btn-sm"
                        onClick={() => setInspectLog(log)}
                        title="View before/after diff"
                      >
                        <Eye size={13} />
                        <span>Inspect Diff</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className={styles.pagination}>
            <span className={styles.pageMeta}>
              Page {meta.page} of {meta.totalPages} ({meta.total} audit entries)
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

      {/* Diff Inspector Modal */}
      {inspectLog && (
        <div className={styles.modalOverlay} onClick={() => setInspectLog(null)}>
          <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleWrap}>
                <FileText size={20} className={styles.iconViolet} />
                <h3>Audit Entry Inspector: {inspectLog.action}</h3>
              </div>
              <button type="button" onClick={() => setInspectLog(null)} className={styles.closeBtn}>
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.auditMetaGrid}>
                <div className={styles.metaCol}>
                  <span>Entity Type:</span>
                  <strong>{inspectLog.entityType}</strong>
                </div>
                <div className={styles.metaCol}>
                  <span>Entity ID:</span>
                  <code>{inspectLog.entityId}</code>
                </div>
                <div className={styles.metaCol}>
                  <span>Actor Subject:</span>
                  <code>{inspectLog.actorId}</code>
                </div>
                <div className={styles.metaCol}>
                  <span>Request ID:</span>
                  <code>{inspectLog.requestId || '—'}</code>
                </div>
              </div>

              {inspectLog.reason && (
                <div className={styles.reasonBox}>
                  <strong>Recorded Audit Reason:</strong>
                  <p>{inspectLog.reason}</p>
                </div>
              )}

              <div className={styles.diffGrid}>
                {inspectLog.before && (
                  <div className={styles.diffCol}>
                    <span className={styles.diffLabel}>Before Mutation</span>
                    <pre className={styles.jsonBox}>{JSON.stringify(inspectLog.before, null, 2)}</pre>
                  </div>
                )}
                {inspectLog.after && (
                  <div className={styles.diffCol}>
                    <span className={styles.diffLabel}>After Mutation</span>
                    <pre className={styles.jsonBox}>{JSON.stringify(inspectLog.after, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
