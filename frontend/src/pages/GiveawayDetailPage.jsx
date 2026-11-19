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
  History,
} from 'lucide-react';
import { useAsync } from '../hooks/useAsync.js';
import {
  getGiveawayBySlug,
  getWinnersForGiveaway,
  IS_DEMO,
} from '../services/giveawayService.js';
import { getClaimContext } from '../services/claimService.js';
import { getHowItWorksSteps } from '../config/howItWorks.js';
import { getPrizeType } from '../config/prizeTypes.js';
import { formatAmount } from '../config/currencies.js';
import { formatCount, formatDate } from '../utils/format.js';
import PrizeMedia from '../components/home/PrizeMedia.jsx';
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
 * Giveaway detail — premium product page.
 *
 * Every value shown is the normalized service payload: title, tagline, entry
 * fee, lifecycle status, entry window and participant/winner counts. The
 * participation surface is <EntryPanel>, which enforces the unchanged
 * server-authoritative join flow (fees, eligibility, idempotency, balance).
 * No brand name or reward value is displayed because the data carries neither.
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

  const { title, tagline, status, endingSoon, participants, winners, startsAt, endsAt, entry } =
    giveaway;
  const open = status === 'active';
  const steps = getHowItWorksSteps(giveaway);
  const category = getPrizeType(giveaway.prizeType).label;

  return (
    <div className={`container ${styles.page}`}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <Link to="/giveaways">Giveaways</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{title}</span>
      </nav>

      <div className={styles.layout}>
        {/* ---------------- Main column ---------------- */}
        <div className={styles.main}>
          {/* Gallery */}
          <figure className={styles.gallery}>
            <div className={styles.galleryFrame}>
              <PrizeMedia giveaway={giveaway} categoryLabel={category} ratio="landscape" priority />
            </div>
            <figcaption className={styles.galleryCaption}>
              <span className={styles.captionCategory}>
                {category}
                {IS_DEMO ? <DemoNotice variant="chip" /> : null}
              </span>
              <span className={styles.captionMeta}>
                {status === 'active'
                  ? `Entries close ${formatDate(endsAt)}`
                  : status === 'upcoming'
                    ? `Entries open ${formatDate(startsAt)}`
                    : `Entries closed ${formatDate(endsAt)}`}
              </span>
            </figcaption>
          </figure>

          <section className={`vl-card ${styles.panel}`} aria-labelledby="about-h">
            <h2 id="about-h" className={`vl-h3 ${styles.panelTitle}`}>
              About this prize
            </h2>
            <p className={styles.desc}>{giveaway.description}</p>

            <h3 className={styles.subTitle}>Draw &amp; entry rules</h3>
            <ul className={styles.rules}>
              {giveaway.rules.map((rule) => (
                <li key={rule}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  {rule}
                </li>
              ))}
            </ul>
          </section>

          <section className={`vl-card ${styles.panel}`} aria-labelledby="how-h">
            <h2 id="how-h" className={`vl-h3 ${styles.panelTitle}`}>
              <Sparkles size={17} aria-hidden="true" /> How this giveaway works
            </h2>
            <HowItWorksTimeline steps={steps} />
          </section>

          {/* Transparency — only fields the API actually returns */}
          <section className={`vl-card ${styles.panel}`} aria-labelledby="transparency-h">
            <h2 id="transparency-h" className={`vl-h3 ${styles.panelTitle}`}>
              <History size={17} aria-hidden="true" /> Draw transparency
            </h2>
            <dl className={styles.transparency}>
              <div>
                <dt>Status</dt>
                <dd className={styles.capitalize}>{status}</dd>
              </div>
              <div>
                <dt>Entry window</dt>
                <dd>
                  {formatDate(startsAt)} — {formatDate(endsAt)}
                </dd>
              </div>
              <div>
                <dt>Entry fee</dt>
                <dd>
                  {entry
                    ? formatAmount(entry.currency, entry.amount)
                    : 'Not published for this draw'}
                </dd>
              </div>
              <div>
                <dt>Participants recorded</dt>
                <dd className="vl-num">{formatCount(participants)}</dd>
              </div>
              <div>
                <dt>Winner slots</dt>
                <dd className="vl-num">{winners}</dd>
              </div>
              <div>
                <dt>Selection</dt>
                <dd>Random draw from the closed entry snapshot</dd>
              </div>
            </dl>
            <p className={styles.transparencyNote}>
              Individual participation records are private to the account that entered; public
              pages show aggregate counts and masked winner identities only.
            </p>
          </section>

          <section className={`vl-card ${styles.panel}`} aria-labelledby="claim-h2">
            <h2 id="claim-h2" className={`vl-h3 ${styles.panelTitle}`}>
              <Trophy size={17} aria-hidden="true" /> Winner selection &amp; claim
            </h2>
            <WinnerClaimPanel giveaway={giveaway} />
          </section>

          <section className={`vl-card ${styles.panel}`} aria-labelledby="legal-h">
            <h2 id="legal-h" className={`vl-h3 ${styles.panelTitle}`}>
              <ListChecks size={17} aria-hidden="true" /> Terms &amp; important information
            </h2>
            <LegalSection />
          </section>
        </div>

        {/* ---------------- Summary rail ---------------- */}
        <aside className={styles.rail} aria-label="Draw summary and entry">
          <div className={`vl-card ${styles.summary}`}>
            <div className={styles.badgeRow}>
              <StatusBadge status={status} endingSoon={endingSoon} />
              {open && endsAt ? <Countdown endsAt={endsAt} variant="chip" /> : null}
            </div>

            <h1 className={styles.title}>{title}</h1>
            {tagline ? <p className={styles.tagline}>{tagline}</p> : null}

            {open && endsAt ? (
              <div className={styles.countdownBlock}>
                <span className={styles.countdownLabel}>Entries close in</span>
                <Countdown endsAt={endsAt} variant="blocks" />
              </div>
            ) : null}

            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>
                  <Users size={13} aria-hidden="true" /> Participants
                </dt>
                <dd>{formatCount(participants)}</dd>
              </div>
              <div className={styles.fact}>
                <dt>
                  <Trophy size={13} aria-hidden="true" /> Winners
                </dt>
                <dd>{winners}</dd>
              </div>
              <div className={styles.fact}>
                <dt>
                  <CalendarClock size={13} aria-hidden="true" />{' '}
                  {status === 'upcoming' ? 'Opens' : 'Closes'}
                </dt>
                <dd>{formatDate(status === 'upcoming' ? startsAt : endsAt)}</dd>
              </div>
            </dl>

            {/* Participation flow — unchanged server-authoritative component */}
            {open || status === 'upcoming' ? (
              <div className={styles.entryWrap}>
                <EntryPanel giveaway={giveaway} />
              </div>
            ) : (
              <p className={styles.closedNote} role="status">
                The entry window for this draw has closed.
              </p>
            )}
          </div>

          <section className={`vl-card ${styles.sidePanel}`} aria-labelledby="elig-h">
            <h2 id="elig-h" className={`vl-h4 ${styles.sidePanelTitle}`}>
              <ShieldCheck size={16} aria-hidden="true" /> Eligibility &amp; requirements
            </h2>
            <EligibilityList />
          </section>

          {ended ? (
            <section className={`vl-card ${styles.sidePanel}`} aria-labelledby="draw-winners-h">
              <h2 id="draw-winners-h" className={`vl-h4 ${styles.sidePanelTitle}`}>
                Draw result
              </h2>
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
            ← Back to all giveaways
          </Link>
        </aside>
      </div>

      <div className={styles.support}>
        <LifeBuoy size={16} aria-hidden="true" />
        <span>Need help with this giveaway?</span>
        <Link to="/legal#terms">Read the terms &amp; important information</Link>
        <span className={styles.supportNote}>
          (Direct support channels are backend-pending.)
        </span>
      </div>
    </div>
  );
}
