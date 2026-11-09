import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Gift,
  Trophy,
  Users,
  Award,
  PackageCheck,
  Receipt,
  ShieldAlert,
  FileText,
  BarChart3,
  Settings,
  ArrowLeft,
  X,
} from 'lucide-react';
import styles from './AdminSidebar.module.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/giveaways', label: 'Giveaway Management', icon: Gift },
  { to: '/admin/prizes', label: 'Prize Management', icon: Trophy },
  { to: '/admin/participants', label: 'Participants', icon: Users },
  { to: '/admin/winners', label: 'Winner Management', icon: Award },
  { to: '/admin/claims', label: 'Prize Claims', icon: PackageCheck },
  { to: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { to: '/admin/fraud', label: 'Fraud Monitoring', icon: ShieldAlert },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: FileText },
  { to: '/admin/reports', label: 'Reports and Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'Admin Settings', icon: Settings },
];

export default function AdminSidebar({ open, onClose }) {
  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropActive : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`} aria-label="Admin Navigation">
        <div className={styles.top}>
          <Link to="/" className={styles.brand}>
            <span className={styles.brandMark}>V</span>
            <div className={styles.brandMeta}>
              <span className={styles.brandTitle}>VELOOP</span>
              <span className={styles.brandBadge}>Admin Portal</span>
            </div>
          </Link>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close sidebar">
            <X size={20} />
          </button>
        </div>

        <nav className={styles.nav}>
          <div className={styles.sectionLabel}>Admin Navigation</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <Icon size={18} className={styles.navIcon} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <Link to="/giveaways" className={styles.returnLink}>
            <ArrowLeft size={16} />
            <span>Public Storefront</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
