import type { ContentSearchEntry } from "@/lib/search/content-entry";

/**
 * Searchable entities beyond the ones `getBuildContentSearchIndex` builds itself (cards, songs, characters, stories,
 * gacha, events, rewards, band items, exchange shops). Each domain contributes one loader from its own
 * `src/lib/search/sources/<domain>.ts`; a loader resolves to that domain's entries (hrefs locale-free, titles as
 * MasterText rows). `buildContentSearchIndex` appends their results after the built-in entries, in this order.
 *
 * One line per domain keeps the parallel feature work from editing a shared builder: add an import and one entry.
 */
export type ContentSearchSource = () => Promise<ContentSearchEntry[]>;

export const CONTENT_SEARCH_SOURCES: readonly ContentSearchSource[] = [];
