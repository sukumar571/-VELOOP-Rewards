import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import GiveawayBanner from '../components/giveaway/GiveawayBanner.jsx';
import GiveawayHero from '../components/giveaway/GiveawayHero.jsx';
import GiveawayStats from '../components/giveaway/GiveawayStats.jsx';
import FeaturedGiveaways from '../components/giveaway/FeaturedGiveaways.jsx';
import HowToParticipate from '../components/giveaway/HowToParticipate.jsx';
import WinnersTabs from '../components/giveaway/WinnersTabs.jsx';
import GiveawayRules from '../components/giveaway/GiveawayRules.jsx';
import FaqAccordion from '../components/giveaway/FaqAccordion.jsx';
import TrustSection from '../components/giveaway/TrustSection.jsx';
import SectionHeading from '../components/common/SectionHeading.jsx';
import styles from './Home.module.css';

/**
 * Main VELOOP Rewards Giveaway homepage.
 * Composition-only page: every block is a reusable, service-backed component
 * (mock data today, API tomorrow — see src/services/giveawayService.js).
 */
export default function HomePage() {
  const { hash } = useLocation();

  // Honour hash navigation (e.g. navbar "How it works" → /#how-it-works).
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <>
      <GiveawayBanner variant="marquee" />
      <GiveawayHero />
      <GiveawayStats />
      <FeaturedGiveaways />

      <section className={`vl-section container ${styles.how}`} aria-labelledby="how-heading">
        <span id="how-heading" className="visually-hidden">
          How to participate
        </span>
        <HowToParticipate />
      </section>

      <section className={`vl-section container ${styles.winners}`} aria-labelledby="wall-heading">
        <div id="recent-winners" className="vl-anchor-offset">
          <SectionHeading
            eyebrow="Announced · masked · demo content"
            title="Winner Announcements"
            subtitle="Fresh results from closed draws. Winner identities stay masked — fictional demo announcements until the real winner API lands."
            link={{ to: '/winners', label: 'Winner Wall' }}
          />
          <h2 id="wall-heading" className="visually-hidden">
            Winners and previous winners
          </h2>
          <WinnersTabs />
        </div>
      </section>

      <GiveawayBanner variant="cta" />

      <GiveawayRules />
      <FaqAccordion />

      <TrustSection />
    </>
  );
}
