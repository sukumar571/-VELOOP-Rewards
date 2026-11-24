import { FlaskConical } from 'lucide-react';
import styles from './DemoNotice.module.css';

/**
 * Ever-present honesty marker: fictional development data must never be
 * presented as genuine live activity. Rendered globally (header strip) and
 * inline next to demo-driven sections. An optional `action` (a button) is
 * rendered after the text, e.g. the "Exit demo" control.
 */
export default function DemoNotice({ variant = 'strip', text, action }) {
  const defaultText =
    variant === 'strip'
      ? 'Demo environment — statistics, prizes and winners shown are fictional development data, not live activity.'
      : 'Demo data';
  return (
    <p className={`${styles.notice} ${styles[variant]}`} data-testid="demo-notice">
      <FlaskConical size={14} aria-hidden="true" />
      {text ?? defaultText}
      {action ? <span className={styles.action}>{action}</span> : null}
    </p>
  );
}
