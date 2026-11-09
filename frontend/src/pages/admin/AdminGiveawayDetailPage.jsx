import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Settings,
  Trophy,
  Users,
  Award,
  Plus,
  Eye,
  EyeOff,
  Edit,
  Sparkles,
  Send,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  Clock,
  Shield,
  Layers,
} from 'lucide-react';
import {
  fetchGiveawayConfig,
  modifyGiveaway,
  togglePublishGiveaway,
  changeGiveawayStatus,
  addPrizeTier,
  modifyPrizeTier,
  fetchParticipations,
  voidEntrantParticipation,
  fetchGiveawayWinners,
  executeDraw,
  notifyDrawWinners,
  publishDrawWinners,
  verifyWinner,
} from '../../services/adminService.js';
import GiveawayFormModal from '../../components/admin/GiveawayFormModal.jsx';
import PrizeFormModal from '../../components/admin/PrizeFormModal.jsx';
import DrawModal from '../../components/admin/DrawModal.jsx';
import styles from './AdminGiveawayDetailPage.module.css';

export default function AdminGiveawayDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null); // { giveaway, prizes }
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'prizes' | 'entrants' | 'winners'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState(null);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [drawTargetPrize, setDrawTargetPrize] = useState(null);

  // Tab Data
  const [entrants, setEntrants] = useState([]);
  const [entrantsMeta, setEntrantsMeta] = useState({});
  const [entrantsLoading, setEntrantsLoading] = useState(false);

  const [winners, setWinners] = useState([]);
  const [winnersMeta, setWinnersMeta] = useState({});
  const [winnersLoading, setWinnersLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchGiveawayConfig(id);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load giveaway configuration.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load entrants when tab is active
  const loadEntrants = useCallback(async () => {
    try {
      setEntrantsLoading(true);
      const res = await fetchParticipations({ giveawayId: id, limit: 50 });
      setEntrants(res.items || []);
      setEntrantsMeta(res.meta || {});
    } catch (err) {
      console.error(err);
    } finally {
      setEntrantsLoading(false);
    }
  }, [id]);

  // Load winners when tab is active
  const loadWinners = useCallback(async () => {
    try {
      setWinnersLoading(true);
      const res = await fetchGiveawayWinners(id, { limit: 50 });
      setWinners(res.items || []);
      setWinnersMeta(res.meta || {});
    } catch (err) {
      console.error(err);
    } finally {
      setWinnersLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'entrants') loadEntrants();
    if (activeTab === 'winners') loadWinners();
  }, [activeTab, loadEntrants, loadWinners]);

  const handlePublishToggle = async () => {
    if (!data?.giveaway) return;
    const g = data.giveaway;
    const next = !g.published;
    if (!window.confirm(next ? 'Publish this giveaway publicly?' : 'Unpublish this giveaway?')) return;
    try {
      await togglePublishGiveaway(g._id, next, 'Detail page toggle');
      await loadConfig();
    } catch (err) {
      alert(err.message || 'Failed to toggle publication state.');
    }
  };

  const handleSaveGiveaway = async (payload) => {
    await modifyGiveaway(id, payload);
    await loadConfig();
  };

  const handleSavePrize = async (payload) => {
    if (selectedPrize?._id) {
      await modifyPrizeTier(selectedPrize._id, payload);
    } else {
      await addPrizeTier(id, payload);
    }
    await loadConfig();
  };

  const handleTogglePrizeActive = async (prize) => {
    const next = !prize.active;
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} prize tier "${prize.name}"?`)) return;
    try {
      await modifyPrizeTier(prize._id, { active: next });
      await loadConfig();
    } catch (err) {
      alert(err.message || 'Failed to update prize status.');
    }
  };

  const handleOpenDraw = (prize) => {
    setDrawTargetPrize(prize);
    setDrawModalOpen(true);
  };

  const handleExecuteDraw = async (payload) => {
    const res = await executeDraw(id, payload);
    await loadConfig();
    if (activeTab === 'winners') await loadWinners();
    return res;
  };

  const handleNotifyWinners = async (prizeId) => {
    if (!window.confirm('Send private notification to drawn winners? This advances status from HOLD to PRIVATE_NOTIFIED.')) return;
    try {
      await notifyDrawWinners(id, { prizeId });
      alert('Winners marked as PRIVATE_NOTIFIED.');
      await loadWinners();
    } catch (err) {
      alert(err.message || 'Failed to notify winners.');
    }
  };

  const handlePublishWinners = async (prizeId) => {
    if (!window.confirm('PUBLISH WINNERS PUBLICLY? This is a ONE-WAY action making masked winners visible on the public Winners page.')) return;
    try {
      await publishDrawWinners(id, { prizeId });
      alert('Winners published successfully!');
      await loadWinners();
    } catch (err) {
      alert(err.message || 'Failed to publish winners.');
    }
  };

  const handleVerifyWinner = async (winnerId, verificationStatus) => {
    let reason = '';
    if (verificationStatus === 'DISQUALIFIED') {
      reason = window.prompt('Enter mandatory reason for winner disqualification:');
      if (!reason || !reason.trim()) {
        alert('Disqualification reason is required.');
        return;
      }
    }
    try {
      await verifyWinner(winnerId, { verificationStatus, reason });
      await loadWinners();
    } catch (err) {
      alert(err.message || 'Failed to update winner verification.');
    }
  };

  const handleVoidParticipation = async (participationId) => {
    const reason = window.prompt('Reason for voiding/disqualifying this participation:');
    if (!reason || !reason.trim()) return;
    const refund = window.confirm('Issue compensating wallet refund for any paid entry fee?');
    try {
      await voidEntrantParticipation(participationId, {
        mode: 'VOIDED_FRAUD',
        reason: reason.trim(),
        refund,
      });
      alert('Participation voided successfully.');
      await loadEntrants();
    } catch (err) {
      alert(err.message || 'Failed to void participation.');
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <span>Loading giveaway configuration...</span>
      </div>
    );
  }

  if (error || !data?.giveaway) {
    return (
      <div className={`${styles.errorCard} vl-card`}>
        <AlertCircle size={32} className={styles.errorIcon} />
        <h2>Giveaway Not Found</h2>
        <p>{error || 'The requested giveaway could not be retrieved.'}</p>
        <Link to="/admin/giveaways" className="vl-btn vl-btn-outline">
          <ArrowLeft size={16} /> Back to Giveaways
        </Link>
      </div>
    );
  }

  const { giveaway, prizes = [] } = data;

  return (
    <div className={styles.container}>
      {/* Back Link & Header */}
      <div className={styles.topNav}>
        <Link to="/admin/giveaways" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Giveaways
        </Link>
      </div>

      <div className={`${styles.headerCard} vl-card`}>
        <div className={styles.headerMain}>
          <div>
            <div className={styles.headerBadges}>
              <span className={`${styles.statusChip} ${styles[`status_${giveaway.status}`]}`}>
                {giveaway.status}
              </span>
              <button
                type="button"
                className={`${styles.pubBadge} ${giveaway.published ? styles.pubYes : styles.pubNo}`}
                onClick={handlePublishToggle}
                title="Click to toggle publication"
              >
                {giveaway.published ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>{giveaway.published ? 'Published' : 'Draft (Hidden)'}</span>
              </button>
            </div>
            <h1 className={styles.giveawayTitle}>{giveaway.title}</h1>
            <span className={styles.slugCode}>/{giveaway.slug}</span>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className="vl-btn vl-btn-outline vl-btn-sm"
              onClick={() => setEditModalOpen(true)}
            >
              <Edit size={15} /> Edit Config
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'config' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <Settings size={16} /> Configuration & Rules
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'prizes' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('prizes')}
          >
            <Trophy size={16} /> Prize Tiers ({prizes.length})
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'entrants' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('entrants')}
          >
            <Users size={16} /> Entrants ({giveaway.stats?.participationCount ?? 0})
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'winners' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('winners')}
          >
            <Award size={16} /> Winners & CSPRNG Draw
          </button>
        </div>
      </div>

      {/* Tab 1: Configuration */}
      {activeTab === 'config' && (
        <div className={styles.tabContent}>
          <div className={styles.grid2}>
            <div className={`${styles.cardBox} vl-card`}>
              <h3 className={styles.boxTitle}>Schedule & Dates</h3>
              <div className={styles.propList}>
                <div className={styles.propRow}>
                  <span>Start Timestamp:</span>
                  <strong>{new Date(giveaway.startAt).toLocaleString()}</strong>
                </div>
                <div className={styles.propRow}>
                  <span>End Timestamp:</span>
                  <strong>{new Date(giveaway.endAt).toLocaleString()}</strong>
                </div>
                <div className={styles.propRow}>
                  <span>Status:</span>
                  <span className={`${styles.statusChip} ${styles[`status_${giveaway.status}`]}`}>
                    {giveaway.status}
                  </span>
                </div>
                <div className={styles.propRow}>
                  <span>Featured Campaign:</span>
                  <strong>{giveaway.featured ? 'Yes' : 'No'}</strong>
                </div>
              </div>
            </div>

            <div className={`${styles.cardBox} vl-card`}>
              <h3 className={styles.boxTitle}>Participation Policies</h3>
              <div className={styles.propList}>
                <div className={styles.propRow}>
                  <span>Free Entries Allocated:</span>
                  <strong>{giveaway.participation?.freeEntryCount ?? 0}</strong>
                </div>
                <div className={styles.propRow}>
                  <span>Max Entries / Member:</span>
                  <strong>{giveaway.participation?.maxEntriesPerUser ?? 'Unlimited'}</strong>
                </div>
                <div className={styles.propRow}>
                  <span>Allowed Currencies:</span>
                  <div className={styles.currencyChips}>
                    {(giveaway.participation?.entryCurrencies || ['VE']).map((c) => (
                      <span key={c} className={styles.currChip}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.propRow}>
                  <span>Paid Entries Allowed:</span>
                  <strong>{giveaway.participation?.paidEntriesAllowed !== false ? 'Yes' : 'No'}</strong>
                </div>
              </div>
            </div>

            <div className={`${styles.cardBox} vl-card`}>
              <h3 className={styles.boxTitle}>Draw & Claim Parameters</h3>
              <div className={styles.propList}>
                <div className={styles.propRow}>
                  <span>Selection Algorithm:</span>
                  <strong>{giveaway.prizeConfig?.drawMethod || 'RANDOM'}</strong>
                </div>
                <div className={styles.propRow}>
                  <span>Claim Window:</span>
                  <strong>{giveaway.prizeConfig?.claimWindowDays || 7} Days</strong>
                </div>
                <div className={styles.propRow}>
                  <span>Allow Multi-Tier Winners:</span>
                  <strong>{giveaway.prizeConfig?.allowDuplicateWinners ? 'Yes' : 'No'}</strong>
                </div>
              </div>
            </div>

            <div className={`${styles.cardBox} vl-card`}>
              <h3 className={styles.boxTitle}>Rules & Legal</h3>
              <div className={styles.propList}>
                <div className={styles.propRowFull}>
                  <span>Rules Summary:</span>
                  <p className={styles.rulesText}>{giveaway.rules?.summary || 'No summary configured.'}</p>
                </div>
                {giveaway.description && (
                  <div className={styles.propRowFull}>
                    <span>Description:</span>
                    <p className={styles.rulesText}>{giveaway.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Prize Tiers */}
      {activeTab === 'prizes' && (
        <div className={styles.tabContent}>
          <div className={styles.sectionActionBar}>
            <div>
              <h3 className={styles.sectionHeading}>Configured Prize Tiers</h3>
              <p className={styles.sectionSubtext}>
                Tiers define the rewards, entry fee requirements, and total winners drawn.
              </p>
            </div>
            <button
              type="button"
              className="vl-btn vl-btn-primary vl-btn-sm"
              onClick={() => {
                setSelectedPrize(null);
                setPrizeModalOpen(true);
              }}
            >
              <Plus size={15} /> Add Prize Tier
            </button>
          </div>

          <div className={styles.prizesGrid}>
            {prizes.length === 0 ? (
              <div className={`${styles.emptyCard} vl-card`}>
                <Trophy size={36} className={styles.emptyIcon} />
                <h4>No Prize Tiers Configured</h4>
                <p>Create at least one prize tier so users can participate and win.</p>
              </div>
            ) : (
              prizes.map((p) => (
                <div key={p._id} className={`${styles.prizeCard} vl-card ${!p.active ? styles.prizeInactive : ''}`}>
                  <div className={styles.prizeCardHeader}>
                    <div className={styles.rankBadge}>Rank #{p.position}</div>
                    <span className={`${styles.prizeTypeBadge} ${styles[`pt_${p.prizeType}`]}`}>
                      {p.prizeType}
                    </span>
                  </div>

                  <h4 className={styles.prizeName}>{p.name}</h4>
                  <p className={styles.prizeDesc}>{p.description || 'No description.'}</p>

                  <div className={styles.prizeMetaList}>
                    <div className={styles.prizeMetaRow}>
                      <span>Winner Slots:</span>
                      <strong>{p.winnerCount} winner(s)</strong>
                    </div>
                    <div className={styles.prizeMetaRow}>
                      <span>Entry Fee:</span>
                      <strong>
                        {p.entryAmount > 0 ? `${p.entryAmount} ${p.entryCurrency}` : 'FREE Tier'}
                      </strong>
                    </div>
                    <div className={styles.prizeMetaRow}>
                      <span>Claim Interaction:</span>
                      <strong>{p.claimType}</strong>
                    </div>
                    <div className={styles.prizeMetaRow}>
                      <span>Status:</span>
                      <strong className={p.active ? styles.colorGreen : styles.colorMuted}>
                        {p.active ? 'Active' : 'Inactive'}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.prizeActions}>
                    <button
                      type="button"
                      className="vl-btn vl-btn-ghost vl-btn-sm"
                      onClick={() => {
                        setSelectedPrize(p);
                        setPrizeModalOpen(true);
                      }}
                    >
                      <Edit size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="vl-btn vl-btn-ghost vl-btn-sm"
                      onClick={() => handleTogglePrizeActive(p)}
                    >
                      {p.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      className="vl-btn vl-btn-outline vl-btn-sm"
                      onClick={() => handleOpenDraw(p)}
                      title="Run winner draw for this tier"
                    >
                      <Sparkles size={14} /> Run Draw
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Entrants */}
      {activeTab === 'entrants' && (
        <div className={styles.tabContent}>
          <div className={`${styles.tableCard} vl-card`}>
            <div className={styles.tableHeaderBar}>
              <h3 className={styles.sectionHeading}>Registered Entrants</h3>
              <span className={styles.metaCount}>Total: {entrants.length}</span>
            </div>

            {entrantsLoading ? (
              <div className={styles.loadingBox}>
                <div className={styles.spinner} />
                <span>Loading participants...</span>
              </div>
            ) : entrants.length === 0 ? (
              <div className={styles.emptyBox}>
                <Users size={32} />
                <p>No participants have entered this giveaway yet.</p>
              </div>
            ) : (
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Participant (User ID)</th>
                      <th>Prize Target</th>
                      <th>Entries</th>
                      <th>Joined At</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entrants.map((ent) => (
                      <tr key={ent.id || ent._id}>
                        <td>
                          <code>{ent.userId}</code>
                        </td>
                        <td>
                          <span className={styles.prizeRef}>
                            {ent.prizeId ? `Prize #${ent.prizeId.slice(-4)}` : 'All Tiers'}
                          </span>
                        </td>
                        <td>
                          <strong>{ent.entryCount}</strong>
                        </td>
                        <td>
                          <span className={styles.dateSub}>
                            {new Date(ent.joinedAt).toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.statusChip} ${styles[`status_${ent.status}`]}`}>
                            {ent.status}
                          </span>
                        </td>
                        <td>
                          {ent.status === 'CONFIRMED' && (
                            <button
                              type="button"
                              className={styles.voidBtn}
                              onClick={() => handleVoidParticipation(ent.id || ent._id)}
                              title="Void participation and refund entry fee"
                            >
                              <XCircle size={14} /> Void / DQ
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Winners & Draw */}
      {activeTab === 'winners' && (
        <div className={styles.tabContent}>
          <div className={`${styles.tableCard} vl-card`}>
            <div className={styles.tableHeaderBar}>
              <div>
                <h3 className={styles.sectionHeading}>Drawn Winners</h3>
                <p className={styles.sectionSubtext}>
                  Winners drawn via CSPRNG. Winners on HOLD must be notified or published to become visible to the public.
                </p>
              </div>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  className="vl-btn vl-btn-outline vl-btn-sm"
                  onClick={() => handleNotifyWinners()}
                >
                  <Send size={14} /> Notify All
                </button>
                <button
                  type="button"
                  className="vl-btn vl-btn-primary vl-btn-sm"
                  onClick={() => handlePublishWinners()}
                >
                  <Globe size={14} /> Publish Winners Publicly
                </button>
              </div>
            </div>

            {winnersLoading ? (
              <div className={styles.loadingBox}>
                <div className={styles.spinner} />
                <span>Loading winner records...</span>
              </div>
            ) : winners.length === 0 ? (
              <div className={styles.emptyBox}>
                <Award size={36} />
                <h4>No Winners Selected Yet</h4>
                <p>Run a CSPRNG draw from the "Prize Tiers" tab once the entry window is closed.</p>
              </div>
            ) : (
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Masked Public Alias</th>
                      <th>Account Subject</th>
                      <th>Announcement</th>
                      <th>Verification</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winners.map((w) => (
                      <tr key={w.id || w._id}>
                        <td>
                          <strong>#{w.rank}</strong>
                        </td>
                        <td>
                          <span className={styles.aliasBadge}>
                            {w.displayInfo?.displayAlias || 'Member'}
                          </span>
                        </td>
                        <td>
                          <code>{w.userId}</code>
                        </td>
                        <td>
                          <span className={`${styles.statusChip} ${styles[`announce_${w.announcementStatus}`]}`}>
                            {w.announcementStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.statusChip} ${styles[`verify_${w.verificationStatus}`]}`}>
                            {w.verificationStatus}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actionButtons}>
                            {w.verificationStatus !== 'VERIFIED' && (
                              <button
                                type="button"
                                className={styles.iconBtnGreen}
                                onClick={() => handleVerifyWinner(w.id || w._id, 'VERIFIED')}
                                title="Mark Verified"
                              >
                                <CheckCircle2 size={15} />
                              </button>
                            )}
                            {w.verificationStatus !== 'DISQUALIFIED' && (
                              <button
                                type="button"
                                className={styles.iconBtnRed}
                                onClick={() => handleVerifyWinner(w.id || w._id, 'DISQUALIFIED')}
                                title="Disqualify Winner"
                              >
                                <XCircle size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <GiveawayFormModal
        isOpen={editModalOpen}
        giveaway={giveaway}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveGiveaway}
      />

      <PrizeFormModal
        isOpen={prizeModalOpen}
        prize={selectedPrize}
        giveawayId={id}
        onClose={() => setPrizeModalOpen(false)}
        onSave={handleSavePrize}
      />

      <DrawModal
        isOpen={drawModalOpen}
        giveaway={giveaway}
        prize={drawTargetPrize}
        freeSlots={drawTargetPrize?.winnerCount || 1}
        onClose={() => setDrawModalOpen(false)}
        onDrawComplete={handleExecuteDraw}
      />
    </div>
  );
}
