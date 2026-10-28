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
            Fair, audited draws — winners selected from closed entry snapshots.
          </p>
        </div>

        {FOOTER.columns.map((col) => (
          <nav key={col.title} className={styles.col} aria-label={col.title}>
            <h3 className={styles.colTitle}>{col.title}</h3>
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
        <span className={styles.faint}>Giveaway terms follow the official VELOOP programme rules.</span>
      </div>
    </footer>
  );
}
