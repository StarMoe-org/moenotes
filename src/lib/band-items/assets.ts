import type { AppLocale } from "@/config/locales";
import { releaseFileUrl } from "@/lib/assets/release";
import type { BandItemViewModel } from "@/lib/band-items/data";

/**
 * MasterBandItem ships no image path — only `resourceGroupId`. The icon is published under the band and the band-item
 * id: `{language}/Band/{bandId}/BandItem/{itemId}/band_item/band_item.webp`, the `<key>/<basename>.webp` form every
 * image takes. It is a tall 270×516 illustration, not a square icon. Verified on all four catalogs (2026-10).
 */
export function getBandItemIconUrl(item: Pick<BandItemViewModel, "id" | "bandId">, locale: AppLocale): string {
  if (!item.bandId || !item.id) return "";
  return releaseFileUrl(`Band/${item.bandId}/BandItem/${item.id}/band_item`, "band_item.webp", locale);
}

/**
 * MasterBandItemSkillEffect stores the bonus in hundredths of a percent, like member-card skill effects: 10 is 0.1%
 * (level 1) and 500 is 5% (level 50). Returns the percentage number formatted for the locale, without the sign:
 * the templates and the level label put the `%` themselves.
 */
export function formatBandItemEffectPercent(value: number, locale: AppLocale): string {
  return (value / 100).toLocaleString(locale, { maximumFractionDigits: 2 });
}

/**
 * The effect description is a per-level masterdata template: it keeps a `{0}` value slot and `<style=…>` markup
 * (e.g. "All MyGO!!!!! parameters <style=color_positive>+{0}%Up</style>"). This fills the slot with the level's
 * percentage and strips the tags so it renders as plain copy.
 */
export function describeBandItemEffect(template: string, value: number, locale: AppLocale): string {
  return template.replace("{0}", formatBandItemEffectPercent(value, locale)).replace(/<[^>]+>/g, "");
}
