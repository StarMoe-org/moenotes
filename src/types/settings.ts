import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";

export type ColorScheme = "system" | "light" | "dark";

/** `auto` follows the site language (defaultGameServer). */
export type GameServerSetting = "auto" | GameServer;

export interface AppSettings {
  locale: AppLocale;
  colorScheme: ColorScheme;
  /** The server music rankings and announcements open on. */
  gameServer: GameServerSetting;
}
