import { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { CURRENCIES } from '../../config/currencies.js';
import styles from './GiveawayFormModal.module.css';

const DEFAULT_FORM = {
  title: '',
  slug: '',
  tagline: '',
  description: '',
  startAt: '',
  endAt: '',
  published: false,
  featured: false,
  freeEntryCount: 1,
  maxEntriesPerUser: 5,
  entryCurrencies: ['VE', 'SVE'],
  drawMethod: 'RANDOM',
  claimWindowDays: 7,
  allowDuplicateWinners: false,
  rulesSummary: 'One participation per account. Winners drawn using CSPRNG.',
};

function toLocalDatetimeString(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function GiveawayFormModal({ giveaway, isOpen, onClose, onSave }) {
  const [values, setValues] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isEdit = Boolean(giveaway?._id);

  useEffect(() => {
    if (giveaway) {
      setValues({
        title: giveaway.title || '',
        slug: giveaway.slug || '',
        tagline: giveaway.tagline || '',
        description: giveaway.description || '',
        startAt: toLocalDatetimeString(giveaway.startAt),
        endAt: toLocalDatetimeString(giveaway.endAt),
        published: Boolean(giveaway.published),
        featured: Boolean(giveaway.featured),
        freeEntryCount: giveaway.participation?.freeEntryCount ?? 1,
        maxEntriesPerUser: giveaway.participation?.maxEntriesPerUser ?? 5,
        entryCurrencies: giveaway.participation?.entryCurrencies?.length
          ? giveaway.participation.entryCurrencies
          : ['VE'],
        drawMethod: giveaway.prizeConfig?.drawMethod || 'RANDOM',
        claimWindowDays: giveaway.prizeConfig?.claimWindowDays || 7,
        allowDuplicateWinners: Boolean(giveaway.prizeConfig?.allowDuplicateWinners),
        rulesSummary: giveaway.rules?.summary || '',
      });
    } else {
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 86400000);
      setValues({
        ...DEFAULT_FORM,
        startAt: toLocalDatetimeString(now),
        endAt: toLocalDatetimeString(end),
      });
    }
    setError('');
  }, [giveaway, isOpen]);

  if (!isOpen) return null;

  const handleCurrencyToggle = (curr) => {
    setValues((prev) => {
      const exists = prev.entryCurrencies.includes(curr);
      const next = exists
        ? prev.entryCurrencies.filter((c) => c !== curr)
        : [...prev.entryCurrencies, curr];
      return { ...prev, entryCurrencies: next.length ? next : [curr] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!values.title.trim()) {
      setError('Please provide a giveaway title.');
      return;
    }
    if (!isEdit && !values.slug.trim()) {
      setError('Please provide a URL slug.');
      return;
    }
    if (!values.startAt || !values.endAt) {
      setError('Please specify both start and end timestamps.');
      return;
    }
    if (new Date(values.endAt) <= new Date(values.startAt)) {
      setError('End date must be after the start date.');
      return;
    }

    const payload = {
      title: values.title.trim(),
      tagline: values.tagline.trim(),
      description: values.description.trim(),
      startAt: new Date(values.startAt).toISOString(),
      endAt: new Date(values.endAt).toISOString(),
      published: values.published,
      featured: values.featured,
      participation: {
        freeEntryCount: Number(values.freeEntryCount),
        maxEntriesPerUser: Number(values.maxEntriesPerUser),
        entryCurrencies: values.entryCurrencies,
        paidEntriesAllowed: true,
      },
      prizeConfig: {
        drawMethod: values.drawMethod,
        claimWindowDays: Number(values.claimWindowDays),
        allowDuplicateWinners: values.allowDuplicateWinners,
      },
      rules: {
        summary: values.rulesSummary.trim(),
      },
    };

    if (!isEdit) {
      payload.slug = values.slug.trim().toLowerCase();
    }

    setBusy(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save giveaway.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} vl-card`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{isEdit ? 'Edit Giveaway Configuration' : 'Create New Giveaway'}</h2>
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
              <label htmlFor="gv-title">Giveaway Title *</label>
              <input
                id="gv-title"
                type="text"
                value={values.title}
                onChange={(e) => setValues({ ...values, title: e.target.value })}
                placeholder="e.g. iPhone 15 Pro Launch Giveaway"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="gv-slug">URL Slug {isEdit ? '(Immutable)' : '*'}</label>
              <input
                id="gv-slug"
                type="text"
                value={values.slug}
                disabled={isEdit}
                onChange={(e) =>
                  setValues({
                    ...values,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  })
                }
                placeholder="e.g. iphone-15-pro-launch"
                required={!isEdit}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="gv-tagline">Tagline</label>
              <input
                id="gv-tagline"
                type="text"
                value={values.tagline}
                onChange={(e) => setValues({ ...values, tagline: e.target.value })}
                placeholder="e.g. Flagship flagship draw for all members"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="gv-start">Start Date & Time *</label>
              <input
                id="gv-start"
                type="datetime-local"
                value={values.startAt}
                onChange={(e) => setValues({ ...values, startAt: e.target.value })}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="gv-end">End Date & Time *</label>
              <input
                id="gv-end"
                type="datetime-local"
                value={values.endAt}
                onChange={(e) => setValues({ ...values, endAt: e.target.value })}
                required
              />
            </div>

            <div className={styles.fieldFull}>
              <label htmlFor="gv-desc">Description</label>
              <textarea
                id="gv-desc"
                rows={3}
                value={values.description}
                onChange={(e) => setValues({ ...values, description: e.target.value })}
                placeholder="Describe this giveaway..."
              />
            </div>

            {/* Participation Quotas */}
            <div className={styles.field}>
              <label htmlFor="gv-free">Free Entries Allowed</label>
              <input
                id="gv-free"
                type="number"
                min={0}
                max={100}
                value={values.freeEntryCount}
                onChange={(e) => setValues({ ...values, freeEntryCount: e.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="gv-max">Max Total Entries / User</label>
              <input
                id="gv-max"
                type="number"
                min={1}
                max={1000}
                value={values.maxEntriesPerUser}
                onChange={(e) => setValues({ ...values, maxEntriesPerUser: e.target.value })}
              />
            </div>

            {/* Currencies */}
            <div className={styles.fieldFull}>
              <label>Allowed Currencies for Entry</label>
              <div className={styles.checkboxGroup}>
                {['VE', 'SVE', 'TOKEN'].map((c) => (
                  <label key={c} className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={values.entryCurrencies.includes(c)}
                      onChange={() => handleCurrencyToggle(c)}
                    />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Draw Method & Claim window */}
            <div className={styles.field}>
              <label htmlFor="gv-method">Winner Draw Method</label>
              <select
                id="gv-method"
                value={values.drawMethod}
                onChange={(e) => setValues({ ...values, drawMethod: e.target.value })}
              >
                <option value="RANDOM">RANDOM (Equal Odds)</option>
                <option value="WEIGHTED_BY_ENTRIES">WEIGHTED_BY_ENTRIES (Entries = Tickets)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="gv-window">Claim Window (Days)</label>
              <input
                id="gv-window"
                type="number"
                min={1}
                max={90}
                value={values.claimWindowDays}
                onChange={(e) => setValues({ ...values, claimWindowDays: e.target.value })}
              />
            </div>

            {/* Checkboxes: Published & Featured */}
            <div className={styles.fieldFull}>
              <div className={styles.togglesRow}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={values.published}
                    onChange={(e) => setValues({ ...values, published: e.target.checked })}
                  />
                  <span>Published (Visible publicly)</span>
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={values.featured}
                    onChange={(e) => setValues({ ...values, featured: e.target.checked })}
                  />
                  <span>Featured Draw</span>
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={values.allowDuplicateWinners}
                    onChange={(e) => setValues({ ...values, allowDuplicateWinners: e.target.checked })}
                  />
                  <span>Allow Duplicate Winners Across Tiers</span>
                </label>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className="vl-btn vl-btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="vl-btn vl-btn-primary" disabled={busy}>
              <Save size={16} />
              {busy ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Giveaway'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
