import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronRight,
  Users,
  Trophy,
  CalendarClock,
  ShieldCheck,
  ListChecks,
  Sparkles,
  LifeBuoy,
} from 'lucide-react';
import { useAsync } from '../hooks/useAsync.js';
import {
  getGiveawayBySlug,
  getWinnersForGiveaway,
  IS_DEMO,
} from '../services/giveawayService.js';
import { getClaimContext } from '../services/claimService.js';
import { getHowItWorksSteps } from '../config/howItWorks.js';
import { formatCount, formatDate } from '../utils/format.js';
import PrizeVisual from '../components/common/PrizeVisual.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Countdown from '../components/common/Countdown.jsx';
import Skeleton from '../components/common/Skeleton.jsx';
import GiveawayLoader from '../components/common/GiveawayLoader.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import WinnerCard from '../components/giveaway/WinnerCard.jsx';
import WinnerClaimCard from '../components/giveaway/WinnerClaimCard.jsx';
import EntryPanel from '../components/giveaway/EntryPanel.jsx';
import EligibilityList from '../components/giveaway/EligibilityList.jsx';
import HowItWorksTimeline from '../components/giveaway/HowItWorksTimeline.jsx';
import WinnerClaimPanel from '../components/giveaway/WinnerClaimPanel.jsx';
import LegalSection from '../components/giveaway/LegalSection.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import styles from './GiveawayDetail.module.css';

/**
 * Individual giveaway details page. Everything (fees, currency, lifecycle,
 * entry states, claim info) is driven from structured config via the service
 * layer — no prize-specific branches live here. Participation is delegated to
 * <EntryPanel>, which enforces the server-authoritative flow.
 */
export default function GiveawayDetailPage() {
  const { slug } = useParams();
  const { data: giveaway, loading, error, reload } = useAsync(
    () => getGiveawayBySlug(slug),
    [slug],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [slug]);

  const ended = giveaway?.status === 'ended';

  const {
    data: drawWinners,
    loading: winnersLoading,
    error: winnersError,
    reload: reloadWinners,
  } = useAsync(
    () => (ended ? getWinnersForGiveaway(giveaway.id) : Promise.resolve([])),
    [ended, giveaway?.id],
  );

  // Personalized claim for the CURRENT user — the service only marks isWinner
  // true when the authenticated account owns this published draw's claim.
  const { data: claimCtx, reload: reloadClaim } = useAsync(
    () => (ended ? getClaimContext(giveaway.id) : Promise.resolve(null)),
    [ended, giveaway?.id],
  );

  if (loading) {
    return (
      <div className={`container ${styles.page}`} aria-busy="true">
        <GiveawayLoader label={`Loading “${slug}”…`} />
      </div>
    );
  }

  if (error) {
    if (error.code === 'NOT_FOUND') {
      return (
        <NotFoundPage
          title="Giveaway not found"
          message={`There is no giveaway at "${slug}". It may have ended and been archived.`}
        />
      );
    }
    return (
      <div className={`container ${styles.page}`}>
        <ErrorState
          title="Couldn't load this giveaway"
          message={error.message}
          onRetry={reload}
        />
      </div>
    );
  }

  const { title, tagline, status, endingSoon, participants, winners, startsAt, endsAt } =
    giveaway;
  const open = status === 'active';
  const steps = getHowItWorksSteps(giveaway);

  return (
    <div className={`container ${styles.page}`}>
      {/* Visible link back to Giveaway Home */}
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <Link to="/giveaways">Giveaways</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{title}</span>
      </nav>

      <div className={styles.layout}>
        {/* ---- Left: visual + long copy + info sections ---- */}
        <div className={styles.colVisual}>
          <PrizeVisual giveaway={giveaway} size="detail" className={styles.visual} />

          <section className={`vl-card ${styles.panel}`} aria-labelledby="about-h">
            <h2 id="about-h" className="vl-h2">
              About this prize
            </h2>
            <p className={styles.desc}>{giveaway.description}</p>

            <h3 className={styles.rulesTitle}>Draw &amp; entry rules</h3>
            <ul className={styles.rules}>
              {giveaway.rules.map((rule) => (
                <li key={rule}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  {rule}
                </li>
              ))}
            </ul>
          </section>

          {/* Accessible How This Giveaway Works timeline */}
          <section className={`vl-card ${styles.panel}`} aria-labelledby="how-h">
            <h2 id="how-h" className={styles.entryTitle}>
              <Sparkles size={18} aria-hidden="true" /> How this giveaway works
            </h2>
            <HowItWorksTimeline steps={steps} />
          </section>

          {/* Winner-selection & prize-claim information */}
          <section className={`vl-card ${styles.panel}`} aria-labelledby="claim-h2">
            <h2 id="claim-h2" className={styles.entryTitle}>
              <Trophy size={18} aria-hidden="true" /> Winner selection &amp; claim
            </h2>
            <WinnerClaimPanel giveaway={giveaway} />
          </section>

          {/* Expandable Terms & Conditions + Important Information */}
          <section className={`vl-card ${styles.panel}`} aria-labelledby="legal-h">
            <h2 id="legal-h" className={styles.entryTitle}>
              <ListChecks size={18} aria-hidden="true" /> Terms &amp; important information
            </h2>
            <LegalSection />
          </section>
        </div>

        {/* ---- Right: facts + participation + eligibility ---- */}
        <div className={styles.colFacts}>
          <section className={`vl-card ${styles.panel}`} aria-label="Giveaway summary">
            <div className={styles.badgeRow}>
              <StatusBadge status={status} endingSoon={endingSoon} />
              {open ? <Countdown endsAt={endsAt} variant="blocks" /> : null}
              {IS_DEMO ? <DemoNotice variant="chip" /> : null}
            </div>

            <h1 className={styles.title}>{title}</h1>
            <p className={styles.tagline}>{tagline}</p>

            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>
                  <Users size={14} aria-hidden="true" /> Participants
                </dt>
                <dd>{formatCount(participants)}</dd>
              </div>
              <div className={styles.fact}>
                <dt>
                  <Trophy size={14} aria-hidden="true" /> Winners
                </dt>
                <dd>{winners}</dd>
              </div>
              <div className={styles.fact}>
                <dt>
                  <CalendarClock size={14} aria-hidden="true" />{' '}
                  {status === 'upcoming' ? 'Entries open' : 'Entries close'}
                </dt>
                <dd>{formatDate(status === 'upcoming' ? startsAt : endsAt)}</dd>
              </div>
            </dl>

            {/* Participation flow — all authoritative checks live in the service */}
            {open || status === 'upcoming' ? (
              <EntryPanel giveaway={giveaway} />
            ) : (
              <p className={styles.closedNote} role="status">
                The entry window for this draw has closed.
              </p>
            )}
          </section>

          {/* Eligibility & participation requirements */}
          <section className={`vl-card ${styles.panel}`} aria-labelledby="elig-h">
            <h2 id="elig-h" className={styles.entryTitle}>
              <ShieldCheck size={18} aria-hidden="true" /> Eligibility &amp; requirements
            </h2>
            <EligibilityList />
          </section>

          {/* ENDED-only draw result (ACTIVE never renders winners). */}
          {ended ? (
            <section className={`vl-card ${styles.panel}`} aria-labelledby="draw-winners-h">
              <h2 id="draw-winners-h" className={styles.entryTitle}>
                Draw result
              </h2>
              {/* Personalized claim — rendered ONLY when the server confirms this
                  account is the winner. Non-winners see just the masked public list. */}
              {claimCtx?.isWinner ? (
                <div className={styles.claimBlock}>
                  <WinnerClaimCard record={claimCtx} onUpdated={reloadClaim} />
                </div>
              ) : null}
              {winnersLoading ? (
                <div aria-busy="true">
                  <Skeleton variant="blocks" count={2} />
                </div>
              ) : winnersError ? (
                <ErrorState
                  title="Draw result unavailable"
                  message={winnersError.message}
                  onRetry={reloadWinners}
                />
              ) : drawWinners.length ? (
                <div className={styles.winners}>
                  {drawWinners.map((w) => (
                    <WinnerCard key={w.id} winner={w} compact />
                  ))}
                </div>
              ) : (
                <p className={styles.closedNote} role="status">
                  The winner announcement for this draw is pending publication.
                </p>
              )}
            </section>
          ) : null}

          <Link to="/giveaways" className={styles.back}>
            ← Back to Giveaway Home
          </Link>
        </div>
      </div>

      {/* Support link */}
      <div className={styles.support}>
        <LifeBuoy size={16} aria-hidden="true" />
        <span>Need help with this giveaway?</span>
        <Link to="/#how-it-works">Visit the how-it-works guide</Link>
        <span className={styles.supportNote}>
          (Direct support channels are backend-pending.)
        </span>
      </div>
    </div>
  );
}
