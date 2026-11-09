import { Navigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, LogOut, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import styles from './AdminRoute.module.css';

export default function AdminRoute({ children }) {
  const { user, authenticated, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} aria-label="Verifying credentials..." />
        <p className={styles.loadingText}>Verifying administrator privileges...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  if (!isAdmin) {
    return (
      <div className={`container ${styles.deniedContainer}`}>
        <div className={`${styles.deniedCard} vl-card`}>
          <div className={styles.iconWrap}>
            <ShieldAlert size={48} className={styles.alertIcon} />
          </div>
          <h1 className="vl-h2">Access Denied</h1>
          <p className="vl-lead">
            The signed-in account (<strong>{user?.email || user?.name}</strong>) does not have administrative permissions for this portal.
          </p>

          <div className={styles.roleBox}>
            <span className={styles.roleLabel}>Current Assigned Roles:</span>
            <div className={styles.roleTags}>
              {(user?.roles || ['user']).map((r) => (
                <span key={r} className={styles.roleTag}>{r}</span>
              ))}
            </div>
          </div>

          <div className={styles.devHint}>
            <KeyRound size={16} />
            <div>
              <strong>Local Development Tip:</strong> In development, mint an admin token via:
              <code>npm --prefix backend run token:dev -- --roles=admin</code>
            </div>
          </div>

          <div className={styles.actions}>
            <Link to="/giveaways" className="vl-btn vl-btn-outline">
              <ArrowLeft size={16} /> Back to Store
            </Link>
            <button type="button" onClick={logout} className="vl-btn vl-btn-primary">
              <LogOut size={16} /> Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
