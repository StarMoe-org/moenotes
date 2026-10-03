import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/**
 * View choices of the 2D chart sheet (the 3D previewer's choices are Live options, kept by chart-live-settings.ts).
 */
export interface ChartViewPrefs {
  mirror: boolean;
}

const KEY = "moenotes:chart-view";
const DEFAULTS: ChartViewPrefs = { mirror: false };

export function loadChartViewPrefs(): ChartViewPrefs {
  const raw = safeGetLocalStorage(KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const mirror = (parsed as { mirror?: unknown }).mirror;
    return { mirror: mirror === true };
  } catch {
    return DEFAULTS;
  }
}

export function saveChartViewPrefs(patch: Partial<ChartViewPrefs>): void {
  safeSetLocalStorage(KEY, JSON.stringify({ ...loadChartViewPrefs(), ...patch }));
}
