import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { getRoutePathById } from "@/lib/route/registry";
import { localizePath } from "@/i18n/routing";
import { assetLanguageOrder } from "@/lib/assets/release";
import type { StoryCategory } from "@/lib/story/data";

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

/** An episode as the picker lists it: the build's story data (localized at build time) of an advId. */
export interface StoryPickerStory {
  advId: number;
  category: StoryCategory;
  title: string;
  /** The group the episode belongs to (a chapter, a character's bond, a spot) and its name. */
  groupId: string;
  groupTitle: string;
  /** "EPISODE 3" and the like; empty when the episode has no number. */
  episodeLabel: string;
  bandId: number;
  searchText: string;
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

/** The labels' language of the player's control bar: the locale's first text language. */
export function storyControlsLanguage(locale: AppLocale): StoryLanguage {
  return assetLanguageOrder(locale).find(isStoryLanguage) ?? "en";
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
