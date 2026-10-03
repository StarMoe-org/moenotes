import { GAME_SERVERS } from "@/config/game-api";
import { DEFAULT_ACCENT, defaultSettings } from "@/config/settings";
import { isAppLocale } from "@/config/locales";
import type { AppSettings } from "@/types/settings";

const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export const GAME_SERVER_SETTINGS = ["auto", ...GAME_SERVERS] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

/** `default` or a `#RRGGBB` color, upper-cased so a band's color compares equal however it was stored. */
export function normalizeAccentColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_ACCENT;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_ACCENT;
}

/** Settings from storage, every field checked; fields an older version did not store get their defaults. */
export function normalizeSettings(raw: unknown): AppSettings {
  const runtimeDefaults = defaultSettings;
  if (!raw || typeof raw !== "object") return runtimeDefaults;
  const value = raw as Partial<AppSettings>;
  return {
    locale: isAppLocale(value.locale) ? value.locale : runtimeDefaults.locale,
    colorScheme: isOneOf(value.colorScheme, COLOR_SCHEMES) ? value.colorScheme : runtimeDefaults.colorScheme,
    gameServer: isOneOf(value.gameServer, GAME_SERVER_SETTINGS) ? value.gameServer : runtimeDefaults.gameServer,
    accentColor: normalizeAccentColor(value.accentColor),
    density: isOneOf(value.density, DENSITIES) ? value.density : runtimeDefaults.density,
  };
}

export function parseSettingsJson(json: string | null): AppSettings {
  if (!json) return defaultSettings;
  try {
    return normalizeSettings(JSON.parse(json));
  } catch {
    return defaultSettings;
  }
}
