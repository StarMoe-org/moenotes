"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, { FilterButton, FilterSection, FilterToggle } from "@/components/shared/BaseFilters";
import ServerScope from "@/components/shared/ServerScope";
import { HelpCarousels, HelpRichText } from "@/components/help/HelpParts";
import ProgressionReferenceView, { EXP_SOURCES, type ExpSource } from "@/components/help/ProgressionReferenceView";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import type { HelpCategoryViewModel, HelpEntryViewModel, HelpTopicViewModel } from "@/lib/help/data";
import { helpTopicPath } from "@/lib/help/paths";
import type { ProgressionReferenceViewModel } from "@/lib/progression/data";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";

const TABS = ["manual", "tips", "faq", "progression"] as const;
type HelpTab = typeof TABS[number];

interface Props {
  locale: AppLocale;
  servers: GameServer[];
  categories: ServerFaceted<HelpCategoryViewModel>[];
  topics: ServerFaceted<HelpTopicViewModel>[];
  tips: ServerFaceted<HelpEntryViewModel>[];
  faq: ServerFaceted<HelpEntryViewModel>[];
  progressionByServer?: Partial<Record<GameServer, ProgressionReferenceViewModel>>;
}

const isTab = (value: string | null): value is HelpTab => value !== null && (TABS as readonly string[]).includes(value);

/**
 * The in-game help: the manual (categories on the left, their topics and carousel guides on the right; a topic opens
 * its own page), the loading-screen tips, and the FAQ (expandable). The tab and the manual's category live in the URL
 * (`?tab=`, `?category=`). Content follows the page's server.
 */
export default function HelpExplorer({
  locale,
  servers,
  categories: allCategories,
  topics: allTopics,
  tips: allTips,
  faq: allFaq,
  progressionByServer,
}: Props) {
  const { server, pickServer, items: categories } = useServerList(locale, servers, allCategories);
  const topics = useServerList(locale, servers, allTopics).items;
  const tips = useServerList(locale, servers, allTips).items;
  const faq = useServerList(locale, servers, allFaq).items;
  const [tab, setTab] = useState<HelpTab>("manual");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [progressionQuery, setProgressionQuery] = useState("");
  const [expSource, setExpSource] = useState<ExpSource>("player");
  const [milestonesOnly, setMilestonesOnly] = useState(true);

  useEffect(() => {
    const fromUrl = readQueryParam("tab");
    if (isTab(fromUrl)) setTab(fromUrl);
    else if (fromUrl !== null) replaceQueryParam("tab", null);
    const category = Number(readQueryParam("category"));
    if (Number.isInteger(category) && category > 0) setCategoryId(category);
  }, []);

  const pickTab = (next: HelpTab) => {
    setTab(next);
    replaceQueryParam("tab", next === "manual" ? null : next);
  };
  const pickCategory = (id: number) => {
    setCategoryId(id);
    replaceQueryParam("category", String(id));
  };

  const activeCategory = categories.find((category) => category.id === categoryId) ?? categories[0] ?? null;
  const topicMap = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const needle = query.trim().toLocaleLowerCase();
  const searchHits = useMemo(() => (needle ? topics.filter((topic) => topic.searchText.includes(needle)) : []), [topics, needle]);
  const serverProgression = progressionByServer?.[server];
  const progressionCount =
    (serverProgression?.playerRanks.length ? 1 : 0)
    + (serverProgression?.characterRanks.length ? 1 : 0)
    + (serverProgression?.friendshipRanks.length ? 1 : 0)
    + (serverProgression?.bandRatings.length ? 1 : 0)
    + (serverProgression?.highScoreRatings.length ? 1 : 0);
  const tabCount: Record<HelpTab, number> = {
    manual: topics.length,
    tips: tips.length,
    faq: faq.length,
    progression: progressionCount,
  };

  const hasProgressionFilter = Boolean(progressionQuery.trim()) || expSource !== "player" || !milestonesOnly;
  const resetProgressionFilter = () => {
    setProgressionQuery("");
    setExpSource("player");
    setMilestonesOnly(true);
  };

  const progressionQuickFilter = (
    <BaseFilters
      locale={locale}
      variant="plain"
      title={t(locale, "skillsDictionary.progressionFilterTitle")}
      searchValue={progressionQuery}
      onSearchChange={setProgressionQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "skillsDictionary.progressionSearchPlaceholder")}
      hasActiveFilters={hasProgressionFilter}
      onReset={resetProgressionFilter}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "progressionRef.calcSource")}>
        <div className="flex flex-wrap gap-2">
          {EXP_SOURCES.map((src) => (
            <FilterButton key={src} active={expSource === src} onClick={() => setExpSource(src)}>
              {t(locale, `progressionRef.expTabs.${src}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      <FilterToggle
        checked={milestonesOnly}
        onChange={setMilestonesOnly}
        label={t(locale, "progressionRef.milestonesOnly")}
      />
    </BaseFilters>
  );

  useQuickFilter(
    t(locale, "skillsDictionary.progressionFilterTitle"),
    tab === "progression" ? progressionQuickFilter : null,
    [tab, progressionQuery, expSource, milestonesOnly, hasProgressionFilter, locale],
  );

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <div className="md3-tabs mb-4" role="tablist" aria-label={t(locale, "help.tabsLabel")}>
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => pickTab(value)}
            className="md3-tab md3-state"
          >
            {t(locale, `help.tabs.${value}`)}
            <span className="ml-1.5 text-label-small tabular-nums opacity-70">{tabCount[value]}</span>
          </button>
        ))}
      </div>

      {tab === "manual" ? (
        topics.length === 0 ? <Empty text={t(locale, "help.empty")} /> : (
          <div className="space-y-4">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(locale, "help.searchPlaceholder")}
              aria-label={t(locale, "filter.search")}
              className="md3-text-field md3-search-field !h-12 !px-5"
            />
            {needle ? (
              searchHits.length === 0 ? <Empty text={t(locale, "help.noResults")} /> : <TopicList locale={locale} topics={searchHits} showCategory />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <nav aria-label={t(locale, "help.categories")} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => pickCategory(category.id)}
                      aria-current={category.id === activeCategory?.id ? "true" : undefined}
                      // The sidebar's pills: a borderless list from lg, filled chips while the row scrolls sideways.
                      className={`md3-state shrink-0 rounded-full px-4 py-2 text-left text-label-large ${category.id === activeCategory?.id ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant hover:text-on-surface max-lg:bg-surface-container-high"}`}
                    >
                      {category.title}
                      <span className="ml-1.5 text-label-small tabular-nums opacity-70">{category.topicIds.length}</span>
                    </button>
                  ))}
                </nav>
                {activeCategory ? (
                  <div className="min-w-0 space-y-4">
                    <h2 className="text-headline-small text-on-surface">{activeCategory.title}</h2>
                    <TopicList locale={locale} topics={activeCategory.topicIds.map((id) => topicMap.get(id)).filter((topic): topic is ServerFaceted<HelpTopicViewModel> => Boolean(topic))} />
                    <HelpCarousels locale={locale} carousels={activeCategory.carousels} />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )
      ) : tab === "tips" ? (
        tips.length === 0 ? <Empty text={t(locale, "help.empty")} /> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tips.map((tip) => (
              <li key={tip.id} className="rounded-shape-lg border border-outline-variant bg-surface-container-low p-4">
                <h3 className="text-label-large text-on-surface">{tip.title}</h3>
                <HelpRichText value={tip.body} className="mt-1.5 text-body-medium leading-6 text-on-surface-variant" />
              </li>
            ))}
          </ul>
        )
      ) : tab === "progression" ? (
        <ProgressionReferenceView
          locale={locale}
          data={serverProgression}
          query={progressionQuery}
          expSource={expSource}
          onExpSourceChange={setExpSource}
          milestonesOnly={milestonesOnly}
          onMilestonesOnlyChange={setMilestonesOnly}
        />
      ) : faq.length === 0 ? <Empty text={t(locale, "help.empty")} /> : (
        <div className="space-y-2">
          {faq.map((entry) => (
            <details key={entry.id} className="group rounded-shape-lg border border-outline-variant bg-surface-container-low">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-shape-lg px-4 py-3 text-label-large text-on-surface">
                <span>{entry.title}</span>
                <svg className="h-4 w-4 shrink-0 text-primary transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <HelpRichText value={entry.body} className="border-t border-dashed border-outline-variant px-4 py-3 text-body-medium leading-7 text-on-surface-variant" />
            </details>
          ))}
        </div>
      )}
    </ServerScope>
  );
}

function TopicList({ locale, topics, showCategory = false }: { locale: AppLocale; topics: readonly HelpTopicViewModel[]; showCategory?: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {topics.map((topic) => (
        <li key={topic.id}>
          <a href={localizePath(helpTopicPath(topic.id), locale)} className="mn-list-card group flex h-full min-w-0 flex-col rounded-shape-lg border border-outline-variant bg-surface-container-low p-3 transition hover:shadow-elevation-1">
            {showCategory && <span className="text-label-small text-primary">{topic.categoryTitle}</span>}
            <span className="text-label-large text-on-surface group-hover:text-primary">{topic.title}</span>
            <span className="mt-1 line-clamp-2 text-body-small leading-5 text-on-surface-variant">{topic.body.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid min-h-40 place-items-center rounded-shape-lg border border-dashed border-outline-variant bg-surface-container-low p-8 text-center text-label-large text-on-surface-variant">{text}</div>;
}
