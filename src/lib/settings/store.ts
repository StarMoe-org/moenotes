import { SETTINGS_CHANGED_EVENT, SETTINGS_STORAGE_KEY, defaultSettings } from "@/config/settings";
import { applySettingsToDocument } from "@/lib/settings/apply-theme";
import { parseSettingsJson } from "@/lib/settings/schema";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import type { AppSettings } from "@/types/settings";

export type SettingsListener = (settings: AppSettings) => void;

let currentSettings: AppSettings = parseSettingsJson(safeGetLocalStorage(SETTINGS_STORAGE_KEY));
const listeners = new Set<SettingsListener>();

export function getSettings(): AppSettings {
  return currentSettings;
}

export function setSettings(next: Partial<AppSettings> | ((settings: AppSettings) => Partial<AppSettings>)): AppSettings {
  const patch = typeof next === "function" ? next(currentSettings) : next;
  currentSettings = { ...currentSettings, ...patch };
  persistSettings(currentSettings);
  emitSettingsChanged(currentSettings);
  return currentSettings;
}

export function resetSettings(): AppSettings {
  currentSettings = parseSettingsJson(JSON.stringify(defaultSettings));
  persistSettings(currentSettings);
  emitSettingsChanged(currentSettings);
  return currentSettings;
}

export function subscribeSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  listener(currentSettings);
  return () => listeners.delete(listener);
}

function persistSettings(settings: AppSettings): void {
  safeSetLocalStorage(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function emitSettingsChanged(settings: AppSettings): void {
  applySettingsToDocument(settings);
  for (const listener of listeners) listener(settings);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, { detail: settings }));
  }
}

if (typeof window !== "undefined") {
  applySettingsToDocument(currentSettings);

  window.addEventListener("storage", (event) => {
    if (event.key !== SETTINGS_STORAGE_KEY) return;
    currentSettings = parseSettingsJson(event.newValue);
    emitSettingsChanged(currentSettings);
  });

  const colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const syncSystemPreferences = () => {
    currentSettings = parseSettingsJson(safeGetLocalStorage(SETTINGS_STORAGE_KEY));
    emitSettingsChanged(currentSettings);
  };
  colorSchemeMedia.addEventListener("change", syncSystemPreferences);
}
