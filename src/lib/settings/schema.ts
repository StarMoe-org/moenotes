import { defaultSettings } from "@/config/settings";
import { isAppLocale } from "@/config/locales";
import type { AppSettings } from "@/types/settings";

const COLOR_SCHEMES = ["system", "light", "dark"] as const;
const ANIMATION_LEVELS = ["full", "reduced", "off"] as const;
const SIDEBAR_MODES = ["auto", "expanded", "collapsed"] as const;
const ASSET_SOURCES = ["main", "backup"] as const;
const MASTERDATA_SOURCES = ["official", "mirror"] as const;

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export function normalizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return defaultSettings;
  const value = raw as Partial<AppSettings>;
  return {
    locale: isAppLocale(value.locale) ? value.locale : defaultSettings.locale,
    colorScheme: isOneOf(value.colorScheme, COLOR_SCHEMES) ? value.colorScheme : defaultSettings.colorScheme,
    animationLevel: isOneOf(value.animationLevel, ANIMATION_LEVELS) ? value.animationLevel : defaultSettings.animationLevel,
    sidebarMode: isOneOf(value.sidebarMode, SIDEBAR_MODES) ? value.sidebarMode : defaultSettings.sidebarMode,
    assetSource: isOneOf(value.assetSource, ASSET_SOURCES) ? value.assetSource : defaultSettings.assetSource,
    masterdataSource: isOneOf(value.masterdataSource, MASTERDATA_SOURCES) ? value.masterdataSource : defaultSettings.masterdataSource,
    enableScrollMemory: typeof value.enableScrollMemory === "boolean" ? value.enableScrollMemory : defaultSettings.enableScrollMemory,
    enableCommandPalette: typeof value.enableCommandPalette === "boolean" ? value.enableCommandPalette : defaultSettings.enableCommandPalette,
    enableBreadcrumbDropdown: typeof value.enableBreadcrumbDropdown === "boolean" ? value.enableBreadcrumbDropdown : defaultSettings.enableBreadcrumbDropdown,
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
