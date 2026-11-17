import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Hero from '../components/home/Hero.jsx';
import FeaturedRewards from '../components/home/FeaturedRewards.jsx';
import Discovery from '../components/home/Discovery.jsx';
import Experience from '../components/home/Experience.jsx';
import Steps from '../components/home/Steps.jsx';
import WinnersTabs from '../components/giveaway/WinnersTabs.jsx';
import SectionHeading from '../components/common/SectionHeading.jsx';
import styles from './Home.module.css';

/**
 * VELOOP Rewards homepage.
 *
 * Editorial composition: cinematic hero → featured rewards → full discovery →
 * what the platform actually enforces → how entry works → published winners.
 * Every number, prize and winner on this page comes from the existing service
 * layer; there are no invented statistics, testimonials or product prices.
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
      <Hero />
      <FeaturedRewards />
      <Discovery />
      <Experience />

      <div id="how-it-works" className="vl-anchor-offset">
        <Steps />
      </div>

      <section className={`container ${styles.winners}`} aria-labelledby="home-winners-heading">
        <SectionHeading
          eyebrow="Announced publicly"
          title="Recent winners"
          subtitle="Results are published only after a draw closes, with masked identities. No personal contact details are ever shown."
          link={{ to: '/winners', label: 'Winner wall' }}
        />
        <h2 id="home-winners-heading" className="vl-visually-hidden">
          Recent winners
        </h2>
        <WinnersTabs />
      </section>
    </>
  );
}
