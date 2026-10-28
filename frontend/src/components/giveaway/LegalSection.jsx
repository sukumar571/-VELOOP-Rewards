import { useId, useState } from 'react';
import { ChevronDown, FileText, Info } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import {
  getTermsAndConditions,
  getImportantInfo,
} from '../../services/giveawayService.js';
import Skeleton from '../common/Skeleton.jsx';
import styles from './LegalSection.module.css';

/**
 * Expandable "Terms & Conditions" and "Important Information" sections.
 * Each is an accessible disclosure (button + aria-expanded/aria-controls).
 * Any item flagged `pending` is rendered with an explicit "Awaiting business
 * approval" marker so an unconfirmed rule is never shown as settled policy.
 */
export default function LegalSection() {
  const uid = useId();
  const tAndC = useAsync(getTermsAndConditions, []);
  const info = useAsync(getImportantInfo, []);

  return (
    <div className={styles.wrap}>
      <Disclosure
        id={`${uid}-tc`}
        icon={<FileText size={16} aria-hidden="true" />}
        title="Terms & Conditions"
        query={tAndC}
      />
      <Disclosure
        id={`${uid}-info`}
        icon={<Info size={16} aria-hidden="true" />}
        title="Important Information"
        query={info}
      />
    </div>
  );
}

function Disclosure({ id, icon, title, query }) {
  const [open, setOpen] = useState(false);
  const btnId = `${id}-btn`;
  const panelId = `${id}-panel`;
  const { data, loading, error } = query;

  return (
    <div className={styles.item}>
      <h3 className={styles.head}>
        <button
          type="button"
          id={btnId}
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.triggerIcon}>{icon}</span>
          <span>{title}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={open ? `${styles.chev} ${styles.chevOpen}` : styles.chev}
          />
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        hidden={!open}
        className={styles.panel}
      >
        {loading ? (
          <div aria-busy="true">
            <Skeleton variant="blocks" count={2} />
          </div>
        ) : error ? (
          <p className={styles.error}>{error.message}</p>
        ) : (
          <ul className={styles.list}>
            {(data || []).map((item, i) => (
              <li key={i} className={styles.row}>
                <span>{item.text}</span>
                {item.pending ? (
                  <span className={styles.pending}>Awaiting business approval</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
