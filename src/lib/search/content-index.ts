import { DEFAULT_LOCALE } from "@/config/locales";
import {
  getBuildCards,
  getBuildContentSearchIndex,
  getBuildDegrees,
  getBuildEvents,
  getBuildGachas,
  getBuildMusic,
  getBuildStories,
  getBuildSupportCards,
  getBuildRewardEntries,
} from "@/lib/masterdata/build-data";
import type { ServerFaceted } from "@/lib/servers/facets";
import { isReleaseFacetPublicAcrossServers, isReleaseFacetReleasedAcrossServers, isStoryReleasedAcrossServers, parseStoryReleaseTime } from "@/lib/story/release";
import type { ContentSearchEntry } from "@/lib/search/content-entry";
import { CONTENT_SEARCH_SOURCES } from "@/lib/search/content-sources";

export type { ContentSearchEntry };

/**
 * Search entries checked against their regional release record. The record decides whether an undated entry is
 * permanent (titles, gachas and reward groups) or missing evidence (cards, songs, stories, events).
 */
const RELEASE_GATED_SEARCH_KINDS = new Set(["card", "support-card", "music", "story", "gacha", "event", "reward", "title"]);

/** Pure filter used by the public search API and its release regression tests. */
export function filterReleasedSearchEntries(
  entries: readonly ContentSearchEntry[],
  releasedByKey: ReadonlyMap<string, boolean>,
  now: number,
): ContentSearchEntry[] {
  return entries.filter((entry) => {
    if (RELEASE_GATED_SEARCH_KINDS.has(entry.kind)) return releasedByKey.get(entry.key) === true;
    // MasterData spells "no timestamp" as "" (and, in a few tables, as the literal "null").
    const startAt = entry.startAt?.trim() ?? "";
    if (startAt !== "" && startAt.toLowerCase() !== "null") {
      const release = parseStoryReleaseTime(startAt);
      return release !== null && Number.isFinite(now) && release <= now;
    }
    return true;
  });
}

/**
 * The build-time body of `/search-index.json`: every searchable content entity (cards, songs, characters, stories,
 * gacha, events, rewards, …, then each domain source of content-sources.ts). Static routes are not here — they ship in
 * the command palette's own bundle, localized by `t()`; the same entry on the client merges both sources. Titles
 * carry the MasterText row's five language cells so the browser localizes them; hrefs are locale-free detail paths.
 * Release-sensitive entries are removed here, before this public API serializes their titles and search text.
 */
export async function buildContentSearchIndex(): Promise<ContentSearchEntry[]> {
  const [builtIn, ...loaded] = await Promise.all([
    getBuildContentSearchIndex(),
    ...CONTENT_SEARCH_SOURCES.map((load) => load()),
  ]);
  const extra = loaded.flat();
  const now = Date.now();
  const released = new Map<string, boolean>();
  const record = <T extends { startAt: string }>(
    kind: string,
    entries: readonly ServerFaceted<T>[],
    id: (entry: ServerFaceted<T>) => string | number,
    isPublic: (entry: ServerFaceted<T>, now: number) => boolean = isReleaseFacetReleasedAcrossServers,
  ) => {
    for (const entry of entries) released.set(`${kind}:${id(entry)}`, isPublic(entry, now));
  };

  const [cards, supportCards, music, stories, gachas, events, rewards, titles] = await Promise.all([
    getBuildCards(DEFAULT_LOCALE),
    getBuildSupportCards(DEFAULT_LOCALE),
    getBuildMusic(DEFAULT_LOCALE),
    getBuildStories(DEFAULT_LOCALE),
    getBuildGachas(DEFAULT_LOCALE),
    getBuildEvents(DEFAULT_LOCALE),
    getBuildRewardEntries(DEFAULT_LOCALE),
    getBuildDegrees(DEFAULT_LOCALE),
  ]);
  record("card", cards, (entry) => entry.id);
  record("support-card", supportCards, (entry) => entry.id);
  record("music", music, (entry) => entry.id);
  // Friendship, after-live and tutorial episodes have no MasterData date; the story gate knows their categories.
  for (const story of stories) released.set(`story:${story.advId}`, isStoryReleasedAcrossServers(story, now));
  // Permanent titles, gachas and reward groups carry no date in any region; dated ones still wait for their release.
  record("gacha", gachas, (entry) => entry.id, isReleaseFacetPublicAcrossServers);
  record("event", events, (entry) => entry.id);
  record("reward", rewards, (entry) => entry.slug, isReleaseFacetPublicAcrossServers);
  record("title", titles, (entry) => entry.id, isReleaseFacetPublicAcrossServers);

  return filterReleasedSearchEntries([...builtIn!, ...extra], released, now);
}
