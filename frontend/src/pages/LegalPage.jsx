import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import PageHeader from '../components/common/PageHeader.jsx';
import LegalSection from '../components/giveaway/LegalSection.jsx';
import styles from './Legal.module.css';

const PRIVACY = [
  'Winner announcements publish masked account identifiers only. Full names, email addresses, phone numbers and delivery addresses are never shown in public winner records.',
  'A prize claim is visible only to the account that won it; the claim form is never rendered for any other visitor.',
  'Entry records store salted device, session and IP digests for duplicate detection and fraud review — not raw identifiers.',
  'This build is a demonstration environment: the terms below are programme placeholders and state explicitly which items still await business approval.',
];

/**
 * Legal — Terms & Conditions, Important Information and the privacy statement.
 * All copy comes from the existing programme service or from behaviour the
 * application implements; nothing is paraphrased into a new promise.
 */
export default function LegalPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="Programme"
        title="Terms &"
        gradientWord="privacy"
        subtitle="The rules that govern an entry, what happens to your record, and how winner identities are published."
      />

      <section id="terms" className={`vl-card ${styles.block}`} aria-labelledby="terms-heading">
        <h2 id="terms-heading" className={`vl-h3 ${styles.heading}`}>
          Terms &amp; conditions
        </h2>
        <p className={styles.lead}>
          Draw rules are versioned per giveaway and shown on each draw's page before you enter.
          Items awaiting confirmation are marked as pending rather than presented as settled policy.
        </p>
        <LegalSection />
      </section>

      <section id="privacy" className={`vl-card ${styles.block}`} aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className={`vl-h3 ${styles.heading}`}>
          <ShieldCheck size={18} aria-hidden="true" /> Privacy
        </h2>
        <ul className={styles.list}>
          {PRIVACY.map((item) => (
            <li key={item} className={styles.item}>
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
