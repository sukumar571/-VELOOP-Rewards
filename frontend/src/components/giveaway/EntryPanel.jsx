import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogIn,
  Check,
  Loader2,
  AlertTriangle,
  Lock,
  CalendarClock,
  Trophy,
  ShieldAlert,
} from 'lucide-react';
import { useAsync } from '../../hooks/useAsync.js';
import { getEntryState, joinGiveaway } from '../../services/giveawayService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { getCurrency, formatAmount } from '../../config/currencies.js';
import { formatDate } from '../../utils/format.js';
import Modal from '../common/Modal.jsx';
import Skeleton from '../common/Skeleton.jsx';
import ErrorState from '../common/ErrorState.jsx';
import styles from './EntryPanel.module.css';

/**
 * The single participation surface for a giveaway. It renders entirely from
 * the AUTHORITATIVE entry state returned by the service (fee + balance are
 * re-read server-side in getEntryState/joinGiveaway — the client never supplies
 * or trusts them). Covers: signed-out, upcoming, ended, ineligible,
 * insufficient balance, sufficient balance (→ confirm modal), already-joined,
 * and the loading / submitting / success / error feedback around the join call.
 */
export default function EntryPanel({ giveaway }) {
  const { id, title } = giveaway;
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticated, refresh } = useAuth();

  // Refetch whenever auth changes or the giveaway id changes.
  const {
    data: entry,
    loading,
    error,
    reload,
  } = useAsync(() => getEntryState(id), [id, authenticated]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [justJoined, setJustJoined] = useState(null); // receipt for success banner

  function goLogin() {
    // Preserve the intended destination so login can return here.
    navigate('/login', { state: { from: location.pathname } });
  }

  function openConfirm() {
    setJoinError(null);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (submitting) return; // don't dismiss mid-request
    setConfirmOpen(false);
  }

  async function confirmJoin() {
    if (submitting) return; // duplicate-submission guard
    setSubmitting(true);
    setJoinError(null);
    try {
      // Pass ONLY the id — fee/balance are never sent from the client.
      const receipt = await joinGiveaway(id);
      setJustJoined(receipt);
      setConfirmOpen(false);
      await refresh(); // re-read authoritative wallet
      reload(); // re-read authoritative entry state (hasJoined -> true)
    } catch (e) {
      setJoinError(e?.message || 'We could not process your entry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.panel} aria-busy="true">
        <Skeleton variant="blocks" count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Couldn't load entry options"
        message={error.message}
        onRetry={reload}
      />
    );
  }

  const currency = getCurrency(entry.entry?.currency);
  const feeLabel = formatAmount(entry.entry?.currency, entry.entry?.amount);
  // A balance is only trusted when the server actually reported a number for it.
  // An unknown balance (wallet unconfigured/unreachable) is shown as "—" and is
  // NEVER coerced to 0, so we never imply the user can or cannot afford an entry.
  const balanceKnown = typeof entry.balance === 'number';
  // The "amount remaining after joining" preview only makes sense when joining
  // is actually a valid next action — a live draw, eligible, sufficient balance
  // and not already entered. Otherwise a negative/stale figure would mislead.
  const canPreviewRemaining =
    entry.status === 'active' && entry.eligible && balanceKnown && entry.sufficient && !entry.hasJoined;

  return (
    <section className={styles.panel} aria-label="Entry and participation">
      <h2 className={styles.heading}>Entry</h2>

      {/* Exact currency + fee (from structured config) */}
      <div className={styles.feeRow}>
        <span className={styles.feeLabel}>Entry fee</span>
        <span className={`${styles.feeValue} ${styles[currency.accent] ?? styles.ve}`}>
          {feeLabel}
        </span>
      </div>

      {/* ---- Signed out ---- */}
      {!entry.authenticated ? (
        <div className={styles.state}>
          <p className={styles.stateText}>
            <Lock size={15} aria-hidden="true" />
            Sign in to check your balance and enter this giveaway.
          </p>
          <button type="button" className="vl-btn vl-btn-cta" onClick={goLogin}>
            <LogIn size={16} aria-hidden="true" />
            Sign in to enter
          </button>
        </div>
      ) : (
        <>
          {/* ---- Balance for the matching currency ---- */}
          <div className={styles.balanceRow}>
            <span className={styles.balanceLabel}>Your {currency.label} balance</span>
            <span className={styles.balanceValue}>
              {balanceKnown ? formatAmount(entry.entry?.currency, entry.balance) : '—'}
            </span>
          </div>
          {canPreviewRemaining ? (
            <div className={styles.remainingRow}>
              <span>After joining</span>
              <span aria-label="Balance remaining after joining, for display only">
                {formatAmount(entry.entry?.currency, entry.projectedAfter)}
              </span>
            </div>
          ) : null}

          {/* ---- Success banner right after a confirmed join ---- */}
          {justJoined && entry.hasJoined ? (
            <p className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
              <Check size={16} aria-hidden="true" />
              You&apos;re entered.
              {typeof justJoined.fee === 'number'
                ? ` ${formatAmount(entry.entry?.currency, justJoined.fee)} was deducted`
                : ''}
              {typeof justJoined.balanceAfter === 'number'
                ? ` — new balance ${formatAmount(entry.entry?.currency, justJoined.balanceAfter)}.`
                : '. Your updated balance is shown above once verified.'}
            </p>
          ) : null}

          {/* ---- Lifecycle / eligibility / entry states ---- */}
          {entry.status === 'upcoming' ? (
            <StateNote
              icon={<CalendarClock size={15} aria-hidden="true" />}
              tone="info"
              text={`Entries open ${formatDate(giveaway.startsAt)}. You can't join yet.`}
            />
          ) : entry.status === 'ended' ? (
            <StateNote
              icon={<Lock size={15} aria-hidden="true" />}
              tone="info"
              text="The entry window for this giveaway has closed."
            />
          ) : entry.hasJoined ? (
            <StateNote
              icon={<Trophy size={15} aria-hidden="true" />}
              tone="success"
              text="You've already entered this giveaway. Good luck!"
            />
          ) : !entry.eligible ? (
            <StateNote
              icon={<ShieldAlert size={15} aria-hidden="true" />}
              tone="warn"
              text="This account isn't eligible to enter this giveaway."
            />
          ) : !balanceKnown ? (
            <StateNote
              icon={<AlertTriangle size={15} aria-hidden="true" />}
              tone="warn"
              text="We couldn't verify your balance right now, so joining is temporarily unavailable. Please try again shortly."
            />
          ) : !entry.sufficient ? (
            <StateNote
              icon={<AlertTriangle size={15} aria-hidden="true" />}
              tone="error"
              text={`You need ${feeLabel} to enter, but your balance is ${formatAmount(
                entry.entry?.currency,
                entry.balance,
              )}.`}
            />
          ) : null}

          {/* ---- Primary action ---- */}
          <JoinAction
            status={entry.status}
            hasJoined={entry.hasJoined}
            eligible={entry.eligible}
            sufficient={entry.sufficient}
            balanceKnown={balanceKnown}
            onJoin={openConfirm}
          />

          {/* ---- Confirmation modal (explicit consent before charging) ---- */}
          <Modal
            open={confirmOpen}
            onClose={closeConfirm}
            title="Confirm your entry"
            titleId="entry-confirm-title"
            footer={
              <>
                <button
                  type="button"
                  className="vl-btn vl-btn-outline"
                  onClick={closeConfirm}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="vl-btn vl-btn-cta"
                  onClick={confirmJoin}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className={styles.spin} aria-hidden="true" />
                      Joining…
                    </>
                  ) : (
                    `Confirm & join — ${feeLabel}`
                  )}
                </button>
              </>
            }
          >
            <dl className={styles.summary}>
              <div className={styles.summaryRow}>
                <dt>Prize</dt>
                <dd>{title}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Currency</dt>
                <dd>{currency.label} <span className={styles.currencyLong}>({currency.longName})</span></dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Entry fee</dt>
                <dd className={styles.feeValue}>{feeLabel}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Current balance</dt>
                <dd>{balanceKnown ? formatAmount(entry.entry?.currency, entry.balance) : '—'}</dd>
              </div>
              <div className={`${styles.summaryRow} ${styles.projRow}`}>
                <dt>Balance after joining</dt>
                <dd>
                  {entry.projectedAfter == null
                    ? '—'
                    : formatAmount(entry.entry?.currency, entry.projectedAfter)}
                </dd>
              </div>
            </dl>
            <p className={styles.modalNote}>
              Joining deducts {feeLabel} once, only after you confirm. Balances and
              the fee are verified on the server — this preview is for display only.
            </p>
            {joinError ? (
              <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                {joinError}
              </p>
            ) : null}
          </Modal>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function JoinAction({ status, hasJoined, eligible, sufficient, balanceKnown, onJoin }) {
  if (status !== 'active') {
    return (
      <button type="button" className="vl-btn vl-btn-outline" disabled>
        {status === 'upcoming' ? 'Entries not open yet' : 'Entries closed'}
      </button>
    );
  }
  if (hasJoined) {
    return (
      <button type="button" className="vl-btn vl-btn-outline" disabled>
        <Check size={16} aria-hidden="true" /> Already entered
      </button>
    );
  }
  const blocked = !eligible || !sufficient;
  return (
    <button
      type="button"
      className={`vl-btn vl-btn-cta ${styles.joinBtn}`}
      onClick={onJoin}
      disabled={blocked}
      aria-disabled={blocked}
    >
      {blocked ? (
        <>
          <Lock size={16} aria-hidden="true" />
          {!eligible ? 'Not eligible' : !balanceKnown ? 'Balance unavailable' : 'Insufficient balance'}
        </>
      ) : (
        'Join Now'
      )}
    </button>
  );
}

function StateNote({ icon, tone, text }) {
  return (
    <p className={`${styles.note} ${styles[`note_${tone}`]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={styles.noteIcon} aria-hidden="true">
        {icon}
      </span>
      {text}
    </p>
  );
}
