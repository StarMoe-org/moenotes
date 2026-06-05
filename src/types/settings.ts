import type { AppLocale } from "@/config/locales";

export type ColorScheme = "system" | "light" | "dark";
export type AnimationLevel = "full" | "reduced" | "off";
export type SidebarMode = "auto" | "expanded" | "collapsed";
export type AssetSource = "main" | "backup";
export type MasterdataSource = "official" | "mirror";

export interface AppSettings {
  locale: AppLocale;
  colorScheme: ColorScheme;
  animationLevel: AnimationLevel;
  sidebarMode: SidebarMode;
  assetSource: AssetSource;
  masterdataSource: MasterdataSource;
  enableScrollMemory: boolean;
  enableCommandPalette: boolean;
  enableBreadcrumbDropdown: boolean;
}
