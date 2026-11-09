import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  AlertTriangle,
  Ban,
  Clock,
  Ticket,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { fetchParticipations, fetchGiveaways, voidEntrantParticipation } from '../../services/adminService.js';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './AdminParticipantsPage.module.css';

export default function AdminParticipantsPage() {
  const { showSuccess, showError } = useToast();
  const [giveaways, setGiveaways] = useState([]);
  const [giveawayFilter, setGiveawayFilter] = useState('');
  const [searchUserId, setSearchUserId] = useState('');
  const [participations, setParticipations] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Void confirmation modal
  const [selectedParticipation, setSelectedParticipation] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidMode, setVoidMode] = useState('VOIDED_FRAUD');
  const [voidRefund, setVoidRefund] = useState(false);
  const [submittingVoid, setSubmittingVoid] = useState(false);

  // Load giveaways for filter
  useEffect(() => {
    let alive = true;
    async function loadGiveawaysList() {
      try {
        const res = await fetchGiveaways({ limit: 100 });
        if (alive) setGiveaways(res.items || []);
      } catch (err) {
        console.error('Failed to load giveaways for participant filter:', err);
      }
    }
    loadGiveawaysList();
    return () => { alive = false; };
  }, []);

  // Load participations
  const loadParticipants = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const query = {
        page,
        limit: 15,
        sort: 'createdAt',
        order: 'desc',
      };
      if (giveawayFilter) query.giveawayId = giveawayFilter;
      if (searchUserId.trim()) query.userId = searchUserId.trim();

      const res = await fetchParticipations(query);
      setParticipations(res.items || []);
      setMeta(res.meta || { page, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      showError(err.message || 'Failed to load participants list.');
    } finally {
      setLoading(false);
    }
  }, [giveawayFilter, searchUserId, showError]);

  useEffect(() => {
    loadParticipants(1);
  }, [loadParticipants]);

  const handleVoidEntrant = async (e) => {
    e.preventDefault();
    if (!selectedParticipation) return;
    if (!voidReason.trim()) {
      showError('Please supply an audit reason for voiding this participation.');
      return;
    }

    try {
      setSubmittingVoid(true);
      await voidEntrantParticipation(selectedParticipation._id, {
        mode: voidMode,
        reason: voidReason.trim(),
        refund: voidRefund,
      });
      showSuccess(`Participant ${selectedParticipation.userId} voided successfully.`);
      setSelectedParticipation(null);
      setVoidReason('');
      await loadParticipants(meta.page);
    } catch (err) {
      showError(err.message || 'Failed to void participant.');
    } finally {
      setSubmittingVoid(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>Participants Directory</h1>
        <p className={styles.pageSubtitle}>
          Audit entrant records across all giveaway draws, inspect ticket allocations, and enforce disqualification policies.
        </p>
      </div>

      {/* Controls */}
      <div className={`${styles.controlsCard} vl-card`}>
        <div className={styles.filterRow}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by User ID (e.g. dev-veloop-0001)..."
              className={styles.searchInput}
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
            />
          </div>

          <div className={styles.selectWrap}>
            <select
              className={styles.selectInput}
              value={giveawayFilter}
              onChange={(e) => setGiveawayFilter(e.target.value)}
              aria-label="Filter by giveaway"
            >
              <option value="">All Giveaway Campaigns</option>
              {giveaways.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p>Loading participants directory...</p>
          </div>
        ) : participations.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={48} className={styles.emptyIcon} />
            <h3>No Participants Found</h3>
            <p>
              {searchUserId || giveawayFilter
                ? 'No participants match the specified filter criteria.'
                : 'No participants have entered any campaigns yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Participant ID</th>
                    <th>User / Account</th>
                    <th>Giveaway Reference</th>
                    <th>Total Entries</th>
                    <th>Registered At</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {participations.map((p) => {
                    const isVoided = p.status?.startsWith('VOIDED');
                    return (
                      <tr key={p._id}>
                        <td className={styles.idCell}>
                          {p._id ? p._id.slice(-8) : 'N/A'}
                        </td>
                        <td>
                          <div className={styles.userCell}>
                            <div className={styles.avatarMini}>
                              {p.userId ? p.userId.slice(0, 2).toUpperCase() : 'U'}
                            </div>
                            <span>{p.userId}</span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.idCell}>
                            {p.giveawayId ? p.giveawayId.slice(-8) : 'N/A'}
                          </span>
                        </td>
                        <td>
                          <div className={styles.ticketsCount}>
                            <Ticket size={14} style={{ marginRight: 4 }} />
                            {p.ticketsCount ?? 1}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--vl-text-muted)', fontSize: '0.82rem' }}>
                            <Clock size={13} />
                            {new Date(p.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td>
                          <span className={isVoided ? styles.statusVoided : styles.statusActive}>
                            {p.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.voidBtn}
                            disabled={isVoided}
                            onClick={() => {
                              setSelectedParticipation(p);
                              setVoidReason('');
                              setVoidMode('VOIDED_FRAUD');
                              setVoidRefund(false);
                            }}
                            title="Disqualify Entrant"
                          >
                            <Ban size={13} />
                            <span>{isVoided ? 'Disqualified' : 'Disqualify'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className={styles.pagination}>
              <span>
                Showing <strong>{participations.length}</strong> of <strong>{meta.total}</strong> entrants
              </span>
              <div className={styles.pageControls}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={meta.page <= 1}
                  onClick={() => loadParticipants(meta.page - 1)}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => loadParticipants(meta.page + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Void Modal */}
      {selectedParticipation && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedParticipation(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              <AlertTriangle size={20} /> Disqualify Entrant
            </h3>
            <div className={styles.modalBody}>
              <p>
                Are you sure you want to void the participation of user{' '}
                <strong>{selectedParticipation.userId}</strong>? Their entry tickets will be revoked and marked void in the draw pool.
              </p>

              <div className={styles.modalField}>
                <label htmlFor="void-mode">Disqualification Reason Mode</label>
                <select
                  id="void-mode"
                  className={styles.selectInput}
                  value={voidMode}
                  onChange={(e) => setVoidMode(e.target.value)}
                >
                  <option value="VOIDED_FRAUD">Fraud / Anti-Bot Policy Violation</option>
                  <option value="VOIDED_MANUAL">Administrative Discretion (Manual)</option>
                  <option value="VOIDED_CHARGEBACK">Payment Reversal / Chargeback</option>
                </select>
              </div>

              <div className={styles.modalField}>
                <label htmlFor="void-reason">Audit Reason Note (Required)</label>
                <textarea
                  id="void-reason"
                  rows={3}
                  className="vl-input"
                  placeholder="Detail the justification for this administrative disqualification..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="void-refund"
                  checked={voidRefund}
                  onChange={(e) => setVoidRefund(e.target.checked)}
                />
                <label htmlFor="void-refund" style={{ fontSize: '0.85rem', color: 'var(--vl-text)' }}>
                  Issue ledger refund for entry transaction fees
                </label>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className="vl-btn vl-btn-outline"
                disabled={submittingVoid}
                onClick={() => setSelectedParticipation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="vl-btn"
                style={{ background: 'var(--vl-red-500)', color: '#fff' }}
                disabled={submittingVoid || !voidReason.trim()}
                onClick={handleVoidEntrant}
              >
                {submittingVoid ? 'Voiding...' : 'Confirm Disqualification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
