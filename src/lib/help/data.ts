import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import { localizeMasterText, type MasterTextRow } from "@/lib/masterdata/localize-text";
import { parseRichText, type StoryTextRun } from "@/lib/story/rich-text";

/*
 * The in-game help (the manual): manual categories with their topics, the carousel guides shown on a screen's first visit,
 * the loading-screen tips and the FAQ. Every text column holds a MasterText id.
 */

export interface RawHelpCategory {
  id: number;
  titleTextId: string;
  order: number;
  startAt?: string;
  endAt?: string;
}

export interface RawHelpSubCategory {
  id: number;
  helpCategoryId: number;
  titleTextId: string;
  descriptionTextId: string;
  order: number;
  startAt?: string;
  endAt?: string;
}

export interface RawCarouselHelp {
  id: number;
  helpCategoryId: number;
  displayName: string;
  titleTextId: string;
  suffix?: string;
  pageCount: number;
  startAt?: string;
  endAt?: string;
}

export interface RawLoadingTip {
  id: number;
  title: string;
  description: string;
  startAt?: string;
  endAt?: string;
}

export interface RawFaq {
  id: number;
  title: string;
  detail: string;
  startAt?: string;
  endAt?: string;
}

/** Help copy: the text without markup plus, when it carries TextMeshPro styling, the styled runs. */
export interface HelpText {
  text: string;
  runs?: StoryTextRun[];
}

export interface HelpCarouselViewModel {
  id: number;
  categoryId: number;
  title: string;
  /** The guide's pages, in order. */
  imageUrls: string[];
}

export interface HelpTopicViewModel {
  id: number;
  categoryId: number;
  categoryTitle: string;
  title: string;
  body: HelpText;
  order: number;
  startAt: string;
  endAt: string;
  searchText: string;
}

export interface HelpCategoryViewModel {
  id: number;
  title: string;
  order: number;
  topicIds: number[];
  carousels: HelpCarouselViewModel[];
}

export interface HelpEntryViewModel {
  id: number;
  title: string;
  body: HelpText;
  startAt: string;
  endAt: string;
  searchText: string;
}

export interface HelpData {
  categories: HelpCategoryViewModel[];
  topics: HelpTopicViewModel[];
  tips: HelpEntryViewModel[];
  faq: HelpEntryViewModel[];
}

export interface HelpMasterData {
  categories: RawHelpCategory[];
  subCategories: RawHelpSubCategory[];
  carousels: RawCarouselHelp[];
  tips: RawLoadingTip[];
  faq: RawFaq[];
  texts: MasterTextRow[];
}

/** Category titles are written as "【Home】" / "[Home]"; the page frames them itself. */
export function stripHelpBrackets(title: string): string {
  const match = title.trim().match(/^[【[［](.*)[】\]］]$/);
  return (match?.[1] ?? title).trim();
}

/**
 * The image keys of a carousel guide's pages: `Image/CarouselHelp/Help_<displayName><suffix>_<page>` (the suffix, when
 * set, is appended to the name as is: ExchangeItemList + "12" → Help_ExchangeItemList12_0).
 */
export function carouselImagePaths(carousel: Pick<RawCarouselHelp, "displayName" | "suffix" | "pageCount">): string[] {
  const name = `Help_${carousel.displayName}${carousel.suffix ?? ""}`;
  const count = Math.max(0, Math.floor(carousel.pageCount || 0));
  return Array.from({ length: count }, (_, page) => `Image/CarouselHelp/${name}_${page}`);
}

function toHelpText(raw: string): HelpText {
  const parsed = parseRichText(raw.replace(/\r\n?/g, "\n"));
  return parsed.runs ? { text: parsed.text, runs: parsed.runs } : { text: parsed.text };
}

const byOrder = <T extends { order: number; id: number }>(a: T, b: T) => a.order - b.order || a.id - b.id;

export function normalizeHelp(data: HelpMasterData, locale: AppLocale): HelpData {
  const textMap = new Map(data.texts.map((row) => [row.id, row]));
  const text = (id: string) => localizeMasterText(textMap.get(id), locale);

  const categoryRows = [...data.categories].sort(byOrder);
  const categoryTitle = new Map(categoryRows.map((row) => [row.id, stripHelpBrackets(text(row.titleTextId)) || `#${row.id}`]));

  const topics = data.subCategories
    .filter((row) => categoryTitle.has(row.helpCategoryId))
    .sort((a, b) => categoryRows.findIndex((row) => row.id === a.helpCategoryId) - categoryRows.findIndex((row) => row.id === b.helpCategoryId) || byOrder(a, b))
    .map((row): HelpTopicViewModel => {
      const title = text(row.titleTextId) || `#${row.id}`;
      const body = toHelpText(text(row.descriptionTextId));
      const category = categoryTitle.get(row.helpCategoryId) ?? "";
      return {
        id: row.id,
        categoryId: row.helpCategoryId,
        categoryTitle: category,
        title,
        body,
        order: row.order,
        startAt: row.startAt ?? "",
        endAt: row.endAt ?? "",
        searchText: [title, category, body.text, row.id].join(" ").toLocaleLowerCase(),
      };
    });

  const carousels = data.carousels
    .filter((row) => row.pageCount > 0 && row.displayName)
    .sort((a, b) => a.id - b.id)
    .map((row): HelpCarouselViewModel => ({
      id: row.id,
      categoryId: row.helpCategoryId,
      title: text(row.titleTextId) || row.displayName,
      imageUrls: carouselImagePaths(row).map((path) => getImageAssetUrl(path, locale)),
    }));

  const categories = categoryRows.map((row): HelpCategoryViewModel => ({
    id: row.id,
    title: categoryTitle.get(row.id) ?? `#${row.id}`,
    order: row.order,
    topicIds: topics.filter((topic) => topic.categoryId === row.id).map((topic) => topic.id),
    carousels: carousels.filter((carousel) => carousel.categoryId === row.id),
  })).filter((category) => category.topicIds.length > 0 || category.carousels.length > 0);

  const entry = (row: { id: number; startAt?: string; endAt?: string }, titleId: string, bodyId: string): HelpEntryViewModel => {
    const title = text(titleId) || `#${row.id}`;
    const body = toHelpText(text(bodyId));
    return { id: row.id, title, body, startAt: row.startAt ?? "", endAt: row.endAt ?? "", searchText: [title, body.text].join(" ").toLocaleLowerCase() };
  };

  return {
    categories,
    topics,
    tips: [...data.tips].sort((a, b) => a.id - b.id).map((row) => entry(row, row.title, row.description)).filter((tip) => tip.body.text || tip.title),
    faq: [...data.faq].sort((a, b) => a.id - b.id).map((row) => entry(row, row.title, row.detail)),
  };
}

/** The topics of one category, in their in-game order (for previous / next on a topic page). */
export function helpCategoryTopics(data: Pick<HelpData, "topics">, categoryId: number): HelpTopicViewModel[] {
  return data.topics.filter((topic) => topic.categoryId === categoryId);
}
