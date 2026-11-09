import { Link } from 'react-router-dom';
import {
  Settings,
  Shield,
  Coins,
  Users,
  Server,
  Key,
  Clock,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { CURRENCIES } from '../../config/currencies.js';
import styles from './AdminSettingsPage.module.css';

export default function AdminSettingsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>Admin Settings & System Health</h1>
        <p className={styles.pageSubtitle}>
          Platform environment configuration, supported currency rails, cryptographic security parameters, and identity services.
        </p>
      </div>

      <div className={styles.grid}>
        {/* Environment Status */}
        <div className={`${styles.card} vl-card`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <Server size={18} className={styles.cardIcon} /> Environment & Runtime Status
            </h2>
            <span className={styles.badgeLive}>
              <span className={styles.badgeDot} /> Active
            </span>
          </div>

          <div className={styles.configList}>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Application Stack</span>
              <span className={styles.configVal}>Node.js / Express / React (Vite)</span>
            </div>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Database Connectivity</span>
              <span className={styles.configVal}>MongoDB (Mongoose ODM)</span>
            </div>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Authentication Mode</span>
              <span className={styles.configVal}>Server-Authoritative JWT</span>
            </div>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Admin Route Protection</span>
              <span className={styles.configVal}>RBAC (roles: ['admin'])</span>
            </div>
          </div>
        </div>

        {/* Security & Cryptography Engine */}
        <div className={`${styles.card} vl-card`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <Shield size={18} className={styles.cardIcon} /> Security & Draw Governance
            </h2>
          </div>

          <div className={styles.configList}>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Winner Selection PRNG</span>
              <span className={styles.configVal}>crypto.randomInt (CSPRNG)</span>
            </div>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Anti-Replay / Idempotency</span>
              <span className={styles.configVal}>24-Hour TTL Ledger Hash</span>
            </div>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Fulfillment Claim Window</span>
              <span className={styles.configVal}>14 Days Default (+ Extension)</span>
            </div>
            <div className={styles.configRow}>
              <span className={styles.configKey}>Audit Trail Capture</span>
              <span className={styles.configVal}>Strict Before/After Diffing</span>
            </div>
          </div>
        </div>

        {/* Currency Rails */}
        <div className={`${styles.card} vl-card`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <Coins size={18} className={styles.cardIcon} /> Multi-Currency Platforms Rails
            </h2>
          </div>

          <div className={styles.configList}>
            {CURRENCIES.map((c) => (
              <div key={c.code} className={styles.currencyCard}>
                <div className={styles.currencyHeader}>
                  <span className={styles.currencyCode}>{c.name} ({c.code})</span>
                  <span className={styles.configVal}>{c.symbol || c.code}</span>
                </div>
                <span className={styles.currencyDesc}>
                  {c.code === 'VE' && 'Primary ecosystem loyalty credits used for promotional entry.'}
                  {c.code === 'SVE' && 'Staked virtual credits earned from loyalty retention tiers.'}
                  {c.code === 'TOKEN' && 'Decentralized digital token asset for premium high-tier prize pools.'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* User Directory & Access Management */}
        <div className={`${styles.card} vl-card`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <Users size={18} className={styles.cardIcon} /> Staff & Access Governance
            </h2>
          </div>

          <p style={{ fontSize: '0.88rem', color: 'var(--vl-text-muted)', lineHeight: 1.5, margin: 0 }}>
            Operators can inspect all registered user accounts, active roles (admin/user), wallet balances, and account status in the dedicated User Directory.
          </p>

          <div style={{ marginTop: 'auto' }}>
            <Link to="/admin/users" className="vl-btn vl-btn-outline" style={{ width: '100%', justifyContent: 'center' }}>
              <span>Open User Directory</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
