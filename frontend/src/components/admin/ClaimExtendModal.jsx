import { useState } from 'react';
import { X, CalendarPlus, AlertCircle } from 'lucide-react';
import styles from './ClaimExtendModal.module.css';

export default function ClaimExtendModal({ claim, isOpen, onClose, onSave }) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !claim) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!reason.trim()) {
      setError('Audit reason is required for extending a claim deadline.');
      return;
    }

    setBusy(true);
    try {
      await onSave({
        claimId: claim.id || claim._id,
        days: Number(days),
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to extend claim deadline.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <CalendarPlus size={20} className={styles.icon} />
            <h2>Extend Claim Deadline</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.errorBanner} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.infoCard}>
            <div className={styles.infoRow}>
              <span>Claim Reference:</span>
              <code>{claim.id || claim._id}</code>
            </div>
            <div className={styles.infoRow}>
              <span>Current Deadline:</span>
              <strong>{new Date(claim.deadlineAt).toLocaleString()}</strong>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="ext-days">Days to Extend Forward (from now)</label>
            <input
              id="ext-days"
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="ext-reason">Mandatory Audit Reason *</label>
            <textarea
              id="ext-reason"
              rows={2}
              placeholder="e.g. Winner contacted support requesting extension due to travel"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className="vl-btn vl-btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="vl-btn vl-btn-primary" disabled={busy}>
              {busy ? 'Extending...' : 'Confirm Extension'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
