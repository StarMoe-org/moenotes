import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { getRoutePathById } from "@/lib/route/registry";
import { localizePath } from "@/i18n/routing";
import { assetLanguageOrder } from "@/lib/assets/release";
import type { StoryCategory, StoryEpisodeKind } from "@/lib/story/data";

/** The story player's data: the story site's index entries and the episodes the page knows from the build. */

/** The story languages of ournotes-player (the site's language codes, as the asset server's). */
export const STORY_LANGUAGES = ["ja", "en", "zh-Hant", "zh-Hans", "ko"] as const;
export type StoryLanguage = typeof STORY_LANGUAGES[number];

/** A `stories.json` entry (ournotes.stories/1) as the player page reads it. */
export interface StorySiteEntry {
  id: string;
  advId: number;
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
export type StorySection = "main" | "friendship" | "other";
export const STORY_SECTIONS: readonly StorySection[] = ["main", "friendship", "other"];

export function storySection(category: StoryCategory | "other"): StorySection {
  return category === "main" || category === "friendship" ? category : "other";
}

/** An episode as the picker lists it: the build's story data (localized at build time) of an advId. */
export interface StoryPickerStory {
  advId: number;
  category: StoryCategory;
  title: string;
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

/** An episode the story site has, with what the picker, the search and the header show. */
export interface StoryPlayerEntry extends Omit<StoryPickerStory, "category"> {
  site: StorySiteEntry;
  /** "other": an episode the build does not know (published after it), listed by the site's own titles. */
  category: StoryCategory | "other";
  section: StorySection;
}

/**
 * The site's episodes in the story pages' order (the build's episodes it has), then the ones the build does not know
 * yet in advId order, grouped under `otherGroupTitle`.
 */
export function buildStoryPlayerEntries(
  stories: readonly StoryPickerStory[],
  siteEntries: readonly StorySiteEntry[],
  locale: AppLocale,
  otherGroupTitle: string,
): StoryPlayerEntry[] {
  const byAdv = new Map(siteEntries.map((entry) => [entry.advId, entry]));
  const listed = new Set<number>();
  const known: StoryPlayerEntry[] = [];
  for (const story of stories) {
    const site = byAdv.get(story.advId);
    if (!site || listed.has(story.advId)) continue;
    listed.add(story.advId);
    const title = story.title || storySiteTitle(site, locale);
    known.push({ ...story, site, title, section: storySection(story.category), searchText: `${story.searchText} ${title} ${story.advId}`.toLocaleLowerCase() });
  }
  const unknown = siteEntries
    .filter((entry) => !listed.has(entry.advId))
    .sort((a, b) => a.advId - b.advId)
    .map((site): StoryPlayerEntry => {
      const title = storySiteTitle(site, locale);
      return {
        advId: site.advId, site, category: "other", section: "other", title, groupId: "site", groupTitle: otherGroupTitle, groupSubtitle: "",
        groupImage: "", episodeLabel: "", episodeKind: null, episodeNote: "", image: "", searchText: `${title} ${site.advId}`.toLocaleLowerCase(),
      };
    });
  return [...known, ...unknown];
}

export function getStoriesIndexUrl(): string {
  return `${assetConfig.storySite}/stories.json`;
}

/** A manifest path of the index, resolved against the site root. */
export function getStoryManifestUrl(manifest: string): string {
  return `${assetConfig.storySite}/${manifest.replace(/^\/+/, "")}`;
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
