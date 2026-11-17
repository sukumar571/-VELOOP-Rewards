import { useEffect, useRef, useState } from 'react';
import styles from './Reveal.module.css';

/** True when the visitor asked for reduced motion (or no window yet). */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One-shot scroll reveal. Wraps a single element, fades + lifts it into place
 * the first time it enters the viewport, then disconnects the observer.
 *
 * Deliberately defensive: with no IntersectionObserver (SSR/jsdom) or with
 * prefers-reduced-motion, the content is shown immediately — animation is an
 * enhancement, never a prerequisite for reading the page.
 *
 * @param {string}  as    element/tag to render (e.g. "li" inside a list)
 * @param {number}  delay stagger in milliseconds
 */
export default function Reveal({
  as: Tag = 'div',
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => {
    if (typeof IntersectionObserver === 'undefined') return true;
    return prefersReducedMotion();
  });

  useEffect(() => {
    if (shown) return undefined;
    const el = ref.current;
    if (!el) {
      setShown(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref}
      className={[styles.reveal, shown ? styles.shown : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ '--reveal-delay': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
