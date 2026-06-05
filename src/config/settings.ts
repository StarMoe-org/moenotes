import type { AppSettings } from "@/types/settings";

export const SETTINGS_STORAGE_KEY = "moenotes:settings";
export const SETTINGS_CHANGED_EVENT = "moenotes:settings-changed";

export const defaultSettings: AppSettings = {
  locale: "zh-CN",
  colorScheme: "system",
  animationLevel: "reduced",
  sidebarMode: "auto",
  assetSource: "main",
  masterdataSource: "official",
  enableScrollMemory: true,
  enableCommandPalette: true,
  enableBreadcrumbDropdown: true,
};
