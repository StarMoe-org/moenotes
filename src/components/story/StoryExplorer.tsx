import SiriusLoader from "@/components/shared/SiriusLoader";
import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries, type ListSort } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import { serverReleaseFetcher } from "@/lib/assets/release";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useContentServerScope, useServerList } from "@/lib/servers/use-content-server";
import BaseFilters, { CharacterFilter, FilterButton, FilterSection } from "@/components/shared/BaseFilters";
import CharacterAvatarStack from "@/components/shared/CharacterAvatarStack";
import CollectionViewSwitch, { useCollectionView } from "@/components/shared/CollectionViewSwitch";
import DataTable, { type DataTableColumn } from "@/components/shared/DataTable";
import { formatMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { storyPath } from "@/lib/story/paths";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import Modal from "@/components/shared/Modal";
import StoryScriptReader from "@/components/story/StoryScriptReader";
import StoryPlayerLink from "@/components/story/StoryPlayerLink";
import { getAssetUrl } from "@/lib/assets/url";
import { fetchAndParseStory, type ParsedStoryScript } from "@/lib/story/parser";
import type { RawStoryCharacter, StoryCategory, StoryViewModel } from "@/lib/story/data";
import type { RawText } from "@/lib/cards/data";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { formatPlayTime, storyEpisodeLabel } from "@/lib/story/labels";

export type StorySection = "main" | "event" | "friendship" | "birthday" | "other";

const OTHER_CATEGORIES: readonly StoryCategory[] = ["live-result", "home", "tutorial"];
const LIST_VIEWS = ["grid", "table"] as const;
type ListView = typeof LIST_VIEWS[number];
const PLAY_TIME_SORT = [{ key: "playTime", labelKey: "story.ui.playTime", initialDirection: "desc" as const }];

/** Whether a story belongs to a story page's list. */
export function inStorySection(section: StorySection, story: { category: StoryCategory }): boolean {
  return section === "other" ? OTHER_CATEGORIES.includes(story.category) : story.category === section;
}

export function storyCategoryKey(category: StoryCategory | "other"): string {
  if (category === "live-result") return "story.categories.liveResult";
  return `story.categories.${category}`;
}

export default function StoryExplorer({ locale, servers, initialCategory, initialStories, initialCharacters, initialTexts }: { locale: AppLocale; servers: GameServer[]; initialCategory: StorySection; initialStories: ServerFaceted<StoryViewModel>[]; initialCharacters: RawStoryCharacter[]; initialTexts: RawText[] }) {
  const sort = useListSort(`story-${initialCategory}`, locale, "date", { numeric: PLAY_TIME_SORT });
  const { server, pickServer, items: stories } = useServerList(locale, servers, initialStories);
  const [query, setQuery] = useState("");
  const [otherCategories, setOtherCategories] = useState<StoryCategory[]>([]);
  // Bond stories: the pair's lead and partner (either order) and the bond level that unlocks the episode.
  const [lead, setLead] = useState<number | null>(null);
  const [partner, setPartner] = useState<number | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [view, setView] = useCollectionView(`story-${initialCategory}`, LIST_VIEWS, "grid");
  const loading = false;
  const error = false;
  const [, setReload] = useState(0);
  const [active, setActive] = useState<StoryViewModel | null>(null);
  const characters = initialCharacters;
  const texts = initialTexts;

  const sectionStories = useMemo(() => stories.filter((story) => inStorySection(initialCategory, story)), [stories, initialCategory]);
  const hasFilters = initialCategory !== "main";
  const isFriendship = initialCategory === "friendship";
  const pairCharacters = useMemo(() => {
    if (!isFriendship) return [];
    const names = new Map<number, string>();
    for (const story of sectionStories) story.characterIds.forEach((id, index) => { if (!names.has(id)) names.set(id, story.characterNames[index] ?? ""); });
    return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id);
  }, [isFriendship, sectionStories]);
  const partners = useMemo(() => {
    if (lead === null) return [];
    const ids = new Set(sectionStories.filter((story) => story.characterIds.includes(lead)).flatMap((story) => story.characterIds).filter((id) => id !== lead));
    return pairCharacters.filter((character) => ids.has(character.id));
  }, [lead, sectionStories, pairCharacters]);
  const friendshipLevels = useMemo(() => isFriendship ? [...new Set(sectionStories.map((story) => story.unlock.friendshipLevel).filter((level) => level > 0))].sort((a, b) => a - b) : [], [isFriendship, sectionStories]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sectionStories.filter((story) => {
      if (initialCategory === "other" && otherCategories.length > 0 && !otherCategories.includes(story.category)) return false;
      if (lead !== null && !story.characterIds.includes(lead)) return false;
      if (partner !== null && !story.characterIds.includes(partner)) return false;
      if (levels.length > 0 && !levels.includes(story.unlock.friendshipLevel)) return false;
      return !needle || story.searchText.includes(needle);
    });
  }, [sectionStories, initialCategory, otherCategories, lead, partner, levels, query]);
  const sortedStories = useMemo(() => sortEntries(filtered, sort.value, locale), [filtered, sort.value, locale]);
  const reset = () => { sort.onChange("default"); setQuery(""); setOtherCategories([]); setLead(null); setPartner(null); setLevels([]); };
  const categoryTotal = sectionStories.length;
  const hasActive = sort.value !== "default" || Boolean(query || otherCategories.length || lead !== null || partner !== null || levels.length);
  const quickFilterContent = hasFilters ? (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, storyCategoryKey(initialCategory))}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "story.ui.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={categoryTotal}
      hasActiveFilters={hasActive}
      onReset={reset}
      resetLabel={t(locale, "story.ui.reset")}
      expandLabel={t(locale, "story.ui.expand")}
    >
      {initialCategory === "other" ? (
        <FilterSection title={t(locale, "story.ui.storyType")}>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={otherCategories.length === 0} onClick={() => setOtherCategories([])}>
              ALL
            </FilterButton>
            {OTHER_CATEGORIES.map((category) => (
              <FilterButton
                key={category}
                active={otherCategories.includes(category)}
                onClick={() =>
                  setOtherCategories(
                    otherCategories.includes(category)
                      ? otherCategories.filter((item) => item !== category)
                      : [...otherCategories, category]
                  )
                }
              >
                {t(locale, storyCategoryKey(category))}
              </FilterButton>
            ))}
          </div>
        </FilterSection>
      ) : isFriendship ? (
        <>
          <CharacterFilter
            title={t(locale, "story.ui.lead")}
            characters={pairCharacters}
            selectedCharacters={lead === null ? [] : [lead]}
            onToggle={(id) => { setLead(lead === id ? null : id); setPartner(null); }}
            onReset={() => { setLead(null); setPartner(null); }}
          />
          <CharacterFilter
            title={t(locale, "story.ui.partner")}
            characters={partners}
            selectedCharacters={partner === null ? [] : [partner]}
            onToggle={(id) => setPartner(partner === id ? null : id)}
            onReset={() => setPartner(null)}
          />
          {friendshipLevels.length > 0 && (
            <FilterSection title={t(locale, "story.ui.friendshipLevel")}>
              <div className="flex flex-wrap gap-2">
                <FilterButton active={levels.length === 0} onClick={() => setLevels([])}>ALL</FilterButton>
                {friendshipLevels.map((level) => (
                  <FilterButton key={level} active={levels.includes(level)} onClick={() => setLevels(levels.includes(level) ? levels.filter((item) => item !== level) : [...levels, level])}>
                    {t(locale, "story.ui.levelValue", { level })}
                  </FilterButton>
                ))}
              </div>
            </FilterSection>
          )}
        </>
      ) : (
        <div />
      )}
    </BaseFilters>
  ) : null;

  useQuickFilter(
    t(locale, storyCategoryKey(initialCategory)),
    quickFilterContent,
    [initialCategory, query, otherCategories, lead, partner, levels, pairCharacters, partners, friendshipLevels, filtered.length, categoryTotal, locale, sort.value],
  );

  if (initialCategory === "main") {
    if (loading) return <SiriusLoader locale={locale} label={t(locale, "story.ui.loadingMain")} />;
    if (error) return <State text={t(locale, "story.ui.loadMainError")} action={() => setReload((v) => v + 1)} />;
    return (
      <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
        <ChapterGroups stories={sectionStories} locale={locale} sort="default" />
      </ServerScope>
    );
  }

  // Event stories are chapters too: listed by chapter, the filters and sort applying to the chapters.
  if (initialCategory === "event") {
    return (
      <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
        <section className="min-w-0" aria-live="polite">
          {filtered.length === 0
            ? <State text={t(locale, "story.ui.empty")} action={reset} />
            : <ChapterGroups stories={filtered} locale={locale} sort={sort.value} />}
        </section>
      </ServerScope>
    );
  }

  const viewSwitch = <CollectionViewSwitch locale={locale} views={LIST_VIEWS} value={view} onChange={(next: ListView) => setView(next)} compact />;

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} actions={viewSwitch}>
      <section className="min-w-0" aria-live="polite">
        {initialCategory === "birthday" && categoryTotal === 0 ? (
          <State text={t(locale, "story.ui.birthdayEmpty")} />
        ) : loading ? (
          <SiriusLoader locale={locale} label={t(locale, "story.ui.loading")} />
        ) : error ? (
          <State text={t(locale, "story.ui.loadError")} action={() => setReload((v) => v + 1)} />
        ) : filtered.length === 0 ? (
          <State text={t(locale, "story.ui.empty")} action={reset} />
        ) : view === "table" ? (
          <StoryTable stories={sortedStories} locale={locale} onOpen={setActive} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedStories.map((story) => (
              <StoryCard key={story.id} story={story} locale={locale} onOpen={() => setActive(story)} />
            ))}
          </div>
        )}
      </section>
      <StoryReader story={active} locale={locale} characters={characters} texts={texts} onClose={() => setActive(null)} />
    </ServerScope>
  );
}

/** Episodes grouped by chapter; `sort` orders the chapters, episodes keep their in-game order. */
function ChapterGroups({ stories, locale, sort }: { stories: StoryViewModel[]; locale: AppLocale; sort: ListSort }) {
  const assetUrl = useAssetUrl();
  const chapters = [...new Map(stories.map((story) => [story.chapterId, story])).values()]
    .sort((a, b) => (a.chapterId ?? 0) - (b.chapterId ?? 0));

  return <div className="space-y-8">{sortEntries(chapters.map((chapter) => ({ ...chapter, id: chapter.chapterId ?? 0, title: chapter.chapterName })), sort, locale).map((chapter) => {
    // Main, another and extra episodes each number from 1, so they are listed as separate runs.
    const episodes = stories.filter((story) => story.chapterId === chapter.chapterId).sort((a, b) => a.sortOrder - b.sortOrder);
    const runs = (["main", "another", "extra"] as const)
      .map((kind) => ({ kind, episodes: episodes.filter((episode) => (episode.episodeKind ?? "main") === kind) }))
      .filter((run) => run.episodes.length > 0);
    const chapterAsset = chapter.chapterBanner || chapter.chapterImage;
    const chapterImageUrl = chapterAsset ? assetUrl(getAssetUrl({ path: `Story/${chapter.chapterBanner ? "Banner" : "Image"}/Chapter/${chapterAsset}.png`, type: "raw" })) : "";
    return <section key={chapter.chapterId} className="mn-list-group overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
      <div className="flex flex-col">
        {chapterImageUrl && (
          <div className="w-full aspect-[21/9] sm:aspect-[24/9] md:aspect-[3/1] bg-[var(--mn-cream-deep)] border-b-[1.5px] border-[var(--mn-border)] overflow-hidden">
            <img src={chapterImageUrl} alt="" className="h-full w-full object-cover transition duration-300 hover:scale-[1.01]" />
          </div>
        )}
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-wider text-[var(--mn-accent)]">{chapter.bandName}</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--mn-text)]">{chapter.chapterName}</h2>
          <p className="mt-4 whitespace-pre-line leading-7 text-[var(--mn-text-muted)]">{chapter.chapterDescription}</p>
          <p className="mt-4 text-xs font-medium text-[var(--mn-text-muted)]">{chapter.characterNames.join(" · ")}</p>
        </div>
      </div>
      <div className="space-y-5 border-t-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 sm:p-6">
        {runs.map((run) => <div key={run.kind}>
          {run.kind !== "main" && <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-[var(--mn-text-muted)]">{t(locale, run.kind === "another" ? "story.ui.anotherStories" : "story.ui.extraStories")}</h3>}
          {/* Columns as wide as a banner and a title need, however narrow the content column is. */}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
            {run.episodes.map((episode) => <a key={episode.id} href={localizePath(storyPath(episode.advId), locale)} className="mn-list-card mn-list-card-row group flex min-w-0 items-center gap-4 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-3 shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp)]">
              <img src={assetUrl(getAssetUrl({ path: `Story/Banner/Episode/${episode.assets.banner}.png`, type: "raw", locale }))} alt="" className="h-16 w-28 shrink-0 rounded-xl object-cover" loading="lazy" />
              <div className="min-w-0">
                <p className="text-[11px] font-black text-[var(--mn-accent)]">
                  {storyEpisodeLabel(locale, episode)}
                  {episode.episodeKind === "another" && episode.characterNames[0] && <span className="ml-1.5 font-bold text-[var(--mn-text-muted)]">{episode.characterNames[0]}</span>}
                </p>
                <h4 className="mt-1 line-clamp-2 text-sm font-black text-[var(--mn-text)]">{episode.title}</h4>
                {episode.playTime ? <p className="mt-1 text-[11px] font-bold tabular-nums text-[var(--mn-text-muted)]">{formatPlayTime(episode.playTime)}</p> : null}
              </div>
            </a>)}
          </div>
        </div>)}
      </div>
    </section>;
  })}</div>;
}

function StoryCard({ story, locale, onOpen }: { story: StoryViewModel; locale: AppLocale; onOpen: () => void }) {
  const assetUrl = useAssetUrl();
  const hasCover = !OTHER_CATEGORIES.includes(story.category);
  const image = hasCover ? (story.assets.banner || story.assets.image) : "";
  const imageUrl = image ? assetUrl(getAssetUrl({ path: `Story/Banner/${story.assets.banner ? "Episode" : "Chapter"}/${image}.png`, type: "raw", locale })) : "";

  const className = "mn-list-card group block w-full overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-left shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]";
  const content = <>
    {hasCover && (
      <div className="aspect-[2/1] bg-[var(--mn-cream-deep)] border-b-[1.5px] border-[var(--mn-border)] overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-[var(--mn-text-muted)]">◇</div>
        )}
      </div>
    )}
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-[color-mix(in_oklab,var(--mn-accent)_12%,transparent)] px-2.5 py-1 text-[11px] font-black text-[var(--mn-accent)]">
          {t(locale, storyCategoryKey(story.category))}
        </span>
        <span className="text-[11px] font-bold tabular-nums text-[var(--mn-text-muted)]">{[formatPlayTime(story.playTime), `ADV ${story.advId}`].filter(Boolean).join(" · ")}</span>
      </div>
      <h3 className="line-clamp-2 font-black text-[var(--mn-text)] text-base leading-snug">
        {story.title}
      </h3>
      {story.birthday ? (
        <div className="mt-3 flex items-center gap-2">
          <CharacterAvatarStack locale={locale} characters={[{ id: story.birthday.characterId, name: story.birthday.characterName }]} size="md" showNames />
          {story.birthday.month > 0 && <span className="text-[11px] font-bold text-[var(--mn-accent)]">{t(locale, "story.ui.birthdayDate", { month: story.birthday.month, day: story.birthday.day })}</span>}
        </div>
      ) : (
        <p className="mt-2 truncate text-xs font-medium text-[var(--mn-text-muted)]">
          {story.characterNames.join(" · ") || story.groupTitle}
        </p>
      )}
    </div>
  </>;
  return hasCover
    ? <a href={localizePath(storyPath(story.advId), locale)} className={className} data-list-item-id={story.id}>{content}</a>
    : <button type="button" onClick={onOpen} className={className} data-list-item-id={story.id}>{content}</button>;
}

/** The table view: title, chapter (or group), characters, length and release time. */
function StoryTable({ stories, locale, onOpen }: { stories: StoryViewModel[]; locale: AppLocale; onOpen: (story: StoryViewModel) => void }) {
  const timeZone = useDisplayTimeZone();
  const columns: DataTableColumn<StoryViewModel>[] = [
    {
      key: "title",
      header: t(locale, "story.ui.columnTitle"),
      sticky: true,
      sortValue: (story) => story.title,
      render: (story) => (
        <span className="block min-w-[10rem] max-w-[22rem]">
          <span className="block truncate font-bold text-[var(--mn-text)]">{story.title}</span>
          <span className="block text-[11px] font-medium text-[var(--mn-text-muted)]">{[storyEpisodeLabel(locale, story), `ADV ${story.advId}`].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    { key: "chapter", header: t(locale, "story.ui.columnChapter"), sortValue: (story) => story.chapterName || story.groupTitle, render: (story) => <span className="block max-w-[16rem] truncate">{story.chapterName || story.groupTitle || t(locale, storyCategoryKey(story.category))}</span> },
    {
      key: "characters",
      header: t(locale, "nav.items.characters"),
      render: (story) => <CharacterAvatarStack locale={locale} characters={(story.birthday ? [story.birthday.characterId] : story.characterIds).map((id, index) => ({ id, name: story.birthday?.characterName ?? story.characterNames[index] ?? "" }))} size="sm" max={4} />,
    },
    { key: "playTime", header: t(locale, "story.ui.playTime"), numeric: true, sortValue: (story) => story.playTime, render: (story) => formatPlayTime(story.playTime) || "-" },
    { key: "startAt", header: t(locale, "sorting.date"), sortValue: (story) => story.startAt || null, initialDirection: "desc", render: (story) => <span className="whitespace-nowrap tabular-nums">{formatMasterDate(story.startAt, locale, false, timeZone) || "-"}</span> },
  ];
  const hasPage = (story: StoryViewModel) => !OTHER_CATEGORIES.includes(story.category);
  return (
    <DataTable
      locale={locale}
      columns={columns}
      rows={stories}
      rowKey={(story) => story.id}
      caption={t(locale, "collectionView.table")}
      rowHref={(story) => (hasPage(story) ? localizePath(storyPath(story.advId), locale) : undefined)}
      onRowClick={(story) => { if (!hasPage(story)) onOpen(story); }}
    />
  );
}

function StoryReader({ story, locale, characters, texts, onClose }: { story: StoryViewModel | null; locale: AppLocale; characters: RawStoryCharacter[]; texts: RawText[]; onClose: () => void }) {
  const [script, setScript] = useState<ParsedStoryScript | null>(null);
  const [failed, setFailed] = useState(false);
  const { server } = useContentServerScope();

  useEffect(() => {
    if (!story) return;
    let alive = true;
    setScript(null);
    setFailed(false);

    // The script's tables come from the page server's catalog.
    void fetchAndParseStory(story.assets.advEpisodeAsset, { locale, fetcher: serverReleaseFetcher(server) })
      .then((value) => alive && setScript(value))
      .catch(() => alive && setFailed(true));

    return () => { alive = false; };
  }, [story, locale, server]);

  return <Modal
    isOpen={Boolean(story)}
    onClose={onClose}
    title={story?.title}
    closeLabel={t(locale, "story.ui.close")}
    size="xl"
    headerActions={story ? <StoryPlayerLink key={story.advId} locale={locale} advId={story.advId} variant="compact" /> : undefined}
  >
    {failed ? <State text={t(locale, "story.ui.scriptUnavailable")} /> : !script || !story ? <State text={t(locale, "story.ui.parsing")} /> : (
      // Keyed by story, so playback state resets and audio stops when another story opens or the modal closes.
      <StoryScriptReader key={story.id} locale={locale} script={script} characters={characters} texts={texts} layer="modal" />
    )}
  </Modal>;
}

function State({ text, action }: { text: string; action?: () => void }) { return <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-8 text-center"><div><p className="font-bold text-[var(--mn-text-muted)]">{text}</p>{action && <button type="button" onClick={action} className="mt-4 rounded-full bg-[var(--mn-accent)] px-5 py-2 text-sm font-black text-white">Retry</button>}</div></div>; }
