import { PackageOpen } from 'lucide-react';
import styles from './StateBlock.module.css';

/**
 * Empty state block shared by list/section components.
 */
export default function EmptyState({
  title = 'Nothing here yet',
  message = 'New giveaways launch regularly — check back soon.',
  action = null,
}) {
  return (
    <div className={`${styles.wrap} vl-card`} role="status">
      <span className={styles.icon} aria-hidden="true">
        <PackageOpen size={26} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.text}>{message}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
