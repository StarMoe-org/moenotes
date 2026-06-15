import type { AppSettings } from "@/types/settings";
import { storageKeys } from "./storage";

export const SETTINGS_STORAGE_KEY = storageKeys.settings;
export const SETTINGS_CHANGED_EVENT = "moenotes:settings-changed";

export const defaultSettings: AppSettings = {
  locale: "zh-CN",
  colorScheme: "system",
  animationLevel: "full",
  sidebarMode: "auto",
  assetSource: "main",
  masterdataSource: "official",
  enableScrollMemory: true,
  enableCommandPalette: true,
  enableBreadcrumbDropdown: true,
};
