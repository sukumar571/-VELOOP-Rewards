import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Hash,
} from 'lucide-react';
import {
  fetchFraudQueue,
  fetchFraudDetails,
  claimFraudForReview,
  submitFraudDecision,
} from '../../services/adminService.js';
import styles from './AdminFraudPage.module.css';

export default function AdminFraudPage() {
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inspector modal
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);

  const loadData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page, limit: 15 };
      if (statusFilter) query.status = statusFilter;
      if (severityFilter) query.severity = severityFilter;

      const res = await fetchFraudQueue(query);
      setEvents(res.items || []);
      setMeta(res.meta || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load fraud events.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handleOpenDetail = async (ev) => {
    setSelectedEvent(ev);
    setDecisionNote('');
    setDetailLoading(true);
    try {
      const details = await fetchFraudDetails(ev.id);
      setEventDetail(details);
    } catch (err) {
      alert(err.message || 'Failed to load event details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClaimReview = async () => {
    if (!selectedEvent) return;
    setDecisionBusy(true);
    try {
      await claimFraudForReview(selectedEvent.id);
      alert('Event moved to UNDER_REVIEW.');
      const details = await fetchFraudDetails(selectedEvent.id);
      setEventDetail(details);
      await loadData(meta.page);
    } catch (err) {
      alert(err.message || 'Failed to claim event for review.');
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleDecision = async (decision) => {
    if (!selectedEvent) return;
    if (!decisionNote.trim()) {
      alert('Please enter an operator note explaining your decision.');
      return;
    }

    setDecisionBusy(true);
    try {
      await submitFraudDecision(selectedEvent.id, {
        decision,
        note: decisionNote.trim(),
      });
      alert(`Decision recorded as ${decision}.`);
      setSelectedEvent(null);
      await loadData(meta.page);
    } catch (err) {
      alert(err.message || 'Failed to record decision.');
    } finally {
      setDecisionBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>Anomaly & Fraud Review Queue</h2>
          <p className={styles.pageLead}>
            Review suspicious activity signals, rate-limit velocity triggers, and multi-accounting heuristics.
          </p>
        </div>

        <div className={styles.filters}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.select}>
            <option value="">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="DISMISSED">DISMISSED</option>
          </select>

          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className={styles.select}>
            <option value="">All Severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
      </div>

      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Loading anomaly flags...</span>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={24} />
            <p>{error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadData(1)}>
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className={styles.emptyBox}>
            <ShieldAlert size={36} />
            <h3>No Suspicious Events</h3>
            <p>No anomaly events found for the active filter set.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Event Type</th>
                  <th>Rule Triggered</th>
                  <th>Observed Metric</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <span className={`${styles.severityBadge} ${styles[`sev_${ev.severity}`]}`}>
                        {ev.severity}
                      </span>
                    </td>
                    <td>
                      <div className={styles.typeCell}>
                        <strong>{ev.type}</strong>
                        {ev.userId && <span className={styles.subtext}>User: {ev.userId.slice(-6)}</span>}
                      </div>
                    </td>
                    <td>
                      <code>{ev.signal?.ruleKey || 'SYSTEM_TRIGGER'}</code>
                    </td>
                    <td>
                      <span className={styles.metricText}>
                        {ev.signal?.metric || '—'} = <strong>{ev.signal?.observed ?? 0}</strong>{' '}
                        (threshold: {ev.signal?.threshold ?? '—'})
                      </span>
                    </td>
                    <td>
                      <span className={styles.dateSub}>
                        {new Date(ev.lastSeenAt).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusChip} ${styles[`status_${ev.status}`]}`}>
                        {ev.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="vl-btn vl-btn-outline vl-btn-sm"
                        onClick={() => handleOpenDetail(ev)}
                      >
                        <Eye size={13} />
                        <span>Inspect</span>
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
              Page {meta.page} of {meta.totalPages} ({meta.total} events)
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

      {/* Inspector Modal */}
      {selectedEvent && (
        <div className={styles.modalOverlay} onClick={() => setSelectedEvent(null)}>
          <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleWrap}>
                <ShieldAlert size={20} className={styles.iconAlert} />
                <h3>Inspect Anomaly Event</h3>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className={styles.closeBtn}>
                &times;
              </button>
            </div>

            {detailLoading ? (
              <div className={styles.modalLoading}>
                <div className={styles.spinner} />
                <span>Loading event provenance...</span>
              </div>
            ) : eventDetail ? (
              <div className={styles.modalBody}>
                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <span>Event ID:</span>
                    <code>{eventDetail.id}</code>
                  </div>
                  <div className={styles.metaItem}>
                    <span>Severity:</span>
                    <span className={`${styles.severityBadge} ${styles[`sev_${eventDetail.severity}`]}`}>
                      {eventDetail.severity}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span>Current Status:</span>
                    <span className={`${styles.statusChip} ${styles[`status_${eventDetail.status}`]}`}>
                      {eventDetail.status}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span>Occurrence Count:</span>
                    <strong>{eventDetail.occurrenceCount} occurrence(s)</strong>
                  </div>
                </div>

                <div className={styles.infoCard}>
                  <h4>Correlation Tokens & Signals (Privacy Preserving)</h4>
                  <div className={styles.infoRows}>
                    <div className={styles.infoRow}>
                      <span>Device Hash:</span>
                      <code>{eventDetail.deviceHash || 'None captured'}</code>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Session Hash:</span>
                      <code>{eventDetail.sessionHash || 'None captured'}</code>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Origin Country:</span>
                      <strong>{eventDetail.country || 'Unknown'}</strong>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Signal Rule:</span>
                      <strong>{eventDetail.signal?.ruleKey}</strong>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Observed vs Threshold:</span>
                      <strong>
                        {eventDetail.signal?.observed} (Limit: {eventDetail.signal?.threshold})
                      </strong>
                    </div>
                  </div>
                </div>

                {eventDetail.resolutionNote && (
                  <div className={styles.resolvedBox}>
                    <strong>Resolution Note:</strong>
                    <p>{eventDetail.resolutionNote}</p>
                    <span className={styles.resolvedMeta}>
                      Decided on {new Date(eventDetail.resolvedAt).toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Operator Actions */}
                {['OPEN', 'UNDER_REVIEW'].includes(eventDetail.status) && (
                  <div className={styles.actionForm}>
                    <div className={styles.field}>
                      <label htmlFor="op-note">Operator Decision Note *</label>
                      <input
                        id="op-note"
                        type="text"
                        placeholder="e.g. Cleared: legitimate promotional traffic spike verified"
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                      />
                    </div>

                    <div className={styles.modalActions}>
                      {eventDetail.status === 'OPEN' && (
                        <button
                          type="button"
                          className="vl-btn vl-btn-ghost vl-btn-sm"
                          onClick={handleClaimReview}
                          disabled={decisionBusy}
                        >
                          Mark Under Review
                        </button>
                      )}
                      <button
                        type="button"
                        className="vl-btn vl-btn-outline vl-btn-sm"
                        onClick={() => handleDecision('DISMISSED')}
                        disabled={decisionBusy}
                      >
                        <CheckCircle size={14} /> Dismiss False Positive
                      </button>
                      <button
                        type="button"
                        className="vl-btn vl-btn-primary vl-btn-sm"
                        onClick={() => handleDecision('CONFIRMED')}
                        disabled={decisionBusy}
                      >
                        <XCircle size={14} /> Confirm Violation
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
