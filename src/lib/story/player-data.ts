import { assetConfig } from "@/config/assets";
import { getStorySiteProxyApiRoot } from "@/config/routes";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { getRoutePathById } from "@/lib/route/registry";
import { localizePath } from "@/i18n/routing";
import { assetLanguageOrder, serverAssetUrl } from "@/lib/assets/release";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { StoryCategory, StoryEpisodeKind } from "@/lib/story/data";
import { SPOILER_REFERENCE_NOW } from "@/lib/settings/spoiler-reference";
import { isStoryReleasedAt } from "@/lib/story/release";

/** The story player's data: the story site's index entries and the episodes the page knows from the build. */

/** The story languages of ournotes-player (the site's language codes, as the asset server's). */
export const STORY_LANGUAGES = ["ja", "en", "zh-Hant", "zh-Hans", "ko"] as const;
export type StoryLanguage = typeof STORY_LANGUAGES[number];
export type StorySiteRegion = Extract<GameServer, "tw" | "jp">;

/**
 * The story sites' roots, in precedence order: the international site (TW/HK/MO, every text language), then JP (its own
 * site: JP Live2D model ids overlap the international ones). An episode on more than one plays from the first.
 */
export function getStorySiteRoots(): string[] {
  return [...new Set([assetConfig.storySite, assetConfig.storySiteJp].filter(Boolean))];
}

/** The configured roots with the game region whose release schedule governs each root. */
export function getStorySites(): Array<{ root: string; server: StorySiteRegion }> {
  return getStorySiteRoots().map((root) => ({
    root,
    server: root === assetConfig.storySiteJp && root !== assetConfig.storySite ? "jp" : "tw",
  }));
}

/** Browser-facing root: every manifest and resource goes through the same-origin release-gated proxy. */
export function getStorySiteProxyRoot(server: StorySiteRegion): string {
  return getStorySiteProxyApiRoot(server);
}

/** A `stories.json` entry (ournotes.stories/1) as the player page reads it. */
export interface StorySiteEntry {
  id: string;
  advId: number;
  /** Region whose in-game release controls access to this story site. */
  server: StorySiteRegion;
  /** Same-origin proxy root for the regional story site; manifests and every listed resource go through its gate. */
  root: string;
  /** The manifest path under the site root (`stories/<advId>.json`). */
  manifest: string;
  /** Episode titles by story language. */
  titles: Partial<Record<string, string>>;
  languages: string[];
  /** The default language of the story. */
  language: string;
  /** 0: the story screen; 1: Overlay (home spot and post-live talks in their host screen). */
  playbackMode: number;
  audio: boolean;
  /** Download sizes in bytes: the files every language loads, and each language's own. */
  size?: { common: number; languages: Partial<Record<string, number>> };
}

/** The story pages' three lists: main story, bond stories and the other talks (post-live, home spot, tutorial). */
export type StorySection = "main" | "event" | "friendship" | "other";
export const STORY_SECTIONS: readonly StorySection[] = ["main", "event", "friendship", "other"];

export function storySection(category: StoryCategory | "other"): StorySection {
  return category === "main" || category === "event" || category === "friendship" ? category : "other";
}

/** An episode as the picker lists it: the build's story data (localized at build time) of an advId. */
export interface StoryPickerStory {
  advId: number;
  assetServer: GameServer;
  category: StoryCategory;
  title: string;
  /** The regional MasterData catalogs that contain this story. */
  servers: GameServer[];
  /** Each region's own official in-game release date; cloud availability is never used as a release signal. */
  releaseDates: Partial<Record<GameServer, string>>;
  /** The group the episode belongs to (a chapter, a character's bond, a spot) and its name. */
  groupId: string;
  groupTitle: string;
  /** The band of a chapter; empty for the other groups. */
  groupSubtitle: string;
  /** A chapter's banner (asset path without extension); empty for the other groups. */
  groupImage: string;
  /** "EPISODE 3" and the like; empty when the episode has no number. */
  episodeLabel: string;
  episodeKind: StoryEpisodeKind | null;
  /** The character an another episode follows; empty otherwise. */
  episodeNote: string;
  /** The episode's banner (asset path without extension, text-bearing: per locale); empty when it has none. */
  image: string;
  searchText: string;
}

/** A locally verified episode the cloud story site has, with what the picker, search and header show. */
export interface StoryPlayerEntry extends Omit<StoryPickerStory, "category"> {
  site: StorySiteEntry;
  /** "other" is retained in the type for old consumers, but unknown cloud-only rows are never constructed. */
  category: StoryCategory | "other";
  /** The release date for the selected cloud site's region. */
  startAt: string;
  section: StorySection;
}

/**
 * Only joins cloud entries to the locally maintained, region-faceted game catalog. A story which exists only in the
 * cloud has no trusted in-game release date, so it is omitted rather than treated as public.
 */
export function buildStoryPlayerEntries(
  stories: readonly StoryPickerStory[],
  siteEntries: readonly StorySiteEntry[],
): StoryPlayerEntry[] {
  const listed = new Set<number>();
  const result: StoryPlayerEntry[] = [];
  for (const story of stories) {
    if (listed.has(story.advId)) continue;
    const site = siteEntries.find((entry) => entry.advId === story.advId && story.servers.includes(entry.server));
    if (!site) continue;
    const startAt = story.releaseDates[site.server];
    // Missing region data is not proof of a release, even if a public storage index has the episode.
    if (startAt === undefined) continue;
    listed.add(story.advId);
    const title = story.title || `ADV ${story.advId}`;
    const assetServer = site.server === "jp" ? "jp" : story.assetServer;
    result.push({
      ...story,
      assetServer,
      site,
      startAt,
      title,
      section: storySection(story.category),
      searchText: `${story.searchText} ${title} ${story.advId}`.toLocaleLowerCase(),
    });
  }
  return result;
}

/** A cloud-backed episode is playable only when every known regional version is officially released. */
export function isStoryPlayerEntryReleased(entry: StoryPlayerEntry, now?: number | null): boolean {
  if (entry.servers.length === 0 || !entry.servers.includes(entry.site.server)) return false;
  return entry.servers.every((server) => {
    const startAt = entry.releaseDates[server];
    return isStoryReleasedAt(startAt, now ?? SPOILER_REFERENCE_NOW);
  });
}

/** A query-string id is playable only if it resolves to a locally verified, regionally released index entry. */
export function isStoryPlayerRequestReleased(advId: number, entries: readonly StoryPlayerEntry[], now?: number | null): boolean {
  const entry = entries.find((candidate) => candidate.advId === advId);
  return Boolean(entry && isStoryPlayerEntryReleased(entry, now));
}

export function getStoryPlayerArtworkUrl(path: string, locale: AppLocale, server: GameServer): string {
  return serverAssetUrl(getImageAssetUrl(path, locale), server);
}

export function getStoriesIndexUrl(root: string): string {
  return `${root}/stories.json`;
}

/** A manifest path of a site's index, resolved against that site's root. */
export function getStoryManifestUrl(root: string, manifest: string): string {
  return `${root}/${manifest.replace(/^\/+/, "")}`;
}

/**
 * The sites' indexes as one list, in site order: an advId a site before lists is left out of the later ones (the
 * international site has every text language; JP only Japanese).
 */
export function mergeStorySiteEntries(sites: readonly (readonly StorySiteEntry[])[]): StorySiteEntry[] {
  const seen = new Set<number>();
  const merged: StorySiteEntry[] = [];
  for (const entries of sites) {
    for (const entry of entries) {
      if (seen.has(entry.advId)) continue;
      seen.add(entry.advId);
      merged.push(entry);
    }
  }
  return merged;
}

export function getStoryPlayerHref(locale: AppLocale, advId?: number): string {
  const path = localizePath(getRoutePathById("story-player"), locale);
  return advId !== undefined ? `${path}?${new URLSearchParams({ story: String(advId) })}` : path;
}

export function parseStoryPlayerSearch(search: string): number | null {
  const id = new URLSearchParams(search).get("story")?.trim() ?? "";
  return /^\d{1,9}$/.test(id) ? Number(id) : null;
}

function isStoryLanguage(value: string): value is StoryLanguage {
  return (STORY_LANGUAGES as readonly string[]).includes(value);
}

/** The language a story starts in: the first of the locale's text languages the story has (masterdata's order). */
export function storyLanguageFor(locale: AppLocale, entry: StorySiteEntry, preferred?: string | null): StoryLanguage {
  const available = entry.languages.filter(isStoryLanguage);
  if (preferred && isStoryLanguage(preferred) && available.includes(preferred)) return preferred;
  return assetLanguageOrder(locale).filter(isStoryLanguage).find((language) => available.includes(language))
    ?? available[0]
    ?? (isStoryLanguage(entry.language) ? entry.language : "ja");
}

/** The episode title of a site entry in the locale's text language order. */
export function storySiteTitle(entry: StorySiteEntry, locale: AppLocale): string {
  for (const language of assetLanguageOrder(locale)) {
    const title = entry.titles[language]?.trim();
    if (title) return title;
  }
  return Object.values(entry.titles).find((title) => title?.trim()) ?? "";
}

/** Bytes a story downloads in one language (0 when the index has no sizes). */
export function storyDownloadBytes(entry: StorySiteEntry, language: string): number {
  if (!entry.size) return 0;
  return entry.size.common + (entry.size.languages[language] ?? 0);
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1048576).toFixed(bytes >= 100 * 1048576 ? 0 : 1)} MB`;
}
