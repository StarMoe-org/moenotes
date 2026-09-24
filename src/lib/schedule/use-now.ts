import { useEffect, useState } from "react";

/**
 * Current time for schedule labels. Returns null during SSR and the first client render so
 * statically built pages never bake in the build time or cause a hydration mismatch.
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
