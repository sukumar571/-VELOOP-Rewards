import { statusMeta } from '../../config/claimStatus.js';
import styles from './ClaimStatusIndicator.module.css';

/**
 * Consistent claim-status badge for the five documented API enums
 * (NOT_SUBMITTED, SUBMITTED, PROCESSING, COMPLETED, EXPIRED). The visible label
 * is generic; the exact enum code is exposed via a title/data attribute so the
 * state is unambiguous for support/QA without leaking raw enums to screen readers.
 */
export default function ClaimStatusIndicator({ status, className = '' }) {
  const meta = statusMeta(status);
  const cls = [styles.badge, styles[meta.tone], className].filter(Boolean).join(' ');
  return (
    <span className={cls} data-status={status} title={status}>
      <span className={styles.dot} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
