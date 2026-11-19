import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Wallet,
  Ticket,
  Trophy,
  Clock,
  ArrowRight,
  UserRound,
  Mail,
  ShieldCheck,
  LogOut,
  BadgeCheck,
  Sparkles,
} from 'lucide-react';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { myParticipations } from '../api/participationApi.js';
import { CURRENCIES, formatAmount } from '../config/currencies.js';
import { formatCount, formatDate } from '../utils/format.js';
import Skeleton from '../components/common/Skeleton.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import styles from './Account.module.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'participations', label: 'Participations' },
  { key: 'profile', label: 'Profile' },
];

const LIFECYCLE = {
  ACTIVE: { label: 'Active', tone: 'live' },
  UPCOMING: { label: 'Upcoming', tone: 'soon' },
  ENDED: { label: 'Ended', tone: 'done' },
  ARCHIVED: { label: 'Archived', tone: 'done' },
};

const CLAIM_LABEL = {
  NOT_SUBMITTED: 'Claim not submitted',
  SUBMITTED: 'Claim submitted',
  PROCESSING: 'Claim processing',
  COMPLETED: 'Claim completed',
  EXPIRED: 'Claim expired',
};

/**
 * Account area — dashboard, participation history and profile.
 *
 * Reads only what the server already exposes to the signed-in caller:
 *   • identity + wallet from AuthContext (GET /auth/me, GET /wallet/balances)
 *   • entries from GET /giveaways/my-status (the caller's own rows)
 * Nothing is editable here because the API has no profile-write endpoint; the
 * page says so instead of pretending. No value is derived client-side that the
 * server did not return.
 */
export default function AccountPage() {
  const { user, authenticated, loading: authLoading, balances, logout } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const requested = params.get('tab');
  const [tab, setTab] = useState(TABS.some((t) => t.key === requested) ? requested : 'overview');

  useEffect(() => {
    if (requested && TABS.some((t) => t.key === requested)) setTab(requested);
  }, [requested]);

  const {
    data: page,
    loading,
    error,
    reload,
  } = useAsync(
    () => (authenticated ? myParticipations({ limit: 100 }) : Promise.resolve(null)),
    [authenticated],
  );

  const entries = useMemo(() => page?.items ?? [], [page]);

  const stats = useMemo(() => {
    const active = entries.filter((e) => e.giveaway?.status === 'ACTIVE').length;
    const wins = entries.filter((e) => e.isWinner).length;
    const claimable = entries.filter(
      (e) => e.isWinner && e.resultsPublished && e.claim && e.claim.status === 'NOT_SUBMITTED' && !e.claim.expired,
    ).length;
    return { total: page?.meta?.total ?? entries.length, active, wins, claimable };
  }, [entries, page]);

  if (authLoading) {
    return (
      <div className={`container ${styles.page}`} aria-busy="true">
        <Skeleton variant="blocks" count={4} />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const selectTab = (key) => {
    setTab(key);
    setParams(key === 'overview' ? {} : { tab: key }, { replace: true });
  };

  const initials = String(user?.name || 'M')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className={`container ${styles.page}`}>
      {/* ---- identity header ---- */}
      <header className={styles.head}>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {initials || <UserRound size={18} />}
          </span>
          <div className={styles.identityText}>
            <p className="vl-eyebrow">Your VELOOP account</p>
            <h1 className={styles.title}>{user?.name || 'Member'}</h1>
            <p className={styles.email}>
              <Mail size={13} aria-hidden="true" />
              {user?.email || 'Email not reported by the server'}
              {Array.isArray(user?.roles) && user.roles.includes('admin') ? (
                <span className={styles.roleTag}>
                  <ShieldCheck size={12} aria-hidden="true" /> Admin
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className={styles.headActions}>
          <Link to="/giveaways" className="vl-btn vl-btn-outline vl-btn-sm">
            Browse giveaways
          </Link>
          <button
            type="button"
            className={`vl-btn vl-btn-ghost vl-btn-sm ${styles.signOut}`}
            onClick={logout}
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      {/* ---- tabs ---- */}
      <div className={styles.tabs} role="tablist" aria-label="Account sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`vl-account-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`vl-account-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div aria-busy="true" className={styles.loading}>
          <Skeleton variant="blocks" count={3} />
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load your account activity"
          message={error.message}
          onRetry={reload}
        />
      ) : (
        <>
          {/* ---------------- Overview ---------------- */}
          <section
            role="tabpanel"
            id="vl-account-panel-overview"
            aria-labelledby="vl-account-tab-overview"
            hidden={tab !== 'overview'}
            className={styles.panel}
          >
            <div className={styles.balances} aria-label="Wallet balances">
              {Object.values(CURRENCIES).map((c) => {
                const value = balances ? balances[c.code] : undefined;
                const known = typeof value === 'number';
                return (
                  <div key={c.code} className={styles.balanceCard}>
                    <span className={styles.balanceLabel}>
                      <Wallet size={13} aria-hidden="true" /> {c.label}
                    </span>
                    <span className={`${styles.balanceValue} vl-num`}>
                      {known ? formatAmount(c.code, value) : '—'}
                    </span>
                    <span className={styles.balanceNote}>
                      {known ? 'Reported by the wallet service' : 'Wallet not reporting this currency'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className={styles.kpis}>
              <div className={styles.kpi}>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Ticket size={16} />
                </span>
                <span className={styles.kpiValue}>{formatCount(stats.total)}</span>
                <span className={styles.kpiLabel}>Entries recorded</span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Clock size={16} />
                </span>
                <span className={styles.kpiValue}>{formatCount(stats.active)}</span>
                <span className={styles.kpiLabel}>In open draws</span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Trophy size={16} />
                </span>
                <span className={styles.kpiValue}>{formatCount(stats.wins)}</span>
                <span className={styles.kpiLabel}>Draws won</span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Sparkles size={16} />
                </span>
                <span className={styles.kpiValue}>{formatCount(stats.claimable)}</span>
                <span className={styles.kpiLabel}>Claims awaiting you</span>
              </div>
            </div>

            <div className={styles.split}>
              <section className={styles.card} aria-labelledby="recent-h">
                <div className={styles.cardHead}>
                  <h2 id="recent-h" className={styles.cardTitle}>
                    Recent activity
                  </h2>
                  {entries.length ? (
                    <button
                      type="button"
                      className={styles.textBtn}
                      onClick={() => selectTab('participations')}
                    >
                      All participations <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>

                {entries.length ? (
                  <ul className={styles.recentList}>
                    {entries.slice(0, 4).map((row) => (
                      <li key={row.id} className={styles.recentRow}>
                        <div className={styles.recentMain}>
                          {row.giveaway?.slug ? (
                            <Link to={`/giveaways/${row.giveaway.slug}`} className={styles.recentTitle}>
                              {row.giveaway.title || 'Giveaway'}
                            </Link>
                          ) : (
                            <span className={styles.recentTitle}>{row.giveaway?.title || 'Giveaway'}</span>
                          )}
                          <span className={styles.recentMeta}>
                            Entered {formatDate(row.joinedAt)}
                            {row.entryAmount ? ` · ${formatAmount(row.entryCurrency, row.entryAmount)}` : ''}
                          </span>
                        </div>
                        <LifecycleChip status={row.giveaway?.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>
                    No entries yet. When you join a draw it appears here with its fee and closing date.
                  </p>
                )}
              </section>

              <section className={`${styles.card} ${styles.nextStep}`} aria-labelledby="next-h">
                <h2 id="next-h" className={styles.cardTitle}>
                  What next
                </h2>
                <ul className={styles.nextList}>
                  <li>
                    <Link to="/giveaways" className={styles.nextLink}>
                      <span>Open draws</span>
                      <span className={styles.nextHint}>Browse every active giveaway</span>
                    </Link>
                  </li>
                  <li>
                    <Link to="/winners" className={styles.nextLink}>
                      <span>Prize claims</span>
                      <span className={styles.nextHint}>Check wins and claim a prize</span>
                    </Link>
                  </li>
                  <li>
                    <Link to="/earn" className={styles.nextLink}>
                      <span>Earn VEs</span>
                      <span className={styles.nextHint}>Top up before the next draw</span>
                    </Link>
                  </li>
                </ul>
              </section>
            </div>
          </section>

          {/* ---------------- Participations ---------------- */}
          <section
            role="tabpanel"
            id="vl-account-panel-participations"
            aria-labelledby="vl-account-tab-participations"
            hidden={tab !== 'participations'}
            className={styles.panel}
          >
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Participation history</h2>
                <span className={styles.cardMeta}>
                  {formatCount(stats.total)} {stats.total === 1 ? 'entry' : 'entries'} recorded
                </span>
              </div>

              {!entries.length ? (
                <EmptyState
                  title="No participations yet"
                  message="Every draw you enter is listed here with its fee, current status and result — only you can see this record."
                  action={
                    <Link to="/giveaways" className="vl-btn vl-btn-outline">
                      Browse giveaways
                    </Link>
                  }
                />
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className="vl-visually-hidden">
                      Your participation history, newest first
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Giveaway</th>
                        <th scope="col">Entered</th>
                        <th scope="col">Fee</th>
                        <th scope="col">Draw status</th>
                        <th scope="col">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Giveaway">
                            {row.giveaway?.slug ? (
                              <Link to={`/giveaways/${row.giveaway.slug}`} className={styles.rowTitle}>
                                {row.giveaway.title || 'Giveaway'}
                              </Link>
                            ) : (
                              <span className={styles.rowTitle}>{row.giveaway?.title || 'Giveaway'}</span>
                            )}
                            {row.entryCount > 1 ? (
                              <span className={styles.rowSub}>{row.entryCount} entries</span>
                            ) : null}
                          </td>
                          <td data-label="Entered" className={styles.nowrap}>
                            {formatDate(row.joinedAt)}
                          </td>
                          <td data-label="Fee" className={styles.nowrap}>
                            {row.entryAmount ? formatAmount(row.entryCurrency, row.entryAmount) : 'Free entry'}
                          </td>
                          <td data-label="Draw status">
                            <LifecycleChip status={row.giveaway?.status} />
                          </td>
                          <td data-label="Result">
                            <ResultCell row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {page?.meta?.total > entries.length ? (
                <p className={styles.footNote}>
                  Showing the latest {entries.length} of {formatCount(page.meta.total)} entries.
                </p>
              ) : null}
            </div>
          </section>

          {/* ---------------- Profile ---------------- */}
          <section
            role="tabpanel"
            id="vl-account-panel-profile"
            aria-labelledby="vl-account-tab-profile"
            hidden={tab !== 'profile'}
            className={styles.panel}
          >
            <div className={styles.split}>
              <section className={styles.card} aria-labelledby="profile-h">
                <h2 id="profile-h" className={styles.cardTitle}>
                  Account details
                </h2>
                <dl className={styles.profile}>
                  <div>
                    <dt>Name</dt>
                    <dd>{user?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{user?.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Account ID</dt>
                    <dd className={styles.mono}>{user?.id || '—'}</dd>
                  </div>
                  <div>
                    <dt>Roles</dt>
                    <dd className={styles.roles}>
                      {Array.isArray(user?.roles) && user.roles.length ? (
                        user.roles.map((r) => (
                          <span key={r} className={styles.roleTag}>
                            {r}
                          </span>
                        ))
                      ) : (
                        <span className={styles.muted}>member</span>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className={styles.note}>
                  <BadgeCheck size={14} aria-hidden="true" />
                  These details come from the verified session. Profile editing is not available in this
                  build — the API exposes no profile-write endpoint, so nothing here is editable.
                </p>
              </section>

              <section className={styles.card} aria-labelledby="security-h">
                <h2 id="security-h" className={styles.cardTitle}>
                  Session &amp; privacy
                </h2>
                <ul className={styles.facts}>
                  <li>
                    <ShieldCheck size={14} aria-hidden="true" />
                    <span>
                      Your session token is held for this browser tab only; signing out clears it here.
                    </span>
                  </li>
                  <li>
                    <Wallet size={14} aria-hidden="true" />
                    <span>
                      Balances are read from the wallet service — this page never changes them.
                    </span>
                  </li>
                  <li>
                    <Ticket size={14} aria-hidden="true" />
                    <span>Participation records are scoped to your account on the server.</span>
                  </li>
                </ul>
                <div className={styles.profileActions}>
                  <Link to="/legal#privacy" className="vl-btn vl-btn-outline vl-btn-sm">
                    Privacy policy
                  </Link>
                  <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={logout}>
                    <LogOut size={14} aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </section>
            </div>
          </section>
        </>
      )}

      <div className={styles.noticeWrap}>
        <DemoNotice variant="chip" />
      </div>
    </div>
  );
}

function LifecycleChip({ status }) {
  const meta = LIFECYCLE[status] ?? { label: status || 'Unknown', tone: 'done' };
  return <span className={`${styles.chip} ${styles[meta.tone]}`}>{meta.label}</span>;
}

function ResultCell({ row }) {
  if (row.isWinner) {
    if (!row.resultsPublished) {
      return <span className={styles.resultPending}>Winner · announcement pending</span>;
    }
    const claim = row.claim;
    const claimLabel = claim ? CLAIM_LABEL[claim.status] ?? claim.status : 'Claim not submitted';
    return (
      <span className={styles.resultWin}>
        <Trophy size={12} aria-hidden="true" />
        Winner{row.winnerRank ? ` · rank ${row.winnerRank}` : ''} — {claimLabel}
      </span>
    );
  }
  if (row.giveaway?.status === 'ENDED' || row.giveaway?.status === 'ARCHIVED') {
    return <span className={styles.resultNeutral}>Not selected</span>;
  }
  return <span className={styles.resultNeutral}>In the draw</span>;
}
