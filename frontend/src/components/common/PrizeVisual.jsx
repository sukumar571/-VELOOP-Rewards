import {
  Smartphone,
  Watch,
  Headphones,
  Gift,
  Gamepad2,
  ShoppingBag,
  CarFront,
  UtensilsCrossed,
} from 'lucide-react';
import { asset } from '../../utils/assets.js';
import styles from './PrizeVisual.module.css';

const ICONS = {
  Smartphone,
  Watch,
  Headphones,
  Gift,
  Gamepad2,
  ShoppingBag,
  CarFront,
  UtensilsCrossed,
};

/**
 * Prize visual slot. If a matching local file exists in src/assets/ it is
 * used automatically; otherwise a on-brand generated panel is rendered
 * (gradient glow + category icon). Nothing here is a broken image.
 */
export default function PrizeVisual({ giveaway, size = 'card', className = '' }) {
  const url = asset(giveaway.assetKey);
  const Icon = ICONS[giveaway.icon] ?? Gift;
  const cls = [styles.wrap, styles[size], styles[`accent_${giveaway.accent}`], className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} aria-hidden="true">
      {url ? (
        <img className={styles.img} src={url} alt="" loading="lazy" />
      ) : (
        <>
          <span className={styles.glow} />
          <span className={styles.pattern} />
          <Icon className={styles.icon} strokeWidth={1.4} />
          <span className={styles.ribbon}>PRIZE</span>
        </>
      )}
    </div>
  );
}
