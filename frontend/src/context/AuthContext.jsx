import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getSession,
  getWallet,
  login as sessionLogin,
  logout as sessionLogout,
  setEligibleForDemo,
} from '../services/sessionService.js';

const AuthContext = createContext(null);

/**
 * Client-side view of the (demo) authenticated member + their wallet.
 * It only READS from the session service; balances are never mutated here —
 * that happens inside joinGiveaway() on the "server". After a successful join
 * consumers call refresh() to re-read the authoritative wallet.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    const [s, w] = await Promise.all([getSession(), getWallet()]);
    setUser(s.user);
    setBalances(w ? w.balances : null);
  }, []);

  useEffect(() => {
    let alive = true;
    hydrate().finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [hydrate]);

  const login = useCallback(async () => {
    const s = await sessionLogin();
    const w = await getWallet();
    setUser(s.user);
    setBalances(w ? w.balances : null);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    await sessionLogout();
    setUser(null);
    setBalances(null);
  }, []);

  const refresh = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  // DEMO control to exercise the ineligible participation state.
  const setEligible = useCallback(async (eligible) => {
    await setEligibleForDemo(eligible);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authenticated: !!user,
      balances,
      // Honest lookup: a currency the wallet never reported is null (rendered
      // as "—"), NOT a fabricated 0. A real 0 balance is still returned as 0.
      balanceOf: (currency) =>
        balances && Object.prototype.hasOwnProperty.call(balances, currency)
          ? balances[currency]
          : null,
      login,
      logout,
      refresh,
      setEligible,
    }),
    [user, loading, balances, login, logout, refresh, setEligible],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
