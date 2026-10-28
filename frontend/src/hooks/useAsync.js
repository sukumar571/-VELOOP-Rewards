import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small async-data hook with explicit loading / error / retry states.
 * Replaces itself with React Query (or similar) at API integration if
 * caching/background refetch becomes a requirement; the surface ({data,
 * loading, error, reload}) keeps call-sites unchanged either way.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let ignore = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then(
        (data) => !ignore && setState({ data, loading: false, error: null }),
        (error) =>
          !ignore && setState({ data: null, loading: false, error }),
      );
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
