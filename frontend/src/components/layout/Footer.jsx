import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { FOOTER } from '../../content/site.js';
import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.brandCol}>
          <div className={styles.brandLine}>
            <span className={styles.mark} aria-hidden="true">
              V
            </span>
            <span className={styles.wordmark}>VELOOP Rewards</span>
          </div>
          <p className={`vl-muted ${styles.blurb}`}>{FOOTER.blurb}</p>
          <p className={styles.trustLine}>
            <ShieldCheck size={16} aria-hidden="true" />
            Winners are drawn from closed entry snapshots and published with masked identities.
          </p>
        </div>

        {FOOTER.columns.map((col) => (
          <nav key={col.title} className={styles.col} aria-label={col.title}>
            <h2 className={styles.colTitle}>{col.title}</h2>
            <ul>
              {col.links.map((link) => (
                <li key={link.to + link.label}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className={`container ${styles.bottom}`}>
        <span>© {year} VELOOP Rewards. All rights reserved.</span>

        <ul className={styles.legal}>
          {FOOTER.legal.map((link) => (
            <li key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>

        <span className={styles.faint}>{FOOTER.note}</span>
      </div>
    </footer>
  );
}
