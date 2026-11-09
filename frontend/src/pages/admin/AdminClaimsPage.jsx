import { useState, useEffect, useCallback } from 'react';
import {
  PackageCheck,
  Search,
  Filter,
  Clock,
  CalendarPlus,
  RefreshCw,
  AlertTriangle,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchClaimsQueue,
  updateClaimStatus,
  extendClaimDeadline,
  sweepExpiredClaims,
} from '../../services/adminService.js';
import ClaimReviewModal from '../../components/admin/ClaimReviewModal.jsx';
import ClaimExtendModal from '../../components/admin/ClaimExtendModal.jsx';
import styles from './AdminClaimsPage.module.css';

const STATUS_FILTERS = [
  { label: 'All Claims', value: '' },
  { label: 'Submitted (Pending Review)', value: 'SUBMITTED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Not Submitted', value: 'NOT_SUBMITTED' },
  { label: 'Expired', value: 'EXPIRED' },
];

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);

  const [sweeping, setSweeping] = useState(false);

  const loadData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page, limit: 15 };
      if (statusFilter) query.status = statusFilter;

      const res = await fetchClaimsQueue(query);
      setClaims(res.items || []);
      setMeta(res.meta || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load claims.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handleSweepExpired = async () => {
    if (!window.confirm('Sweep all open claims past their deadline to EXPIRED? This cannot be undone.')) return;
    setSweeping(true);
    try {
      const res = await sweepExpiredClaims();
      alert(`Expired ${res.expired || 0} overdue claim(s).`);
      await loadData(meta.page);
    } catch (err) {
      alert(err.message || 'Failed to sweep expired claims.');
    } finally {
      setSweeping(false);
    }
  };

  const handleSaveReview = async ({ claimId, status, note }) => {
    await updateClaimStatus(claimId, { status, note });
    await loadData(meta.page);
  };

  const handleSaveExtend = async ({ claimId, days, reason }) => {
    await extendClaimDeadline(claimId, { days, reason });
    await loadData(meta.page);
  };

  return (
    <div className={styles.container}>
      {/* Top Header & Actions */}
      <div className={styles.topBar}>
        <div className={styles.statusTabs}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.filterBtn} ${statusFilter === f.value ? styles.filterBtnActive : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="vl-btn vl-btn-ghost vl-btn-sm"
          onClick={handleSweepExpired}
          disabled={sweeping}
          title="Sweep overdue claims"
        >
          <RefreshCw size={14} className={sweeping ? styles.spin : ''} />
          {sweeping ? 'Sweeping...' : 'Sweep Overdue'}
        </button>
      </div>

      {/* Claims Table */}
      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Loading claims queue...</span>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={24} />
            <p>{error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadData(1)}>
              Retry
            </button>
          </div>
        ) : claims.length === 0 ? (
          <div className={styles.emptyBox}>
            <PackageCheck size={36} />
            <h3>No Claims in Queue</h3>
            <p>No claims match the selected status filter.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Recipient / Target</th>
                  <th>Claim Type</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => {
                  const isPastDeadline = new Date(c.deadlineAt) < new Date();
                  const p = c.fulfillment?.physical;
                  const d = c.fulfillment?.digital;
                  return (
                    <tr key={c.id || c._id}>
                      <td>
                        <div className={styles.idCell}>
                          <code>{c.id || c._id}</code>
                          <span className={styles.userRef}>User: {c.userId}</span>
                        </div>
                      </td>
                      <td>
                        {p ? (
                          <div className={styles.recipientCell}>
                            <strong>{p.recipientName}</strong>
                            <span>
                              {p.city}, {p.country}
                            </span>
                          </div>
                        ) : d ? (
                          <div className={styles.recipientCell}>
                            <strong>{d.deliveryEmail || d.deliveryTargetMasked}</strong>
                            <span>Digital delivery</span>
                          </div>
                        ) : (
                          <span className={styles.mutedText}>Not submitted yet</span>
                        )}
                      </td>
                      <td>
                        <span className={styles.claimTypeBadge}>{c.claimType}</span>
                      </td>
                      <td>
                        <div className={styles.deadlineCell}>
                          <span className={isPastDeadline ? styles.deadlinePassed : styles.deadlineActive}>
                            {new Date(c.deadlineAt).toLocaleDateString()}
                          </span>
                          {isPastDeadline && c.status === 'NOT_SUBMITTED' && (
                            <span className={styles.expiredBadge}>Overdue</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`badge_${c.status}`]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            type="button"
                            className="vl-btn vl-btn-outline vl-btn-sm"
                            onClick={() => {
                              setSelectedClaim(c);
                              setReviewModalOpen(true);
                            }}
                            title="Inspect details & advance status"
                          >
                            <Eye size={13} />
                            <span>Review</span>
                          </button>
                          {c.status !== 'EXPIRED' && (
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => {
                                setSelectedClaim(c);
                                setExtendModalOpen(true);
                              }}
                              title="Extend claim deadline"
                            >
                              <CalendarPlus size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className={styles.pagination}>
            <span className={styles.pageMeta}>
              Page {meta.page} of {meta.totalPages} ({meta.total} claims)
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

      {/* Modals */}
      <ClaimReviewModal
        claim={selectedClaim}
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onSave={handleSaveReview}
      />

      <ClaimExtendModal
        claim={selectedClaim}
        isOpen={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        onSave={handleSaveExtend}
      />
    </div>
  );
}
