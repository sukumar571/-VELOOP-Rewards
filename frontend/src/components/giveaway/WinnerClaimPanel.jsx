import { Shuffle, PackageCheck } from 'lucide-react';
import { describeSelectionAndClaim } from '../../config/prizeTypes.js';
import styles from './WinnerClaimPanel.module.css';

/**
 * Winner-selection & prize-claim information, derived generically from the
 * giveaway's prizeType (physical vs digital) — never from the prize name.
 * Operational timings that aren't confirmed are intentionally not asserted here.
 */
export default function WinnerClaimPanel({ giveaway }) {
  const { selection, claim } = describeSelectionAndClaim(giveaway);

  return (
    <div className={styles.grid}>
      <section className={styles.block} aria-labelledby="sel-h">
        <h3 id="sel-h" className={styles.blockTitle}>
          <Shuffle size={16} aria-hidden="true" />
          How the winner is selected
        </h3>
        <p className={styles.headline}>{selection.headline}</p>
        <p className={styles.note}>{selection.note}</p>
      </section>

      <section className={styles.block} aria-labelledby="claim-h">
        <h3 id="claim-h" className={styles.blockTitle}>
          <PackageCheck size={16} aria-hidden="true" />
          How the prize is claimed
        </h3>
        <p className={styles.headline}>{claim.headline}</p>
        <ol className={styles.steps}>
          {claim.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
