import type { BandItemViewModel } from "@/lib/band-items/data";

/**
 * MasterBandItem ships no image path — only `resourceGroupId`. The published icon key is not yet known,
 * so this returns "" until the asset export is confirmed; BandItemsExplorer already falls back to the item's
 * name when the image fails to load, the same way ItemCard does.
 */
export function getBandItemIconUrl(_item: Pick<BandItemViewModel, "imageUrl" | "resourceGroupId">): string {
  return "";
}

/**
 * The effect description is a per-level masterdata template: it keeps a `{0}` value slot and `<style=…>` markup
 * (e.g. "All MyGO!!!!! parameters <style=color_positive>+{0}%Up</style>"). This fills the slot for a level and
 * strips the tags so it renders as plain copy.
 */
export function describeBandItemEffect(template: string, value: number): string {
  return template.replace("{0}", String(value)).replace(/<[^>]+>/g, "");
}
