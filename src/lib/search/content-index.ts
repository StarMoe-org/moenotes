import { getBuildContentSearchIndex } from "@/lib/masterdata/build-data";
import type { ContentSearchEntry } from "@/lib/search/content-entry";
import { CONTENT_SEARCH_SOURCES } from "@/lib/search/content-sources";

export type { ContentSearchEntry };

/**
 * The build-time body of `/search-index.json`: every searchable content entity (cards, songs, characters, stories,
 * gacha, events, rewards, …, then each domain source of content-sources.ts). Static routes are not here — they ship in
 * the command palette's own bundle, localized by `t()`; the same entry on the client merges both sources. Titles
 * carry the MasterText row's five language cells so the browser localizes them; hrefs are locale-free detail paths.
 */
export async function buildContentSearchIndex(): Promise<ContentSearchEntry[]> {
  const [builtIn, ...extra] = await Promise.all([getBuildContentSearchIndex(), ...CONTENT_SEARCH_SOURCES.map((load) => load())]);
  return [...builtIn!, ...extra.flat()];
}
