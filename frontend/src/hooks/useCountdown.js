import { useEffect, useState } from 'react';

/**
 * Live countdown to a target timestamp, ticked once per second.
 * Client clock is display-only at this phase; server-time synchronisation is
 * added with the backend integration (see docs/PLAN.md — B3).
 */
export function useCountdown(target) {
  const end = typeof target === 'number' ? target : new Date(target).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(0, end - now);
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor(total / 3_600_000) % 24,
    minutes: Math.floor(total / 60_000) % 60,
    seconds: Math.floor(total / 1000) % 60,
    ended: total <= 0,
    total,
  };
}
