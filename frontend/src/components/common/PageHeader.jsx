import styles from './PageHeader.module.css';

/**
 * Compact page hero used by secondary pages (listings, winners, 404).
 */
export default function PageHeader({ eyebrow, title, gradientWord, subtitle }) {
  return (
    <div className={styles.wrap}>
      {eyebrow ? <p className="vl-eyebrow">{eyebrow}</p> : null}
      <h1 className={`vl-display ${styles.title}`}>
        {title}
        {gradientWord ? (
          <>
            {' '}
            <span className="vl-gradient-text">{gradientWord}</span>
          </>
        ) : null}
      </h1>
      {subtitle ? <p className={`vl-lead ${styles.sub}`}>{subtitle}</p> : null}
    </div>
  );
}
