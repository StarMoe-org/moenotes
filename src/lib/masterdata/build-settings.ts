import type { AppLocale } from "@/config/locales";
import { getBuildCharacters } from "@/lib/masterdata/build-data";
import { memo } from "@/lib/masterdata/build-core";

/** A theme color the settings offer: a band's main color (MasterBand.mainColorCode). */
export interface ThemeBandColor {
  bandId: number;
  name: string;
  color: string;
}

/**
 * Every band of any server with a usable main color, in MasterBand order, for the settings' theme color choice.
 * Empty when the tables cannot be read (the choice then offers the default only).
 */
export function getBuildThemeBands(locale: AppLocale): Promise<ThemeBandColor[]> {
  return memo(`theme-bands:${locale}`, async () => {
    try {
      const { bands } = await getBuildCharacters(locale);
      return bands
        .filter((band) => /^#[0-9a-f]{6}$/i.test(band.color))
        .map((band) => ({ bandId: band.id, name: band.name, color: band.color.toUpperCase() }));
    } catch {
      return [];
    }
  });
}
