import { useEffect, useState } from "react";
import { browserTimeZone } from "@/lib/schedule";

/**
 * The time zone schedules are shown in: the reader's. Null during SSR and the first client render, where they show
 * in their server's time, so statically built pages hydrate without a mismatch (like useNow).
 */
export function useDisplayTimeZone(): string | null {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    setZone(browserTimeZone() ?? null);
  }, []);
  return zone;
}
