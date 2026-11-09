import { useState } from 'react';
import { X, Sparkles, AlertCircle, ShieldCheck } from 'lucide-react';
import styles from './DrawModal.module.css';

export default function DrawModal({ giveaway, prize, freeSlots = 1, isOpen, onClose, onDrawComplete }) {
  const [count, setCount] = useState(freeSlots);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drawResult, setDrawResult] = useState(null);

  if (!isOpen || !giveaway || !prize) return null;

  const handleDraw = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const result = await onDrawComplete({
        giveawayId: giveaway._id,
        prizeId: prize._id,
        count: Number(count),
      });
      setDrawResult(result);
    } catch (err) {
      setError(err.message || 'Draw execution failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <Sparkles size={20} className={styles.sparkleIcon} />
            <h2>Execute CSPRNG Winner Draw</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {drawResult ? (
          <div className={styles.resultBox}>
            <div className={styles.resultHeader}>
              <ShieldCheck size={36} className={styles.successIcon} />
              <h3>Draw Completed Successfully!</h3>
              <p>Cryptographic randomness verified via <code>crypto.randomInt</code>.</p>
            </div>

            <div className={styles.statsSummary}>
              <div className={styles.statItem}>
                <span>Candidates Evaluated:</span>
                <strong>{drawResult.candidateCount}</strong>
              </div>
              <div className={styles.statItem}>
                <span>Winners Selected:</span>
                <strong>{drawResult.drawn?.length || 0}</strong>
              </div>
              <div className={styles.statItem}>
                <span>Claim Window:</span>
                <strong>{drawResult.claimWindowDays} days</strong>
              </div>
              <div className={styles.statItem}>
                <span>Free Slots Remaining:</span>
                <strong>{drawResult.freeSlotsAfter}</strong>
              </div>
            </div>

            <p className={styles.noticeText}>
              Selected winners are initialized on <strong>HOLD</strong>. To release them publicly, use the
              <strong>"Publish Winners"</strong> action on the Winners tab.
            </p>

            <button type="button" className="vl-btn vl-btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleDraw} className={styles.form}>
            {error && (
              <div className={styles.errorBanner} role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.infoCard}>
              <div className={styles.infoRow}>
                <span>Giveaway:</span>
                <strong>{giveaway.title}</strong>
              </div>
              <div className={styles.infoRow}>
                <span>Target Prize Tier:</span>
                <strong>{prize.name} (Rank #{prize.position})</strong>
              </div>
              <div className={styles.infoRow}>
                <span>Total Tier Capacity:</span>
                <strong>{prize.winnerCount} winner(s)</strong>
              </div>
              <div className={styles.infoRow}>
                <span>Free Slots to Fill:</span>
                <strong className={styles.highlight}>{freeSlots} slot(s)</strong>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="draw-count">Number of Winners to Draw (1 to {freeSlots})</label>
              <input
                id="draw-count"
                type="number"
                min={1}
                max={freeSlots}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
              />
              <span className={styles.fieldHint}>
                The CSPRNG algorithm will select candidates weighted by their confirmed entries or equal odds according to giveaway configuration.
              </span>
            </div>

            <div className={styles.warningBox}>
              <AlertCircle size={18} />
              <div>
                <strong>Audited Operation:</strong> This action creates permanent winner records and opens claim deadlines. It is recorded with an immutable audit log entry.
              </div>
            </div>

            <div className={styles.actions}>
              <button type="button" className="vl-btn vl-btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="vl-btn vl-btn-cta" disabled={busy || freeSlots <= 0}>
                <Sparkles size={16} />
                {busy ? 'Drawing Winners...' : 'Run CSPRNG Draw'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
