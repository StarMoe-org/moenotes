import type { AppSettings } from "@/types/settings";
import { storageKeys } from "./storage";

export const SETTINGS_STORAGE_KEY = storageKeys.settings;
export const SETTINGS_CHANGED_EVENT = "moenotes:settings-changed";
/** The chosen accent's light and dark palettes, cached for the head's bootstrap script (src/lib/settings/accent.ts). */
export const ACCENT_PALETTE_STORAGE_KEY = storageKeys.accentPalette;
export const DEFAULT_ACCENT = "default";

export const defaultSettings: AppSettings = {
  locale: "zh-CN",
  colorScheme: "system",
  gameServer: "auto",
  accentColor: DEFAULT_ACCENT,
  density: "comfortable",
};
