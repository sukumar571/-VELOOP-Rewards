import { useRef, useState } from 'react';
import { Check, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { submitClaim } from '../../services/claimService.js';
import { validateClaimFields } from '../../config/claimFields.js';
import { formatDate } from '../../utils/format.js';
import styles from './PrizeClaimForm.module.css';

// Errors that re-submitting cannot fix — shown as a terminal message, not a retry.
const NON_RETRYABLE = new Set([
  'VALIDATION',
  'FORBIDDEN',
  'EXPIRED',
  'ALREADY_SUBMITTED',
  'ALREADY_COMPLETED',
  'NOT_AUTHENTICATED',
  'NOT_PUBLISHED',
  'NOT_FOUND',
]);

/**
 * Prize claim form. Renders ONLY the fields the server declares required for
 * this prize's delivery mode (physical fulfilment vs gift-card email), so a
 * gift-card never asks for an address and a physical prize never asks for an
 * email. Provides labelled inputs, inline validation, an explicit deadline, and
 * loading / success / validation / server-error states. Duplicate submissions
 * are blocked (disabled while in flight + guarded), and retryable failures show
 * a Retry action while non-retryable ones do not. The claim is sent to the
 * authoritative API, which re-checks winner, prize, deadline, ownership and fields.
 */
export default function PrizeClaimForm({ record, onSubmitted, onCancel }) {
  const { giveawayId, giveawayTitle, deliveryMode, fields, deadline } = record;
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [retryable, setRetryable] = useState(false);
  const [done, setDone] = useState(null); // receipt after success

  const fieldRefs = useRef({});

  function setField(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (submitting || done) return; // prevent repeated submission
    setServerError(null);
    setRetryable(false);

    // Instant client-side feedback (the server validates again authoritatively).
    const clientErrors = validateClaimFields(deliveryMode, values);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      const first = fields.find((f) => clientErrors[f.name]);
      if (first) fieldRefs.current[first.name]?.focus();
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const receipt = await submitClaim(giveawayId, values);
      setDone(receipt);
      onSubmitted?.(receipt);
    } catch (err) {
      const code = err?.code;
      if (code === 'VALIDATION' && err.fields) {
        setErrors(err.fields);
        const first = fields.find((f) => err.fields[f.name]);
        if (first) fieldRefs.current[first.name]?.focus();
      } else {
        setServerError(err?.message || 'We could not submit your claim. Please try again.');
        setRetryable(!NON_RETRYABLE.has(code));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          <Check size={22} />
        </span>
        <h3 className={styles.successTitle}>Claim submitted!</h3>
        <p className={styles.successText}>
          Your {deliveryMode === 'digital' ? 'gift-card delivery details' : 'delivery details'} for{' '}
          <strong>{giveawayTitle}</strong> have been received. We&apos;ll update your claim status
          as it is processed.
        </p>
        <button type="button" className="vl-btn vl-btn-primary" onClick={onCancel}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <p className={styles.intro}>
        <ShieldCheck size={15} aria-hidden="true" />
        {deliveryMode === 'digital'
          ? 'Your gift-card is delivered by email. No physical address is required.'
          : 'Please confirm where we should ship your prize.'}
      </p>

      {deadline ? (
        <p className={styles.deadline}>
          Claim deadline: <strong>{formatDate(deadline)}</strong>
        </p>
      ) : null}

      <div className={styles.fields}>
        {fields.map((field) => {
          const err = errors[field.name];
          const errId = `${field.name}-err`;
          const hintId = `${field.name}-hint`;
          const describedBy =
            [err ? errId : null, field.hint ? hintId : null].filter(Boolean).join(' ') || undefined;
          const common = {
            id: `claim-${field.name}`,
            name: field.name,
            value: values[field.name] ?? '',
            onChange: (e) => setField(field.name, e.target.value),
            'aria-invalid': err ? true : undefined,
            'aria-describedby': describedBy,
            autoComplete: field.autoComplete,
            required: field.required,
            maxLength: field.maxLength,
          };
          return (
            <div key={field.name} className={styles.field}>
              <label className={styles.label} htmlFor={`claim-${field.name}`}>
                {field.label}
                {field.required ? (
                  <span className={styles.req} aria-hidden="true">
                    {' '}
                    *
                  </span>
                ) : null}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  {...common}
                  rows={3}
                  className={`${styles.control} ${styles.textarea} ${err ? styles.invalid : ''}`}
                  ref={(el) => {
                    fieldRefs.current[field.name] = el;
                  }}
                />
              ) : (
                <input
                  {...common}
                  type={field.type}
                  inputMode={field.inputMode}
                  className={`${styles.control} ${err ? styles.invalid : ''}`}
                  ref={(el) => {
                    fieldRefs.current[field.name] = el;
                  }}
                />
              )}
              {field.hint && !err ? (
                <p id={hintId} className={styles.hint}>
                  {field.hint}
                </p>
              ) : null}
              {err ? (
                <p id={errId} className={styles.fieldError} role="alert">
                  {err}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {serverError ? (
        <p className={styles.serverError} role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          {serverError}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className="vl-btn vl-btn-outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="vl-btn vl-btn-cta" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 size={16} className={styles.spin} aria-hidden="true" />
              Submitting…
            </>
          ) : retryable ? (
            'Retry submission'
          ) : (
            'Submit claim'
          )}
        </button>
      </div>
    </form>
  );
}
