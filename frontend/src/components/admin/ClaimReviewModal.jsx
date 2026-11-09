import { useState } from 'react';
import { X, CheckCircle, Package, Mail, MapPin, AlertCircle, Save } from 'lucide-react';
import styles from './ClaimReviewModal.module.css';

const CLAIM_STATUS_OPTIONS = [
  'NOT_SUBMITTED',
  'SUBMITTED',
  'PROCESSING',
  'COMPLETED',
];

export default function ClaimReviewModal({ claim, isOpen, onClose, onSave }) {
  const [status, setStatus] = useState(claim?.status || 'SUBMITTED');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !claim) return null;

  const fulfillment = claim.fulfillment || {};
  const isPhysical = Boolean(fulfillment.physical);
  const isDigital = Boolean(fulfillment.digital);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      await onSave({
        claimId: claim.id || claim._id,
        status,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update claim.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <Package size={20} className={styles.pkgIcon} />
            <h2>Review Prize Claim Fulfillment</h2>
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

          {/* Claim Metadata */}
          <div className={styles.infoGrid}>
            <div className={styles.infoCol}>
              <span>Claim Reference:</span>
              <code>{claim.id || claim._id}</code>
            </div>
            <div className={styles.infoCol}>
              <span>Winner User ID:</span>
              <code>{claim.userId}</code>
            </div>
            <div className={styles.infoCol}>
              <span>Claim Type:</span>
              <strong>{claim.claimType}</strong>
            </div>
            <div className={styles.infoCol}>
              <span>Current Status:</span>
              <span className={`${styles.statusChip} ${styles[`status_${claim.status}`]}`}>
                {claim.status}
              </span>
            </div>
            <div className={styles.infoCol}>
              <span>Submission Deadline:</span>
              <strong>{new Date(claim.deadlineAt).toLocaleString()}</strong>
            </div>
            <div className={styles.infoCol}>
              <span>Submitted On:</span>
              <strong>
                {claim.submittedAt ? new Date(claim.submittedAt).toLocaleString() : 'Not yet submitted'}
              </strong>
            </div>
          </div>

          {/* Fulfillment Details Section */}
          <div className={styles.fulfillmentCard}>
            <h3 className={styles.sectionHeading}>
              {isPhysical ? <MapPin size={16} /> : <Mail size={16} />}
              Recipient Fulfillment Details
            </h3>

            {isPhysical && (
              <div className={styles.physicalDetails}>
                <div className={styles.detailRow}>
                  <span>Recipient Name:</span>
                  <strong>{fulfillment.physical?.recipientName || '—'}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Address Line 1:</span>
                  <strong>{fulfillment.physical?.addressLine1 || '—'}</strong>
                </div>
                {fulfillment.physical?.addressLine2 && (
                  <div className={styles.detailRow}>
                    <span>Address Line 2:</span>
                    <strong>{fulfillment.physical?.addressLine2}</strong>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <span>City, State, Zip:</span>
                  <strong>
                    {fulfillment.physical?.city || '—'}, {fulfillment.physical?.state || '—'} {fulfillment.physical?.postalCode || '—'}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Country:</span>
                  <strong className={styles.countryBadge}>{fulfillment.physical?.country || '—'}</strong>
                </div>
                {fulfillment.physical?.phone && (
                  <div className={styles.detailRow}>
                    <span>Contact Phone:</span>
                    <strong>{fulfillment.physical?.phone}</strong>
                  </div>
                )}
              </div>
            )}

            {isDigital && (
              <div className={styles.digitalDetails}>
                <div className={styles.detailRow}>
                  <span>Delivery Email:</span>
                  <strong>{fulfillment.digital?.deliveryEmail || fulfillment.digital?.deliveryTargetMasked || '—'}</strong>
                </div>
              </div>
            )}

            {!isPhysical && !isDigital && (
              <p className={styles.emptyFulfillment}>
                {claim.status === 'NOT_SUBMITTED'
                  ? 'The winner has not submitted fulfillment details yet.'
                  : 'Automatic fulfillment (no contact details required).'}
              </p>
            )}
          </div>

          {/* Status Update Field */}
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label htmlFor="cl-status">Advance Fulfillment Status</label>
              <select
                id="cl-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {CLAIM_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="cl-note">Internal Operator Note (Audit Trail)</label>
              <input
                id="cl-note"
                type="text"
                placeholder="e.g. Courier tracking #TRK-984218 added"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className="vl-btn vl-btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="vl-btn vl-btn-primary" disabled={busy}>
              <Save size={16} />
              {busy ? 'Saving...' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
