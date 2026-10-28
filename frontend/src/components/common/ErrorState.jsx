import { CloudOff } from 'lucide-react';
import styles from './StateBlock.module.css';

/**
 * Error state with retry affordance — used by every service-backed section.
 */
export default function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this content. Please try again.',
  onRetry = null,
}) {
  return (
    <div className={`${styles.wrap} ${styles.error} vl-card`} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <CloudOff size={26} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.text}>{message}</p>
      {onRetry ? (
        <div className={styles.actions}>
          <button type="button" className="vl-btn vl-btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
