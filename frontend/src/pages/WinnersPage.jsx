import PageHeader from '../components/common/PageHeader.jsx';
import WinnersTabs from '../components/giveaway/WinnersTabs.jsx';
import MyClaims from '../components/giveaway/MyClaims.jsx';
import TrustSection from '../components/giveaway/TrustSection.jsx';
import DemoNotice from '../components/common/DemoNotice.jsx';
import styles from './Winners.module.css';

/**
 * Winner wall — Winners + Previous Winners tabs over the service layer.
 * All records are fictional demo announcements with masked identities; the
 * privacy note explains why no contact detail is ever shown publicly.
 */
export default function WinnersPage() {
  return (
    <div className={`container ${styles.page}`}>
      <PageHeader
        eyebrow="Announced & verified · demo content"
        title="Winner"
        gradientWord="Wall"
        subtitle="Every closed draw ends with a public, audited announcement. Congratulations to our VELOOP Rewards champions."
      />

      <div className={styles.noticeWrap}>
        <DemoNotice
          variant="chip"
          text="All winner records on this page are fictional demo data with masked IDs — not genuine live announcements."
        />
      </div>

      <WinnersTabs />

      <MyClaims />

      <p className={styles.note} role="note">
        Privacy by design: winner identities are published in masked form only.
        Full email addresses, phone numbers and home addresses are never shown
        in public winner records, and a claim form is visible only to the
        winning account itself. The authoritative masking policy follows the
        official VELOOP programme specification.
      </p>

      <div className={styles.trust}>
        <TrustSection />
      </div>
    </div>
  );
}
