import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LogIn,
  UserPlus,
  UserRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  registerAccount,
  verifyAccount,
  hasAnyAccount,
} from '../services/demoAuth.js';
import DemoNotice from '../components/common/DemoNotice.jsx';
import styles from './LoginPage.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { name: '', email: '', password: '', confirm: '' };

/**
 * Sign-in / registration journey.
 *
 * There is no VELOOP auth backend yet, so this is an explicitly-labelled
 * DEVELOPMENT flow: "Create account" stores a demo profile in this browser
 * only, and "Sign in" checks the details you registered against that local
 * directory before establishing the demo member session. Real OAuth/OTP login
 * is [EXTERNAL] (docs/PLAN.md — A1 auth). No password ever leaves the browser
 * and we never claim this is a real login. After signing in we return the
 * visitor to the page they came from (their intended giveaway).
 */
export default function LoginPage() {
  const { user, authenticated, login, setEligible } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoIneligible, setDemoIneligible] = useState(false);
  const firstFieldRef = useRef(null);

  const from = location.state?.from || '/giveaways';
  const anyAccount = useMemo(() => hasAnyAccount(), [mode, busy]);

  // Already signed in? Straight back to where they were headed.
  useEffect(() => {
    if (authenticated) navigate(from, { replace: true });
  }, [authenticated, from, navigate]);

  const setField = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    // Clear the specific error as the user edits that field.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    if (formError) setFormError('');
  };

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setErrors({});
    setFormError('');
    firstFieldRef.current?.focus();
  };

  const validate = () => {
    const next = {};
    if (mode === 'register' && values.name.trim().length < 2) {
      next.name = 'Please enter your full name.';
    }
    if (!EMAIL_RE.test(values.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (values.password.length < 6) {
      next.password = 'Password must be at least 6 characters.';
    }
    if (mode === 'register' && values.confirm !== values.password) {
      next.confirm = 'Passwords do not match.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const completeSignIn = async (profile) => {
    setBusy(true);
    try {
      await setEligible(mode === 'signin' ? !demoIneligible : true);
      await login(profile);
      navigate(from, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    if (mode === 'register') {
      const res = registerAccount({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      if (!res.ok) {
        setErrors({ [res.field]: res.message });
        return;
      }
      await completeSignIn(res.account);
      return;
    }

    // Sign in — must match a locally-registered demo account.
    if (!anyAccount) {
      setFormError('No demo account found on this device yet. Create one first.');
      return;
    }
    const res = verifyAccount({ email: values.email, password: values.password });
    if (!res.ok) {
      setErrors({ form: res.message });
      setFormError(res.message);
      return;
    }
    await completeSignIn(res.account);
  };

  const isRegister = mode === 'register';

  return (
    <div className={`container ${styles.page}`}>
      <div className={`${styles.card} vl-card`}>
        <div className={styles.tabs} role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            id="vl-tab-signin"
            aria-selected={!isRegister}
            aria-controls="vl-auth-panel"
            tabIndex={isRegister ? 0 : -1}
            className={`${styles.tab} ${!isRegister ? styles.tabActive : ''}`}
            onClick={() => switchMode('signin')}
          >
            <LogIn size={16} aria-hidden="true" />
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            id="vl-tab-register"
            aria-selected={isRegister}
            aria-controls="vl-auth-panel"
            tabIndex={isRegister ? -1 : 0}
            className={`${styles.tab} ${isRegister ? styles.tabActive : ''}`}
            onClick={() => switchMode('register')}
          >
            <UserPlus size={16} aria-hidden="true" />
            Create account
          </button>
        </div>

        <div id="vl-auth-panel" role="tabpanel" aria-labelledby={isRegister ? 'vl-tab-register' : 'vl-tab-signin'}>
          <h1 className="vl-h2">{isRegister ? 'Create your demo account' : 'Sign in to enter'}</h1>
          <p className={styles.lead}>
            {isRegister
              ? 'Register once on this device, then sign in with the same details to see your balance and join a draw.'
              : 'Giveaway entry is tied to your verified VELOOP account. Sign in to see your balance and join this draw.'}
          </p>

          <div className={styles.noticeWrap}>
            <DemoNotice
              variant="chip"
              text="Development sign-in — accounts are stored only in this browser. Real authentication activates with the VELOOP backend."
            />
          </div>

          <form className={styles.form} onSubmit={onSubmit} noValidate>
            {isRegister ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="vl-name">
                  <UserRound size={15} aria-hidden="true" /> Full name
                </label>
                <input
                  id="vl-name"
                  ref={firstFieldRef}
                  className={styles.input}
                  type="text"
                  autoComplete="name"
                  value={values.name}
                  onChange={setField('name')}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'vl-name-err' : undefined}
                  placeholder="Asha Kumar"
                />
                {errors.name ? (
                  <p className={styles.error} id="vl-name-err" role="alert">
                    {errors.name}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vl-email">
                <Mail size={15} aria-hidden="true" /> Email address
              </label>
              <input
                id="vl-email"
                ref={isRegister ? undefined : firstFieldRef}
                className={styles.input}
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={setField('email')}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'vl-email-err' : undefined}
                placeholder="you@example.com"
              />
              {errors.email ? (
                <p className={styles.error} id="vl-email-err" role="alert">
                  {errors.email}
                </p>
              ) : null}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vl-password">
                <Lock size={15} aria-hidden="true" /> Password
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="vl-password"
                  className={`${styles.input} ${styles.passwordInput}`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  value={values.password}
                  onChange={setField('password')}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'vl-password-err' : undefined}
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              {errors.password ? (
                <p className={styles.error} id="vl-password-err" role="alert">
                  {errors.password}
                </p>
              ) : null}
            </div>

            {isRegister ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="vl-confirm">
                  <Lock size={15} aria-hidden="true" /> Confirm password
                </label>
                <input
                  id="vl-confirm"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={values.confirm}
                  onChange={setField('confirm')}
                  aria-invalid={Boolean(errors.confirm)}
                  aria-describedby={errors.confirm ? 'vl-confirm-err' : undefined}
                  placeholder="Re-enter your password"
                />
                {errors.confirm ? (
                  <p className={styles.error} id="vl-confirm-err" role="alert">
                    {errors.confirm}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!isRegister ? (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={demoIneligible}
                  onChange={(e) => setDemoIneligible(e.target.checked)}
                />
                <span>Simulate an ineligible account (demo — to preview the blocked state)</span>
              </label>
            ) : null}

            {formError ? (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              className={`vl-btn vl-btn-cta vl-btn-lg ${styles.btn}`}
              disabled={busy}
            >
              {isRegister ? <UserPlus size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
              {busy ? 'Please wait…' : isRegister ? 'Create account & sign in' : 'Sign in'}
            </button>

            <p className={styles.switchNote}>
              {isRegister ? (
                <>
                  Already registered?{' '}
                  <button type="button" className={styles.linkBtn} onClick={() => switchMode('signin')}>
                    Sign in instead
                  </button>
                </>
              ) : (
                <>
                  New here?{' '}
                  <button type="button" className={styles.linkBtn} onClick={() => switchMode('register')}>
                    Create a demo account
                  </button>
                </>
              )}
            </p>
          </form>
        </div>

        {user ? (
          <p className={styles.signedIn}>Signed in as {user.name}. Redirecting…</p>
        ) : null}

        <p className={styles.note} role="note">
          <Info size={14} aria-hidden="true" />
          This demo keeps your details in this browser only — no password is sent
          anywhere. <ShieldAlert size={14} aria-hidden="true" /> We never claim this
          is a real VELOOP login.
        </p>
      </div>
    </div>
  );
}
