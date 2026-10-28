import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import styles from './NotFound.module.css';

/**
 * 404 page — also reused inline for unknown giveaway slugs.
 */
export default function NotFoundPage({
  title = 'Page not found',
  message = 'The page you were looking for does not exist or has moved.',
}) {
  return (
    <div className={`container ${styles.wrap}`}>
      <span className={styles.icon} aria-hidden="true">
        <Compass size={30} />
      </span>
      <p className="vl-eyebrow">Error 404</p>
      <h1 className="vl-h2">{title}</h1>
      <p className={`vl-lead ${styles.text}`}>{message}</p>
      <div className={styles.actions}>
        <Link to="/" className="vl-btn vl-btn-primary">
          Back to home
        </Link>
        <Link to="/giveaways" className="vl-btn vl-btn-outline">
          Browse giveaways
        </Link>
      </div>
    </div>
  );
}
