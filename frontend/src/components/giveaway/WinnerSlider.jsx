import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import WinnerCard from './WinnerCard.jsx';
import styles from './WinnerSlider.module.css';

const AUTO_MS = 4500;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Smooth winner-announcement slider.
 * - Auto-advances on a timer; pauses on mouse hover and keyboard focus.
 * - Falls back to a static scrollable row when reduced motion is preferred.
 * - Every slide uses masked fictional IDs from the service layer and the
 *   section around it carries a DemoNotice, so nothing reads as live.
 */
export default function WinnerSlider({ winners = [] }) {
  const trackRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const reduced = useMemo(prefersReducedMotion, []);

  const step = useCallback(() => {
    const track = trackRef.current;
    if (!track || !track.firstElementChild) return 0;
    const slide = track.firstElementChild.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return slide + gap;
  }, []);

  const scrollTo = useCallback(
    (i) => {
      const track = trackRef.current;
      if (!track) return;
      const max = track.scrollWidth - track.clientWidth;
      track.scrollTo({
        left: Math.max(0, Math.min(i * step(), max)),
        behavior: reduced ? 'auto' : 'smooth',
      });
    },
    [reduced, step],
  );

  /* Auto-advance (never when reduced motion is requested). */
  useEffect(() => {
    if (reduced || paused || winners.length < 2) return undefined;
    const id = setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
      scrollTo(atEnd ? 0 : index + 1);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [reduced, paused, index, winners.length, scrollTo]);

  /* Keep dots in sync with manual swipes/scrolling. */
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const s = step();
    if (s > 0) setIndex(Math.round(track.scrollLeft / s));
  }, [step]);

  if (!winners.length) return null;

  const perView = () => {
    const w = window.innerWidth;
    if (w >= 1200) return 3;
    if (w >= 768) return 2;
    return 1;
  };
  const dotCount = Math.max(1, winners.length - (perView() - 1));

  return (
    <div
      className={styles.root}
      role="region"
      aria-roledescription="carousel"
      aria-label="Recent winner announcements (demo content)"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={styles.viewport} ref={trackRef} onScroll={onScroll}>
        <ul className={styles.track}>
          {winners.map((winner, i) => (
            <li
              key={winner.id}
              className={styles.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={`Announcement ${i + 1} of ${winners.length}`}
            >
              <WinnerCard winner={winner} />
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => scrollTo(Math.max(0, index - 1))}
          disabled={index <= 0}
          aria-label="Previous winners"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <span className={styles.dots} aria-hidden="true">
          {Array.from({ length: dotCount }, (_, d) => (
            <button
              key={d}
              type="button"
              className={`${styles.dot} ${d === index ? styles.dotActive : ''}`}
              onClick={() => scrollTo(d)}
              tabIndex={-1}
            />
          ))}
        </span>

        <button
          type="button"
          className={styles.arrow}
          onClick={() => scrollTo(Math.min(dotCount - 1, index + 1))}
          disabled={index >= dotCount - 1}
          aria-label="Next winners"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        {!reduced ? (
          <span className={styles.motionHint}>
            <Sparkles size={12} aria-hidden="true" />
            {paused ? 'Paused' : 'Auto'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
