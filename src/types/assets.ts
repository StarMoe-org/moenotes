import type { AppLocale } from "@/config/locales";

export type AssetKind = "image" | "audio" | "json" | "raw";

export interface AssetRequest {
  type?: AssetKind;
  path: string;
  /** Selects the asset language for localized artwork; defaults to the product default locale. */
  locale?: AppLocale;
}
