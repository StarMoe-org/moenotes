import type { StoryCategory } from "@/lib/story/data";

export type StorySection = "main" | "event" | "friendship" | "birthday" | "other";

export const OTHER_CATEGORIES: readonly StoryCategory[] = ["live-result", "home", "tutorial"];

/** Whether a story belongs to a story page's list. */
export function inStorySection(section: StorySection, story: { category: StoryCategory }): boolean {
  return section === "other" ? OTHER_CATEGORIES.includes(story.category) : story.category === section;
}

export function storyCategoryKey(category: StoryCategory | "other"): string {
  if (category === "live-result") return "story.categories.liveResult";
  return `story.categories.${category}`;
}
