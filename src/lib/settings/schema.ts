import { defaultSettings } from "@/config/settings";
import { isAppLocale } from "@/config/locales";
import type { AppSettings } from "@/types/settings";

const COLOR_SCHEMES = ["system", "light", "dark"] as const;

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export function normalizeSettings(raw: unknown): AppSettings {
  const runtimeDefaults = defaultSettings;
  if (!raw || typeof raw !== "object") return runtimeDefaults;
  const value = raw as Partial<AppSettings>;
  return {
    locale: isAppLocale(value.locale) ? value.locale : runtimeDefaults.locale,
    colorScheme: isOneOf(value.colorScheme, COLOR_SCHEMES) ? value.colorScheme : runtimeDefaults.colorScheme,
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
