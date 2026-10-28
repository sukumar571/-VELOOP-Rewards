import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, ShieldAlert, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import styles from './LoginPage.module.css';

/**
 * Login flow target. There is no VELOOP auth backend yet, so this is an
 * explicitly-labelled DEVELOPMENT sign-in that establishes the demo member
 * session required to exercise the participation flow. Real OAuth/OTP login is
 * [EXTERNAL] (docs/PLAN.md — A1 auth). After signing in we return the visitor
 * to the page they came from (their intended giveaway).
 */
export default function LoginPage() {
  const { user, authenticated, login, setEligible } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [demoIneligible, setDemoIneligible] = useState(false);

  const from = location.state?.from || '/giveaways';

  // Already signed in? Straight back to where they were headed.
  useEffect(() => {
    if (authenticated) navigate(from, { replace: true });
  }, [authenticated, from, navigate]);

  const onSignIn = async () => {
    setBusy(true);
    await setEligible(!demoIneligible);
    await login();
    setBusy(false);
    navigate(from, { replace: true });
  };

  return (
    <div className={`container ${styles.page}`}>
      <div className={`${styles.card} vl-card`}>
        <h1 className="vl-h2">Sign in to enter</h1>
        <p className={styles.lead}>
          Giveaway entry is tied to your verified VELOOP account. Sign in to see
          your balance and join this draw.
        </p>

        <div className={styles.noticeWrap}>
          <DemoNotice
            variant="chip"
            text="Development sign-in — establishes a fictional demo member session. Real authentication activates with the VELOOP backend."
          />
        </div>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={demoIneligible}
            onChange={(e) => setDemoIneligible(e.target.checked)}
          />
          <span>Simulate an ineligible account (demo — to preview the blocked state)</span>
        </label>

        <button
          type="button"
          className={`vl-btn vl-btn-cta vl-btn-lg ${styles.btn}`}
          onClick={onSignIn}
          disabled={busy}
        >
          <LogIn size={18} aria-hidden="true" />
          {busy ? 'Signing in…' : 'Sign in as Demo Member'}
        </button>

        {user ? (
          <p className={styles.signedIn}>Signed in as {user.name}. Redirecting…</p>
        ) : null}

        <p className={styles.note} role="note">
          <Info size={14} aria-hidden="true" />
          No password is requested because the identity backend does not exist
          yet. <ShieldAlert size={14} aria-hidden="true" /> We never fabricate
          credentials or claim a real login.
        </p>
      </div>
    </div>
  );
}
