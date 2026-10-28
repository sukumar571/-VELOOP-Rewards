import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import styles from './SectionHeading.module.css';

/**
 * Section heading with optional eyebrow label and a working "view all" link.
 */
export default function SectionHeading({ eyebrow, title, subtitle, link }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.text}>
        {eyebrow ? <p className={`vl-eyebrow ${styles.eyebrow}`}>{eyebrow}</p> : null}
        <h2 className="vl-h2">{title}</h2>
        {subtitle ? <p className={`vl-muted ${styles.subtitle}`}>{subtitle}</p> : null}
      </div>
      {link ? (
        <Link to={link.to} className={styles.link}>
          {link.label}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
