import { getBuildContentSearchIndex, type ContentSearchEntry } from "@/lib/masterdata/build-data";

export type { ContentSearchEntry };

/**
 * The build-time body of `/search-index.json`: every searchable content entity (cards, songs, characters, stories,
 * gacha, events, rewards). Static routes are not here — they ship in the command palette's own bundle, localized by
 * `t()`; the same entry on the client merges both sources. Titles carry the MasterText row's five language cells so
 * the browser localizes them; hrefs are locale-free detail paths.
 */
export function buildContentSearchIndex(): Promise<ContentSearchEntry[]> {
  return getBuildContentSearchIndex();
}
