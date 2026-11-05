import type { StoryCategory } from "@/lib/story/data";

export type StorySection = "main" | "event" | "friendship" | "birthday" | "other";

/** Sections browsed chapter by chapter; the others list their episodes directly. */
export const CHAPTER_SECTIONS = ["main", "event"] as const;
export type StoryChapterSection = (typeof CHAPTER_SECTIONS)[number];

/** Whether a section has chapter pages (`/story/:category/:id`). */
export function isChapterSection(value: string | undefined): value is StoryChapterSection {
  return value !== undefined && (CHAPTER_SECTIONS as readonly string[]).includes(value);
}

export const OTHER_CATEGORIES: readonly StoryCategory[] = ["live-result", "home", "tutorial"];

/** Whether a story belongs to a story page's list. */
export function inStorySection(section: StorySection, story: { category: StoryCategory }): boolean {
  return section === "other" ? OTHER_CATEGORIES.includes(story.category) : story.category === section;
}

export function storyCategoryKey(category: StoryCategory | "other"): string {
  if (category === "live-result") return "story.categories.liveResult";
  return `story.categories.${category}`;
}
