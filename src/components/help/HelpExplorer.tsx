import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import ServerScope from "@/components/shared/ServerScope";
import { HelpCarousels, HelpRichText } from "@/components/help/HelpParts";
import type { HelpCategoryViewModel, HelpEntryViewModel, HelpTopicViewModel } from "@/lib/help/data";
import { helpTopicPath } from "@/lib/help/paths";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";

const TABS = ["manual", "tips", "faq"] as const;
type HelpTab = typeof TABS[number];

interface Props {
  locale: AppLocale;
  servers: GameServer[];
  categories: ServerFaceted<HelpCategoryViewModel>[];
  topics: ServerFaceted<HelpTopicViewModel>[];
  tips: ServerFaceted<HelpEntryViewModel>[];
  faq: ServerFaceted<HelpEntryViewModel>[];
}

const isTab = (value: string | null): value is HelpTab => value !== null && (TABS as readonly string[]).includes(value);

/**
 * The in-game help: the manual (categories on the left, their topics and carousel guides on the right; a topic opens
 * its own page), the loading-screen tips, and the FAQ (expandable). The tab and the manual's category live in the URL
 * (`?tab=`, `?category=`). Content follows the page's server.
 */
export default function HelpExplorer({ locale, servers, categories: allCategories, topics: allTopics, tips: allTips, faq: allFaq }: Props) {
  const { server, pickServer, items: categories } = useServerList(locale, servers, allCategories);
  const topics = useServerList(locale, servers, allTopics).items;
  const tips = useServerList(locale, servers, allTips).items;
  const faq = useServerList(locale, servers, allFaq).items;
  const [tab, setTab] = useState<HelpTab>("manual");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

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
  const tabCount: Record<HelpTab, number> = { manual: topics.length, tips: tips.length, faq: faq.length };

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <div className="mn-segmented mb-5 flex w-fit flex-wrap gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="tablist" aria-label={t(locale, "help.tabsLabel")}>
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => pickTab(value)}
            className={`mn-focus rounded-full px-4 py-1.5 text-sm font-bold transition ${tab === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"}`}
          >
            {t(locale, `help.tabs.${value}`)}
            <span className="ml-1.5 text-[11px] font-black tabular-nums opacity-70">{tabCount[value]}</span>
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
              className="mn-focus w-full rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2 text-sm font-medium text-[var(--mn-text)] placeholder:text-[var(--mn-text-muted)]"
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
                      className={`mn-focus shrink-0 rounded-2xl border px-3 py-2 text-left text-sm font-bold transition ${category.id === activeCategory?.id ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                    >
                      {category.title}
                      <span className="ml-1.5 text-[11px] font-black tabular-nums opacity-70">{category.topicIds.length}</span>
                    </button>
                  ))}
                </nav>
                {activeCategory ? (
                  <div className="min-w-0 space-y-4">
                    <h2 className="text-xl font-black text-[var(--mn-text)]">{activeCategory.title}</h2>
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
              <li key={tip.id} className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp-sm)]">
                <h3 className="text-sm font-black text-[var(--mn-text)]">{tip.title}</h3>
                <HelpRichText value={tip.body} className="mt-1.5 text-sm leading-6 text-[var(--mn-text-muted)]" />
              </li>
            ))}
          </ul>
        )
      ) : faq.length === 0 ? <Empty text={t(locale, "help.empty")} /> : (
        <div className="space-y-2">
          {faq.map((entry) => (
            <details key={entry.id} className="group rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-sm)]">
              <summary className="mn-focus flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-black text-[var(--mn-text)]">
                <span>{entry.title}</span>
                <svg className="h-4 w-4 shrink-0 text-[var(--mn-accent-deep)] transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <HelpRichText value={entry.body} className="border-t border-dashed border-[var(--mn-border)] px-4 py-3 text-sm leading-7 text-[var(--mn-text-muted)]" />
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
          <a href={localizePath(helpTopicPath(topic.id), locale)} className="mn-list-card group flex h-full min-w-0 flex-col rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-3 shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp)]">
            {showCategory && <span className="text-[11px] font-black text-[var(--mn-accent)]">{topic.categoryTitle}</span>}
            <span className="text-sm font-black text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{topic.title}</span>
            <span className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--mn-text-muted)]">{topic.body.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-8 text-center text-sm font-bold text-[var(--mn-text-muted)]">{text}</div>;
}
