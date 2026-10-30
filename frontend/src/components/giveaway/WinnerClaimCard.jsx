import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper, Clock, CheckCheck, PackageCheck } from 'lucide-react';
import { CLAIM_STATUS } from '../../config/claimStatus.js';
import { formatDate } from '../../utils/format.js';
import Modal from '../common/Modal.jsx';
import ClaimStatusIndicator from './ClaimStatusIndicator.jsx';
import PrizeClaimForm from './PrizeClaimForm.jsx';
import styles from './WinnerClaimCard.module.css';

/**
 * Winner-specific claim card. Shown ONLY when the server has confirmed the
 * current user is the winner of this published draw. It renders the personalized
 * congratulations, the claim status, the deadline and — while the claim is open —
 * an action that opens the fulfilment form in an accessible modal. Non-claimable
 * states (submitted / completed / expired) never expose the form.
 *
 * `record` is the normalized claim view from getClaimContext / getMyWonRecords.
 */
export default function WinnerClaimCard({ record, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  if (!record || record.isWinner === false) return null;

  // Close the modal and only THEN let the parent refetch, so the winner can read
  // the in-modal success confirmation before the card updates to its new status.
  function closeModal() {
    setOpen(false);
    if (justSubmitted) {
      setJustSubmitted(false);
      onUpdated?.();
    }
  }

  const {
    giveawayId,
    giveawaySlug,
    giveawayTitle,
    prize,
    deliveryMode,
    status,
    deadline,
    canClaim,
    fields,
  } = record;

  const titleNode = giveawaySlug ? (
    <Link to={`/giveaways/${giveawaySlug}`} className={styles.prizeLink}>
      {giveawayTitle}
    </Link>
  ) : (
    <span>{giveawayTitle}</span>
  );

  return (
    <section className={styles.card} aria-label={`Your claim for ${giveawayTitle}`}>
      <header className={styles.head}>
        <span className={styles.congratsIcon} aria-hidden="true">
          <PartyPopper size={20} />
        </span>
        <div className={styles.headText}>
          <p className={styles.congrats}>Congratulations — you won this draw!</p>
          <h3 className={styles.prize}>
            {titleNode}
            {prize && prize !== giveawayTitle ? (
              <span className={styles.prizeSub}> · {prize}</span>
            ) : null}
          </h3>
        </div>
      </header>

      <div className={styles.meta}>
        <ClaimStatusIndicator status={status} />
        {deadline ? (
          <span className={styles.deadline}>
            <Clock size={13} aria-hidden="true" />
            {status === CLAIM_STATUS.EXPIRED ? 'Deadline passed' : 'Claim by'}{' '}
            {formatDate(deadline)}
          </span>
        ) : null}
      </div>

      {/* Status-specific guidance */}
      {status === CLAIM_STATUS.SUBMITTED || status === CLAIM_STATUS.PROCESSING ? (
        <p className={`${styles.note} ${styles.noteInfo}`} role="status">
          <CheckCheck size={15} aria-hidden="true" />
          Your claim has been received and is being processed. No further action is needed.
        </p>
      ) : status === CLAIM_STATUS.COMPLETED ? (
        <p className={`${styles.note} ${styles.noteSuccess}`} role="status">
          <PackageCheck size={15} aria-hidden="true" />
          This prize has been claimed and is on its way. Well done!
        </p>
      ) : status === CLAIM_STATUS.EXPIRED ? (
        <p className={`${styles.note} ${styles.noteError}`} role="status">
          The claim window closed on {formatDate(deadline)}, so this prize can no longer be
          claimed.
        </p>
      ) : null}

      {canClaim ? (
        <button
          type="button"
          className={`vl-btn vl-btn-cta ${styles.claimBtn}`}
          onClick={() => setOpen(true)}
        >
          {deliveryMode === 'digital' ? 'Claim gift card' : 'Claim prize'}
        </button>
      ) : null}

      <Modal
        open={open}
        onClose={closeModal}
        title={`Claim your ${giveawayTitle}`}
        titleId={`claim-title-${giveawayId}`}
      >
        <PrizeClaimForm
          record={{ giveawayId, giveawayTitle, deliveryMode, fields, deadline }}
          onCancel={closeModal}
          onSubmitted={() => setJustSubmitted(true)}
        />
      </Modal>
    </section>
  );
}
