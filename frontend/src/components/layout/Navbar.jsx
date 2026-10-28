import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight, LogIn, LogOut, Wallet } from 'lucide-react';
import { NAV_LINKS } from '../../content/site.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CURRENCIES, formatAmountValue } from '../../config/currencies.js';
import styles from './Navbar.module.css';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { authenticated, user, balances, logout } = useAuth();

  // Close the mobile menu on route change (including hash navigation).
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.brand} aria-label="VELOOP Rewards — home">
          <span className={styles.brandMark} aria-hidden="true">
            V
          </span>
          <span className={styles.brandText}>
            VELOOP
            <span className={styles.brandSub}>Rewards</span>
          </span>
        </Link>

        <nav
          className={styles.nav}
          aria-label="Primary"
          id="primary-navigation"
          data-open={open || undefined}
        >
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                [styles.link, isActive ? styles.linkActive : null]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link to="/giveaways" className={`vl-btn vl-btn-primary ${styles.cta}`}>
            Browse Giveaways
            <ArrowRight size={16} aria-hidden="true" />
          </Link>

          {authenticated ? (
            <div className={styles.account} aria-label="Your balances">
              <span className={styles.walletIcon} aria-hidden="true">
                <Wallet size={15} />
              </span>
              <ul className={styles.balances}>
                {Object.values(CURRENCIES).map((c) => (
                  <li key={c.code} className={`${styles.balance} ${styles[c.accent]}`}>
                    <span className={styles.balanceValue}>{formatAmountValue(c.code, balances?.[c.code] ?? 0)}</span>
                    <span className={styles.balanceCur}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`vl-btn vl-btn-ghost ${styles.authBtn}`}
                onClick={logout}
                aria-label={`Sign out of ${user.name}`}
              >
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/login" className={`vl-btn vl-btn-outline ${styles.authBtn}`}>
              <LogIn size={15} aria-hidden="true" />
              Sign in
            </Link>
          )}
        </nav>

        <button
          type="button"
          className={styles.burger}
          aria-expanded={open}
          aria-controls="primary-navigation"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  );
}
