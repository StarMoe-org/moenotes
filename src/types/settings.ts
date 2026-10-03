import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";

export type ColorScheme = "system" | "light" | "dark";

/** `auto` follows the site language (defaultGameServer). */
export type GameServerSetting = "auto" | GameServer;

/** Spacing of list grids and cards. */
export type UiDensity = "comfortable" | "compact";

export interface AppSettings {
  locale: AppLocale;
  colorScheme: ColorScheme;
  /** The server content pages, music rankings and announcements show (docs/servers.md). */
  gameServer: GameServerSetting;
  /** `default` (the site's blue) or a band's main color, `#RRGGBB` (MasterBand.mainColorCode). */
  accentColor: string;
  density: UiDensity;
}
