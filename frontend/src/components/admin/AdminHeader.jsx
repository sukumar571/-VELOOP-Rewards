import { Menu, Plus, LogOut, ShieldCheck, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import styles from './AdminHeader.module.css';

export default function AdminHeader({ onMenuClick, title, action }) {
  const { user, logout } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={onMenuClick}
          aria-label="Open navigation sidebar"
        >
          <Menu size={20} />
        </button>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>{title || 'Dashboard'}</h1>
        </div>
      </div>

      <div className={styles.right}>
        {action || (
          <Link to="/admin/giveaways?action=new" className={`vl-btn vl-btn-primary ${styles.actionBtn}`}>
            <Plus size={16} />
            <span>New Giveaway</span>
          </Link>
        )}

        <div className={styles.profileBox}>
          <div className={styles.avatar}>
            <User size={16} />
          </div>
          <div className={styles.profileMeta}>
            <span className={styles.userName}>{user?.name || 'Administrator'}</span>
            <span className={styles.userRole}>
              <ShieldCheck size={12} /> Admin
            </span>
          </div>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={logout}
            title="Sign out of Admin Portal"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
