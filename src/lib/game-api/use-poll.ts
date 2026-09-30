import { useEffect, useState } from "react";

/**
 * A counter that goes up every `intervalMs` while the tab is visible, and right away when a hidden tab comes back
 * after a tick was due. Effects that fetch list it as a dependency. Null `intervalMs` stops it.
 */
export function usePollTick(intervalMs: number | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (intervalMs === null) return;
    let last = Date.now();
    let timer: number | undefined;
    const fire = () => {
      last = Date.now();
      setTick((value) => value + 1);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        fire();
        schedule();
      }, Math.max(0, last + intervalMs - Date.now()));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= intervalMs) fire();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
  return tick;
}
