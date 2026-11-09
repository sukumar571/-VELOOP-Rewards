import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Gift,
  Plus,
  Search,
  Filter,
  Eye,
  EyeOff,
  Edit,
  ArrowRight,
  Clock,
  ArrowUpDown,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchGiveaways,
  createNewGiveaway,
  modifyGiveaway,
  togglePublishGiveaway,
  changeGiveawayStatus,
} from '../../services/adminService.js';
import GiveawayFormModal from '../../components/admin/GiveawayFormModal.jsx';
import styles from './AdminGiveawaysPage.module.css';

const ALLOWED_TRANSITIONS = {
  UPCOMING: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ENDED'],
  ENDED: ['ARCHIVED'],
  ARCHIVED: [],
};

export default function AdminGiveawaysPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [giveaways, setGiveaways] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedGiveaway, setSelectedGiveaway] = useState(null);

  // Transition modal state
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [transitionStatus, setTransitionStatus] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionBusy, setTransitionBusy] = useState(false);

  // Query filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [publishedFilter, setPublishedFilter] = useState('');

  const loadData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page, limit: 15 };
      if (search.trim()) query.search = search.trim();
      if (statusFilter) query.status = statusFilter;
      if (publishedFilter === 'true') query.published = true;
      if (publishedFilter === 'false') query.published = false;

      const res = await fetchGiveaways(query);
      setGiveaways(res.items || []);
      setMeta(res.meta || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load giveaways.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, publishedFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  // Handle ?action=new query param
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setSelectedGiveaway(null);
      setFormModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handlePublishToggle = async (g) => {
    const nextState = !g.published;
    const confirmMsg = nextState
      ? `Publish "${g.title}" so it becomes visible on the public storefront?`
      : `Unpublish "${g.title}"? Non-admin visitors will no longer see it.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await togglePublishGiveaway(g._id, nextState, 'Operator toggle from admin table');
      await loadData(meta.page);
    } catch (err) {
      alert(err.message || 'Failed to toggle publication state.');
    }
  };

  const handleOpenTransition = (g) => {
    setTransitionTarget(g);
    const allowed = ALLOWED_TRANSITIONS[g.status] || [];
    setTransitionStatus(allowed[0] || '');
    setTransitionReason('');
  };

  const handleExecuteTransition = async (e) => {
    e.preventDefault();
    if (!transitionTarget || !transitionStatus) return;

    setTransitionBusy(true);
    try {
      await changeGiveawayStatus(transitionTarget._id, transitionStatus, transitionReason);
      setTransitionTarget(null);
      await loadData(meta.page);
    } catch (err) {
      alert(err.message || 'Failed to execute status transition.');
    } finally {
      setTransitionBusy(false);
    }
  };

  const handleSaveGiveaway = async (payload) => {
    if (selectedGiveaway?._id) {
      await modifyGiveaway(selectedGiveaway._id, payload);
    } else {
      await createNewGiveaway(payload);
    }
    await loadData(meta.page);
  };

  return (
    <div className={styles.container}>
      {/* Top Action Bar */}
      <div className={styles.topBar}>
        <div className={styles.filterGroup}>
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search title or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.selectWrap}>
            <Filter size={15} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="UPCOMING">UPCOMING</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ENDED">ENDED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>

          <div className={styles.selectWrap}>
            <select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value)}>
              <option value="">All Visibility</option>
              <option value="true">Published</option>
              <option value="false">Draft / Unpublished</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          className="vl-btn vl-btn-primary"
          onClick={() => {
            setSelectedGiveaway(null);
            setFormModalOpen(true);
          }}
        >
          <Plus size={16} /> Create Giveaway
        </button>
      </div>

      {/* Giveaways Table */}
      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Loading giveaways...</span>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={24} />
            <p>{error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadData(1)}>
              Retry
            </button>
          </div>
        ) : giveaways.length === 0 ? (
          <div className={styles.emptyBox}>
            <Gift size={36} className={styles.emptyIcon} />
            <h3>No Giveaways Found</h3>
            <p>No campaign matches the current search and filter criteria.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Giveaway</th>
                  <th>Dates (Window)</th>
                  <th>Status</th>
                  <th>Visibility</th>
                  <th>Entrants</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {giveaways.map((g) => {
                  const allowedTransitions = ALLOWED_TRANSITIONS[g.status] || [];
                  return (
                    <tr key={g._id}>
                      <td>
                        <div className={styles.nameCell}>
                          <Link to={`/admin/giveaways/${g._id}`} className={styles.titleLink}>
                            {g.title}
                          </Link>
                          <span className={styles.slugCode}>/{g.slug}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.dateCell}>
                          <div className={styles.dateRow}>
                            <Clock size={12} />
                            <span>{new Date(g.startAt).toLocaleDateString()}</span>
                          </div>
                          <span className={styles.dateSub}>
                            to {new Date(g.endAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`badge_${g.status}`]}`}>
                          {g.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.pubBadge} ${g.published ? styles.pubActive : styles.pubDraft}`}
                          onClick={() => handlePublishToggle(g)}
                          title="Click to toggle publication"
                        >
                          {g.published ? <Eye size={12} /> : <EyeOff size={12} />}
                          <span>{g.published ? 'Published' : 'Draft'}</span>
                        </button>
                      </td>
                      <td>
                        <span className={styles.entryCount}>
                          {g.stats?.participationCount ?? 0}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <Link
                            to={`/admin/giveaways/${g._id}`}
                            className={styles.iconBtn}
                            title="Manage prizes, entries, and draw"
                          >
                            <ArrowRight size={15} />
                          </Link>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => {
                              setSelectedGiveaway(g);
                              setFormModalOpen(true);
                            }}
                            title="Edit configuration"
                          >
                            <Edit size={15} />
                          </button>
                          {allowedTransitions.length > 0 && (
                            <button
                              type="button"
                              className={styles.transitionBtn}
                              onClick={() => handleOpenTransition(g)}
                              title="Transition lifecycle status"
                            >
                              <ArrowUpDown size={13} />
                              <span>Advance</span>
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
              Page {meta.page} of {meta.totalPages} ({meta.total} items)
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

      {/* Giveaway Create/Edit Modal */}
      <GiveawayFormModal
        isOpen={formModalOpen}
        giveaway={selectedGiveaway}
        onClose={() => setFormModalOpen(false)}
        onSave={handleSaveGiveaway}
      />

      {/* Transition Modal */}
      {transitionTarget && (
        <div className={styles.modalOverlay} onClick={() => setTransitionTarget(null)}>
          <div className={`${styles.transitionModal} vl-card`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.transitionHeader}>
              <h3>Advance Giveaway Status</h3>
              <button type="button" onClick={() => setTransitionTarget(null)} className={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={handleExecuteTransition} className={styles.transitionForm}>
              <p className={styles.transitionLead}>
                Moving <strong>"{transitionTarget.title}"</strong> from current status{' '}
                <code>{transitionTarget.status}</code>.
              </p>

              <div className={styles.field}>
                <label htmlFor="tr-target">Target State</label>
                <select
                  id="tr-target"
                  value={transitionStatus}
                  onChange={(e) => setTransitionStatus(e.target.value)}
                  required
                >
                  {(ALLOWED_TRANSITIONS[transitionTarget.status] || []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="tr-reason">Audit Reason (Optional)</label>
                <input
                  id="tr-reason"
                  type="text"
                  placeholder="e.g. Entry window closed on schedule"
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                />
              </div>

              <div className={styles.transitionActions}>
                <button
                  type="button"
                  className="vl-btn vl-btn-ghost"
                  onClick={() => setTransitionTarget(null)}
                  disabled={transitionBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="vl-btn vl-btn-primary" disabled={transitionBusy}>
                  {transitionBusy ? 'Advancing...' : 'Confirm Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
