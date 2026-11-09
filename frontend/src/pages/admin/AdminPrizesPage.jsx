import { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Plus,
  Search,
  Sparkles,
  Edit,
  AlertCircle,
  Package,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { fetchGiveaways, fetchGiveawayConfig, addPrizeTier, modifyPrizeTier, executeDraw } from '../../services/adminService.js';
import PrizeFormModal from '../../components/admin/PrizeFormModal.jsx';
import DrawModal from '../../components/admin/DrawModal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './AdminPrizesPage.module.css';

export default function AdminPrizesPage() {
  const { showSuccess, showError } = useToast();
  const [giveaways, setGiveaways] = useState([]);
  const [selectedGiveawayId, setSelectedGiveawayId] = useState('');
  const [prizes, setPrizes] = useState([]);
  const [loadingGiveaways, setLoadingGiveaways] = useState(true);
  const [loadingPrizes, setLoadingPrizes] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [claimTypeFilter, setClaimTypeFilter] = useState('');

  // Modals
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState(null);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [targetPrizeForDraw, setTargetPrizeForDraw] = useState(null);

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

  // Load Prizes for selected giveaway
  const loadPrizes = useCallback(async (giveawayId) => {
    if (!giveawayId) {
      setPrizes([]);
      return;
    }
    try {
      setLoadingPrizes(true);
      const conf = await fetchGiveawayConfig(giveawayId);
      setPrizes(conf.prizes || []);
    } catch (err) {
      showError(err.message || 'Failed to load prize tiers for this giveaway.');
    } finally {
      setLoadingPrizes(false);
    }
  }, [showError]);

  useEffect(() => {
    if (selectedGiveawayId) {
      loadPrizes(selectedGiveawayId);
    }
  }, [selectedGiveawayId, loadPrizes]);

  // Handle Save Prize Tier
  const handleSavePrize = async (formData) => {
    try {
      if (selectedPrize) {
        await modifyPrizeTier(selectedPrize._id, formData);
        showSuccess(`Prize tier "${formData.name}" updated successfully.`);
      } else {
        await addPrizeTier(selectedGiveawayId, formData);
        showSuccess(`Prize tier "${formData.name}" added successfully.`);
      }
      setPrizeModalOpen(false);
      setSelectedPrize(null);
      await loadPrizes(selectedGiveawayId);
    } catch (err) {
      showError(err.message || 'Failed to save prize tier.');
    }
  };

  // Handle Execute Draw
  const handleExecuteDraw = async ({ prizeId, count }) => {
    try {
      const result = await executeDraw(selectedGiveawayId, { prizeId, count });
      showSuccess(`Successfully drew ${result.drawnCount || count} winner(s)!`);
      setDrawModalOpen(false);
      setTargetPrizeForDraw(null);
      await loadPrizes(selectedGiveawayId);
    } catch (err) {
      showError(err.message || 'Failed to execute winner draw.');
    }
  };

  const selectedGiveaway = giveaways.find((g) => g._id === selectedGiveawayId);

  // Filtered prizes
  const filteredPrizes = prizes.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    if (typeFilter && p.prizeType !== typeFilter) return false;
    if (claimTypeFilter && p.claimType !== claimTypeFilter) return false;
    return true;
  });

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Prize Management</h1>
          <p className={styles.pageSubtitle}>
            Configure multi-tier rewards, entry currency overrides, fulfillment channels, and execute winner draws.
          </p>
        </div>
        <button
          type="button"
          className="vl-btn vl-btn-primary"
          disabled={!selectedGiveawayId}
          onClick={() => {
            setSelectedPrize(null);
            setPrizeModalOpen(true);
          }}
        >
          <Plus size={16} />
          <span>Add Prize Tier</span>
        </button>
      </div>

      {/* Campaign Selector & Filters */}
      <div className={`${styles.controlsCard} vl-card`}>
        <div className={styles.filterRow}>
          <div className={styles.selectWrap}>
            <label className="vl-field-label" htmlFor="giveaway-select">Selected Giveaway Campaign</label>
            <select
              id="giveaway-select"
              className={styles.selectInput}
              value={selectedGiveawayId}
              onChange={(e) => setSelectedGiveawayId(e.target.value)}
              disabled={loadingGiveaways || giveaways.length === 0}
            >
              {giveaways.length === 0 ? (
                <option value="">No giveaways available</option>
              ) : (
                giveaways.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.title} ({g.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search prize tiers by name..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.selectWrap}>
            <select
              className={styles.selectInput}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by prize type"
            >
              <option value="">All Prize Types</option>
              <option value="PHYSICAL">Physical Delivery</option>
              <option value="DIGITAL">Digital / Code Pool</option>
            </select>
          </div>

          <div className={styles.selectWrap}>
            <select
              className={styles.selectInput}
              value={claimTypeFilter}
              onChange={(e) => setClaimTypeFilter(e.target.value)}
              aria-label="Filter by claim type"
            >
              <option value="">All Claim Types</option>
              <option value="FORM">Shipping Form</option>
              <option value="INSTANT">Instant Credit</option>
              <option value="VOUCHER">Voucher Code</option>
            </select>
          </div>
        </div>
      </div>

      {/* Prize Tiers Table */}
      <div className={`${styles.tableCard} vl-card`}>
        {loadingPrizes ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p>Loading prize tiers...</p>
          </div>
        ) : filteredPrizes.length === 0 ? (
          <div className={styles.emptyState}>
            <Trophy size={48} className={styles.emptyIcon} />
            <h3>No Prize Tiers Configured</h3>
            <p>
              {prizes.length === 0
                ? 'This giveaway does not have any prize tiers added yet.'
                : 'No prize tiers match the current search filters.'}
            </p>
            {selectedGiveawayId && prizes.length === 0 && (
              <button
                type="button"
                className="vl-btn vl-btn-outline"
                onClick={() => {
                  setSelectedPrize(null);
                  setPrizeModalOpen(true);
                }}
              >
                <Plus size={16} />
                <span>Create First Prize Tier</span>
              </button>
            )}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Prize Info</th>
                  <th>Type</th>
                  <th>Claim Workflow</th>
                  <th>Winners Cap</th>
                  <th>Entry Fee</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrizes.map((prize) => (
                  <tr key={prize._id}>
                    <td>
                      <span className={styles.tierBadge}>#{prize.position}</span>
                    </td>
                    <td>
                      <div className={styles.prizeMeta}>
                        <span className={styles.prizeName}>{prize.name}</span>
                        {prize.description && (
                          <span className={styles.prizeDesc}>{prize.description}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          prize.prizeType === 'PHYSICAL'
                            ? styles.tagPhysical
                            : styles.tagDigital
                        }
                      >
                        {prize.prizeType}
                      </span>
                    </td>
                    <td>
                      <code>{prize.claimType}</code>
                    </td>
                    <td>
                      <strong>{prize.winnerCount}</strong> slot(s)
                    </td>
                    <td>
                      <span>
                        {prize.entryAmount} {prize.entryCurrency}
                      </span>
                    </td>
                    <td>
                      <span className={prize.active !== false ? styles.tagActive : styles.tagInactive}>
                        {prize.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => {
                            setSelectedPrize(prize);
                            setPrizeModalOpen(true);
                          }}
                          title="Edit Prize Configuration"
                        >
                          <Edit size={14} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.drawBtn}`}
                          onClick={() => {
                            setTargetPrizeForDraw(prize);
                            setDrawModalOpen(true);
                          }}
                          title="Trigger Cryptographic Draw"
                        >
                          <Sparkles size={14} />
                          <span>Draw</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prize Form Modal */}
      {prizeModalOpen && (
        <PrizeFormModal
          isOpen={prizeModalOpen}
          onClose={() => {
            setPrizeModalOpen(false);
            setSelectedPrize(null);
          }}
          onSubmit={handleSavePrize}
          initialData={selectedPrize}
          giveawayCurrency={selectedGiveaway?.participation?.entryCurrencies?.[0] || 'VE'}
        />
      )}

      {/* Draw Modal */}
      {drawModalOpen && targetPrizeForDraw && (
        <DrawModal
          isOpen={drawModalOpen}
          onClose={() => {
            setDrawModalOpen(false);
            setTargetPrizeForDraw(null);
          }}
          onConfirm={handleExecuteDraw}
          prize={targetPrizeForDraw}
          giveawayTitle={selectedGiveaway?.title || 'Selected Giveaway'}
        />
      )}
    </div>
  );
}
