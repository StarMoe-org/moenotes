import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedList, mergedValue, table, texts } from "@/lib/masterdata/build-core";
import type { ServerFaceted, ServerFacetedValue } from "@/lib/servers/facets";
import {
  helpCategoryTopics,
  normalizeHelp,
  type HelpCategoryViewModel,
  type HelpData,
  type HelpEntryViewModel,
  type HelpTopicViewModel,
  type RawCarouselHelp,
  type RawFaq,
  type RawHelpCategory,
  type RawHelpSubCategory,
  type RawLoadingTip,
} from "@/lib/help/data";

/*
 * Build-time selectors of the in-game help (/help, /help/:id): each server's help tables normalized on their own and
 * merged by id, like every other catalog (docs/servers.md). A table a server lacks or serves broken reads as empty.
 */

const empty = <T>() => ({ _allData: [] as T[] });

export function helpOn(server: GameServer, locale: AppLocale): Promise<HelpData> {
  return memo(`help:${server}:${locale}`, async () => {
    const [categories, subCategories, carousels, tips, faq, textTable] = await Promise.all([
      table<RawHelpCategory>("MasterHelpCategory.json", server).catch(empty<RawHelpCategory>),
      table<RawHelpSubCategory>("MasterHelpSubCategory.json", server).catch(empty<RawHelpSubCategory>),
      table<RawCarouselHelp>("MasterCarouselHelp.json", server).catch(empty<RawCarouselHelp>),
      table<RawLoadingTip>("MasterLoadingTips.json", server).catch(empty<RawLoadingTip>),
      table<RawFaq>("MasterFaq.json", server).catch(empty<RawFaq>),
      texts(server),
    ]);
    return normalizeHelp({
      categories: categories._allData,
      subCategories: subCategories._allData,
      carousels: carousels._allData,
      tips: tips._allData,
      faq: faq._allData,
      texts: textTable._allData,
    }, locale);
  });
}

export interface BuildHelp {
  categories: ServerFaceted<HelpCategoryViewModel>[];
  topics: ServerFaceted<HelpTopicViewModel>[];
  tips: ServerFaceted<HelpEntryViewModel>[];
  faq: ServerFaceted<HelpEntryViewModel>[];
}

export async function getBuildHelp(locale: AppLocale): Promise<BuildHelp> {
  const [categories, topics, tips, faq] = await Promise.all([
    mergedList(`help-categories:${locale}`, async (server) => (await helpOn(server, locale)).categories, (category) => category.id),
    getBuildHelpTopics(locale),
    mergedList(`help-tips:${locale}`, async (server) => (await helpOn(server, locale)).tips, (tip) => tip.id),
    mergedList(`help-faq:${locale}`, async (server) => (await helpOn(server, locale)).faq, (entry) => entry.id),
  ]);
  return { categories, topics, tips, faq };
}

/** Every manual topic of every server: the detail pages, their params and the site search. */
export function getBuildHelpTopics(locale: AppLocale): Promise<ServerFaceted<HelpTopicViewModel>[]> {
  return mergedList(`help-topics:${locale}`, async (server) => (await helpOn(server, locale)).topics, (topic) => topic.id);
}

export interface HelpTopicDetail {
  topic: HelpTopicViewModel;
  /** The topic's category with its carousel guides. */
  category: HelpCategoryViewModel | null;
  /** The category's topics in order, for previous / next. */
  siblings: Array<Pick<HelpTopicViewModel, "id" | "title">>;
}

/** One topic page: the topic as every server has it, with its category's guides and neighbours. */
export function getBuildHelpTopicDetail(locale: AppLocale, topicId: number): Promise<ServerFacetedValue<HelpTopicDetail> | null> {
  return mergedValue(`help-topic:${locale}:${topicId}`, async (server) => {
    const data = await helpOn(server, locale);
    const topic = data.topics.find((entry) => entry.id === topicId);
    if (!topic) return null;
    return {
      topic,
      category: data.categories.find((category) => category.id === topic.categoryId) ?? null,
      siblings: helpCategoryTopics(data, topic.categoryId).map(({ id, title }) => ({ id, title })),
    };
  });
}
