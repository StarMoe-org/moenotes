import type { ChartPlayer, LiveSettingsInput, LiveSettingValue } from "ournotes-player";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/**
 * The game's Live options (note speed, timings, lane display, volumes, …) set in the 3D previewer, by option name.
 * Only values away from the defaults are kept, so every chart takes its own defaults for the rest.
 */
export function loadLiveSettings(): LiveSettingsInput {
  const raw = safeGetLocalStorage(storageKeys.chartLiveSettings);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isSettingValue(value)));
  } catch {
    return {};
  }
}

/** Records the options a `settingschange` names; one set back to its default is forgotten. */
export function saveLiveSettings(player: ChartPlayer, changed: readonly string[]): void {
  const settings = player.settings;
  if (!settings) return;
  const defaults = new Map(player.optionItems().map((item) => [item.name, item.default]));
  const saved = loadLiveSettings();
  for (const name of changed) {
    if (settings[name] === defaults.get(name)) delete saved[name];
    else saved[name] = settings[name];
  }
  if (Object.keys(saved).length) safeSetLocalStorage(storageKeys.chartLiveSettings, JSON.stringify(saved));
  else safeRemoveLocalStorage(storageKeys.chartLiveSettings);
}

/** The saved options this chart offers, with values it takes (for a chart whose data lacks some saved choice). */
export function offeredLiveSettings(player: ChartPlayer, saved: LiveSettingsInput): LiveSettingsInput {
  const offered: LiveSettingsInput = {};
  for (const item of player.optionItems()) {
    const value = saved[item.name];
    if (value === undefined || !item.offered || typeof value !== typeof item.default) continue;
    if (item.values && !item.values.includes(value)) continue;
    if (item.range && typeof value === "number" && (value < item.range[0] || value > item.range[1])) continue;
    offered[item.name] = value;
  }
  return offered;
}

function isSettingValue(value: unknown): value is LiveSettingValue {
  return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}
