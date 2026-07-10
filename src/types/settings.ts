import type { AppLocale } from "@/config/locales";

export type ColorScheme = "system" | "light" | "dark";

export interface AppSettings {
  locale: AppLocale;
  colorScheme: ColorScheme;
}
