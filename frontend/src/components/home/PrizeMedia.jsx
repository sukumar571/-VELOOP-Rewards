import { Gift, Smartphone, Watch, Headphones, Gamepad2, Ticket, Package } from 'lucide-react';
import { asset } from '../../utils/assets.js';
import styles from './PrizeMedia.module.css';

const ICONS = { Smartphone, Watch, Headphones, Gamepad2, Gift, Ticket, Package };

/**
 * Two initials from a title, used as the editorial monogram when no photograph
 * has been supplied yet: "iPhone 15 Pro" -> "IP", "Apple Watch Series 9" -> "AW".
 */
export function monogramOf(title = '') {
  const words = String(title)
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w));
  const letters = words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return letters || 'V';
}

/**
 * Reward media slot.
 *
 * If an authentic product photograph exists in src/assets/ (see utils/assets.js
 * naming conventions) it is rendered and remains the primary visual. Otherwise
 * a typographic plate is composed from the prize's own category and name — a
 * deliberate editorial treatment, never a stock photo, illustration or invented
 * prize imagery.
 *
 * @param {object}  giveaway      normalized giveaway (title/icon/assetKey/accent)
 * @param {string}  categoryLabel human label, e.g. "Electronic device"
 * @param {string}  ratio         portrait | landscape | square | wide
 */
export default function PrizeMedia({
  giveaway,
  categoryLabel = 'Prize',
  ratio = 'landscape',
  className = '',
  priority = false,
}) {
  const url = asset(giveaway?.assetKey);
  const Icon = ICONS[giveaway?.icon] ?? Package;
  const cls = [styles.media, styles[ratio], styles[`accent_${giveaway?.accent || 'violet'}`], className]
    .filter(Boolean)
    .join(' ');

  if (url) {
    return (
      <div className={cls}>
        <img
          className={styles.img}
          src={url}
          alt={`${giveaway?.title ?? 'Prize'} — prize photograph`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div className={cls} aria-hidden="true">
      <span className={styles.light} />
      <span className={styles.grid} />
      <span className={styles.category}>
        <Icon size={13} strokeWidth={1.6} />
        {categoryLabel}
      </span>
      <span className={styles.monogram}>{monogramOf(giveaway?.title)}</span>
      <span className={styles.rule} />
      <span className={styles.caption}>{giveaway?.title}</span>
    </div>
  );
}
