import { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import styles from './PrizeFormModal.module.css';

const DEFAULT_PRIZE = {
  name: '',
  description: '',
  position: 1,
  winnerCount: 1,
  prizeType: 'PHYSICAL',
  claimType: 'FORM',
  entryCurrency: 'VE',
  entryAmount: 0,
  active: true,
  shipToCountries: 'IN, US, UK, CA, AE',
  digitalChannel: 'EMAIL',
};

export default function PrizeFormModal({ prize, giveawayId, isOpen, onClose, onSave }) {
  const [values, setValues] = useState(DEFAULT_PRIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isEdit = Boolean(prize?._id);

  useEffect(() => {
    if (prize) {
      setValues({
        name: prize.name || '',
        description: prize.description || '',
        position: prize.position || 1,
        winnerCount: prize.winnerCount || 1,
        prizeType: prize.prizeType || 'PHYSICAL',
        claimType: prize.claimType || 'FORM',
        entryCurrency: prize.entryCurrency || 'VE',
        entryAmount: prize.entryAmount || 0,
        active: prize.active !== undefined ? prize.active : true,
        shipToCountries: prize.claim?.physical?.shipToCountries?.join(', ') || '',
        digitalChannel: prize.claim?.digital?.channel || 'EMAIL',
      });
    } else {
      setValues(DEFAULT_PRIZE);
    }
    setError('');
  }, [prize, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!values.name.trim()) {
      setError('Please provide a prize title.');
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      position: Number(values.position),
      winnerCount: Number(values.winnerCount),
      prizeType: values.prizeType,
      claimType: values.claimType,
      entryCurrency: values.entryCurrency,
      entryAmount: Number(values.entryAmount),
      active: values.active,
      claim: {},
    };

    if (values.prizeType === 'PHYSICAL') {
      const countries = values.shipToCountries
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c));
      payload.claim.physical = {
        shipToCountries: countries.length ? countries : undefined,
      };
    } else {
      payload.claim.digital = {
        channel: values.digitalChannel,
      };
    }

    setBusy(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save prize tier.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{isEdit ? 'Edit Prize Tier' : 'Add Prize Tier'}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
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

          <div className={styles.fieldGrid}>
            <div className={styles.fieldFull}>
              <label htmlFor="pz-name">Prize Name *</label>
              <input
                id="pz-name"
                type="text"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                placeholder="e.g. iPhone 15 Pro 256GB"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="pz-pos">Tier Position / Rank</label>
              <input
                id="pz-pos"
                type="number"
                min={1}
                max={100}
                value={values.position}
                onChange={(e) => setValues({ ...values, position: e.target.value })}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="pz-slots">Winner Slots (Capacity) *</label>
              <input
                id="pz-slots"
                type="number"
                min={1}
                max={1000}
                value={values.winnerCount}
                onChange={(e) => setValues({ ...values, winnerCount: e.target.value })}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="pz-type">Prize Family</label>
              <select
                id="pz-type"
                value={values.prizeType}
                onChange={(e) => {
                  const pt = e.target.value;
                  setValues({
                    ...values,
                    prizeType: pt,
                    claimType: pt === 'PHYSICAL' ? 'FORM' : 'DIGITAL_DELIVERY',
                  });
                }}
              >
                <option value="PHYSICAL">PHYSICAL (Shipped item)</option>
                <option value="GIFT_CARD">GIFT_CARD (Voucher / Code)</option>
                <option value="DIGITAL">DIGITAL (Download / Token)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="pz-claim">Claim Interaction</label>
              <select
                id="pz-claim"
                value={values.claimType}
                onChange={(e) => setValues({ ...values, claimType: e.target.value })}
              >
                <option value="FORM">FORM (Winner enters address)</option>
                <option value="DIGITAL_DELIVERY">DIGITAL_DELIVERY (Email)</option>
                <option value="AUTOMATIC">AUTOMATIC (No action required)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="pz-curr">Entry Fee Currency</label>
              <select
                id="pz-curr"
                value={values.entryCurrency}
                onChange={(e) => setValues({ ...values, entryCurrency: e.target.value })}
              >
                <option value="VE">VE (Veloop Tokens)</option>
                <option value="SVE">SVE (Super Veloop)</option>
                <option value="TOKEN">TOKEN (Rewards Token)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="pz-amount">Entry Fee Amount</label>
              <input
                id="pz-amount"
                type="number"
                min={0}
                value={values.entryAmount}
                onChange={(e) => setValues({ ...values, entryAmount: e.target.value })}
                placeholder="0 for free entry tier"
              />
            </div>

            {values.prizeType === 'PHYSICAL' && (
              <div className={styles.fieldFull}>
                <label htmlFor="pz-countries">Shippable Countries (2-letter ISO codes, comma-separated)</label>
                <input
                  id="pz-countries"
                  type="text"
                  value={values.shipToCountries}
                  onChange={(e) => setValues({ ...values, shipToCountries: e.target.value })}
                  placeholder="e.g. IN, US, GB, AE"
                />
              </div>
            )}

            {values.prizeType !== 'PHYSICAL' && (
              <div className={styles.field}>
                <label htmlFor="pz-channel">Delivery Channel</label>
                <select
                  id="pz-channel"
                  value={values.digitalChannel}
                  onChange={(e) => setValues({ ...values, digitalChannel: e.target.value })}
                >
                  <option value="EMAIL">EMAIL</option>
                  <option value="IN_APP">IN_APP</option>
                  <option value="SMS">SMS</option>
                </select>
              </div>
            )}

            <div className={styles.fieldFull}>
              <label htmlFor="pz-desc">Prize Description</label>
              <textarea
                id="pz-desc"
                rows={2}
                value={values.description}
                onChange={(e) => setValues({ ...values, description: e.target.value })}
                placeholder="Prize specifications, warranty, or delivery notes..."
              />
            </div>

            <div className={styles.fieldFull}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={values.active}
                  onChange={(e) => setValues({ ...values, active: e.target.checked })}
                />
                <span>Active tier (Inactive tiers are hidden and not drawn)</span>
              </label>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className="vl-btn vl-btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="vl-btn vl-btn-primary" disabled={busy}>
              <Save size={16} />
              {busy ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Prize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
