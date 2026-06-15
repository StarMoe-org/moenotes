import { defaultSettings } from "@/config/settings";
import { isAppLocale } from "@/config/locales";
import type { AnimationLevel, AppSettings } from "@/types/settings";

const COLOR_SCHEMES = ["system", "light", "dark"] as const;
const ANIMATION_LEVELS = ["full", "reduced", "off"] as const;
const SIDEBAR_MODES = ["auto", "expanded", "collapsed"] as const;
const ASSET_SOURCES = ["main", "backup"] as const;
const MASTERDATA_SOURCES = ["official", "mirror"] as const;

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export function getRuntimeDefaultAnimationLevel(): AnimationLevel {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduced";
  return defaultSettings.animationLevel;
}

export function getRuntimeDefaultSettings(): AppSettings {
  return {
    ...defaultSettings,
    animationLevel: getRuntimeDefaultAnimationLevel(),
  };
}

export function normalizeSettings(raw: unknown): AppSettings {
  const runtimeDefaults = getRuntimeDefaultSettings();
  if (!raw || typeof raw !== "object") return runtimeDefaults;
  const value = raw as Partial<AppSettings>;
  return {
    locale: isAppLocale(value.locale) ? value.locale : runtimeDefaults.locale,
    colorScheme: isOneOf(value.colorScheme, COLOR_SCHEMES) ? value.colorScheme : runtimeDefaults.colorScheme,
    animationLevel: isOneOf(value.animationLevel, ANIMATION_LEVELS) ? value.animationLevel : runtimeDefaults.animationLevel,
    sidebarMode: isOneOf(value.sidebarMode, SIDEBAR_MODES) ? value.sidebarMode : runtimeDefaults.sidebarMode,
    assetSource: isOneOf(value.assetSource, ASSET_SOURCES) ? value.assetSource : runtimeDefaults.assetSource,
    masterdataSource: isOneOf(value.masterdataSource, MASTERDATA_SOURCES) ? value.masterdataSource : runtimeDefaults.masterdataSource,
    enableScrollMemory: typeof value.enableScrollMemory === "boolean" ? value.enableScrollMemory : runtimeDefaults.enableScrollMemory,
    enableCommandPalette: typeof value.enableCommandPalette === "boolean" ? value.enableCommandPalette : runtimeDefaults.enableCommandPalette,
    enableBreadcrumbDropdown: typeof value.enableBreadcrumbDropdown === "boolean" ? value.enableBreadcrumbDropdown : runtimeDefaults.enableBreadcrumbDropdown,
  };
}

export function parseSettingsJson(json: string | null): AppSettings {
  if (!json) return getRuntimeDefaultSettings();
  try {
    return normalizeSettings(JSON.parse(json));
  } catch {
    return getRuntimeDefaultSettings();
  }
}
