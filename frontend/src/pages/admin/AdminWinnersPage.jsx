import { useState, useEffect, useCallback } from 'react';
import {
  Award,
  Sparkles,
  Send,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  fetchGiveaways,
  fetchGiveawayWinners,
  fetchGiveawayConfig,
  executeDraw,
  notifyDrawWinners,
  publishDrawWinners,
  verifyWinner,
} from '../../services/adminService.js';
import DrawModal from '../../components/admin/DrawModal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './AdminWinnersPage.module.css';

export default function AdminWinnersPage() {
  const { showSuccess, showError } = useToast();
  const [giveaways, setGiveaways] = useState([]);
  const [selectedGiveawayId, setSelectedGiveawayId] = useState('');
  const [prizes, setPrizes] = useState([]);
  const [winners, setWinners] = useState([]);
  const [loadingGiveaways, setLoadingGiveaways] = useState(true);
  const [loadingWinners, setLoadingWinners] = useState(false);

  // Modals & Action states
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Verification modal
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [targetWinner, setTargetWinner] = useState(null);
  const [newVerificationStatus, setNewVerificationStatus] = useState('VERIFIED');
  const [verificationReason, setVerificationReason] = useState('');
  const [savingVerification, setSavingVerification] = useState(false);

  // Load Giveaways
  useEffect(() => {
    let alive = true;
    async function initGiveaways() {
      try {
        setLoadingGiveaways(true);
        const res = await fetchGiveaways({ limit: 100, sort: 'createdAt', order: 'desc' });
        if (!alive) return;
        const list = res.items || [];
        setGiveaways(list);
        if (list.length > 0) {
          setSelectedGiveawayId(list[0]._id);
        }
      } catch (err) {
        if (alive) showError(err.message || 'Failed to load campaigns list.');
      } finally {
        if (alive) setLoadingGiveaways(false);
      }
    }
    initGiveaways();
    return () => { alive = false; };
  }, [showError]);

  // Load Winners and Prizes for selected giveaway
  const loadWinners = useCallback(async (giveawayId) => {
    if (!giveawayId) {
      setWinners([]);
      setPrizes([]);
      return;
    }
    try {
      setLoadingWinners(true);
      const [winnersRes, configRes] = await Promise.all([
        fetchGiveawayWinners(giveawayId, { limit: 100 }),
        fetchGiveawayConfig(giveawayId),
      ]);
      setWinners(winnersRes.items || []);
      setPrizes(configRes.prizes || []);
    } catch (err) {
      showError(err.message || 'Failed to load winners for this campaign.');
    } finally {
      setLoadingWinners(false);
    }
  }, [showError]);

  useEffect(() => {
    if (selectedGiveawayId) {
      loadWinners(selectedGiveawayId);
    }
  }, [selectedGiveawayId, loadWinners]);

  const selectedGiveaway = giveaways.find((g) => g._id === selectedGiveawayId);

  // Draw Trigger
  const handleExecuteDraw = async ({ prizeId, count }) => {
    try {
      const res = await executeDraw(selectedGiveawayId, { prizeId, count });
      showSuccess(`Successfully selected ${res.drawnCount || count} winner(s) via CSPRNG!`);
      setDrawModalOpen(false);
      await loadWinners(selectedGiveawayId);
    } catch (err) {
      showError(err.message || 'Failed to execute winner draw.');
    }
  };

  // Notify Winners
  const handleNotifyWinners = async () => {
    try {
      setNotifying(true);
      const res = await notifyDrawWinners(selectedGiveawayId);
      showSuccess(`Dispatched claim notifications to ${res.notifiedCount || winners.length} winner(s).`);
      await loadWinners(selectedGiveawayId);
    } catch (err) {
      showError(err.message || 'Failed to dispatch winner notifications.');
    } finally {
      setNotifying(false);
    }
  };

  // Publish Winners
  const handlePublishWinners = async () => {
    try {
      setPublishing(true);
      const res = await publishDrawWinners(selectedGiveawayId);
      showSuccess(`Published winner roster to public leaderboard (${res.publishedCount || winners.length} winners).`);
      await loadWinners(selectedGiveawayId);
    } catch (err) {
      showError(err.message || 'Failed to publish winners to public leaderboard.');
    } finally {
      setPublishing(false);
    }
  };

  // Update Winner Verification
  const handleSaveVerification = async (e) => {
    e.preventDefault();
    if (!targetWinner) return;
    try {
      setSavingVerification(true);
      await verifyWinner(targetWinner._id, {
        verificationStatus: newVerificationStatus,
        reason: verificationReason.trim() || undefined,
      });
      showSuccess(`Winner verification updated to ${newVerificationStatus}.`);
      setVerifyModalOpen(false);
      setTargetWinner(null);
      setVerificationReason('');
      await loadWinners(selectedGiveawayId);
    } catch (err) {
      showError(err.message || 'Failed to update winner verification.');
    } finally {
      setSavingVerification(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Winner Management</h1>
          <p className={styles.pageSubtitle}>
            Execute cryptographic CSPRNG draws, verify winner identities, dispatch claim notifications, and publish leaderboards.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className="vl-btn vl-btn-outline"
            disabled={!selectedGiveawayId || winners.length === 0 || notifying}
            onClick={handleNotifyWinners}
          >
            <Send size={15} />
            <span>{notifying ? 'Notifying...' : 'Notify Winners'}</span>
          </button>

          <button
            type="button"
            className="vl-btn vl-btn-outline"
            disabled={!selectedGiveawayId || winners.length === 0 || publishing}
            onClick={handlePublishWinners}
          >
            <Globe size={15} />
            <span>{publishing ? 'Publishing...' : 'Publish to Storefront'}</span>
          </button>

          <button
            type="button"
            className="vl-btn vl-btn-primary"
            disabled={!selectedGiveawayId || prizes.length === 0}
            onClick={() => setDrawModalOpen(true)}
          >
            <Sparkles size={15} />
            <span>Execute Draw</span>
          </button>
        </div>
      </div>

      {/* Campaign Selector */}
      <div className={`${styles.controlsCard} vl-card`}>
        <div className={styles.filterRow}>
          <div className={styles.selectWrap}>
            <label className="vl-field-label" htmlFor="winner-giveaway-select">Giveaway Campaign</label>
            <select
              id="winner-giveaway-select"
              className={styles.selectInput}
              value={selectedGiveawayId}
              onChange={(e) => setSelectedGiveawayId(e.target.value)}
              disabled={loadingGiveaways || giveaways.length === 0}
            >
              {giveaways.length === 0 ? (
                <option value="">No campaigns found</option>
              ) : (
                giveaways.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.title} ({g.status})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Winners Table */}
      <div className={`${styles.tableCard} vl-card`}>
        {loadingWinners ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p>Loading winners roster...</p>
          </div>
        ) : winners.length === 0 ? (
          <div className={styles.emptyState}>
            <Award size={48} className={styles.emptyIcon} />
            <h3>No Winners Drawn Yet</h3>
            <p>
              This campaign has not drawn winners yet. When ready, click "Execute Draw" to select winners using cryptographic CSPRNG.
            </p>
            {prizes.length > 0 && (
              <button
                type="button"
                className="vl-btn vl-btn-primary"
                onClick={() => setDrawModalOpen(true)}
              >
                <Sparkles size={16} />
                <span>Draw Winners Now</span>
              </button>
            )}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Winner Identity</th>
                  <th>Prize Tier</th>
                  <th>Winning Ticket</th>
                  <th>Draw Date</th>
                  <th>Verification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w, idx) => {
                  const prize = prizes.find((p) => p._id === w.prizeId);
                  const isVerified = w.verificationStatus === 'VERIFIED';
                  const isRejected = w.verificationStatus === 'REJECTED';
                  return (
                    <tr key={w._id || idx}>
                      <td>
                        <div className={styles.rankBadge}>#{w.rank || idx + 1}</div>
                      </td>
                      <td>
                        <div className={styles.winnerUser}>
                          <span className={styles.userAlias}>
                            {w.publicAlias || w.displayName || 'Anonymous Winner'}
                          </span>
                          <span className={styles.userIdSub}>{w.userId}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{prize?.name || 'Prize Tier'}</strong>
                      </td>
                      <td>
                        <span className={styles.ticketCell}>
                          {w.winningTicketId ? w.winningTicketId.slice(-8) : `#${w.ticketIndex ?? idx}`}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.82rem', color: 'var(--vl-text-muted)' }}>
                          {w.drawnAt ? new Date(w.drawnAt).toLocaleDateString() : 'Recent'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusChip} ${
                            isVerified
                              ? styles.statusVerified
                              : isRejected
                              ? styles.statusRejected
                              : styles.statusPending
                          }`}
                        >
                          {w.verificationStatus || 'PENDING'}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          <button
                            type="button"
                            className={styles.verifyBtn}
                            onClick={() => {
                              setTargetWinner(w);
                              setNewVerificationStatus(w.verificationStatus || 'VERIFIED');
                              setVerificationReason('');
                              setVerifyModalOpen(true);
                            }}
                          >
                            <ShieldCheck size={14} />
                            <span>Verify</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Draw Modal */}
      {drawModalOpen && prizes.length > 0 && (
        <DrawModal
          isOpen={drawModalOpen}
          onClose={() => setDrawModalOpen(false)}
          onConfirm={handleExecuteDraw}
          prize={prizes[0]}
          giveawayTitle={selectedGiveaway?.title || 'Current Campaign'}
        />
      )}

      {/* Winner Verification Modal */}
      {verifyModalOpen && targetWinner && (
        <div className={styles.modalBackdrop} onClick={() => setVerifyModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              <ShieldCheck size={20} /> Winner Verification Status
            </h3>
            <form onSubmit={handleSaveVerification}>
              <div className={styles.modalBody}>
                <p>
                  Reviewing entrant <strong>{targetWinner.userId}</strong> (Rank #{targetWinner.rank || 1}).
                </p>

                <div className={styles.modalField}>
                  <label htmlFor="verify-status">Verification Decision</label>
                  <select
                    id="verify-status"
                    className={styles.selectInput}
                    value={newVerificationStatus}
                    onChange={(e) => setNewVerificationStatus(e.target.value)}
                  >
                    <option value="VERIFIED">Verified (Eligible for Prize Fulfillment)</option>
                    <option value="PENDING">Pending (Awaiting Identity or Compliance Check)</option>
                    <option value="REJECTED">Rejected (Disqualified from Prize Tier)</option>
                  </select>
                </div>

                <div className={styles.modalField}>
                  <label htmlFor="verify-reason">Audit Note / Reason</label>
                  <textarea
                    id="verify-reason"
                    rows={3}
                    className="vl-input"
                    placeholder="Provide operator context or compliance notes..."
                    value={verificationReason}
                    onChange={(e) => setVerificationReason(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className="vl-btn vl-btn-outline"
                  disabled={savingVerification}
                  onClick={() => setVerifyModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="vl-btn vl-btn-primary"
                  disabled={savingVerification}
                >
                  {savingVerification ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
