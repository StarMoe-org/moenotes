"use client";

import SiriusLoader from "@/components/shared/SiriusLoader";
import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
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
import { compareByStartDesc, formatMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { storyPath } from "@/lib/story/paths";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import Modal from "@/components/shared/Modal";
import ChapterCard from "@/components/story/ChapterCard";
import StoryScriptReader from "@/components/story/StoryScriptReader";
import StoryPlayerLink from "@/components/story/StoryPlayerLink";
import { getAssetUrl } from "@/lib/assets/url";
import { fetchAndParseStory, type ParsedStoryScript } from "@/lib/story/parser";
import { groupStoryChapters, type StoryChapterSummary } from "@/lib/story/chapters";
import type { RawStoryCharacter, StoryCategory, StoryViewModel } from "@/lib/story/data";
import type { RawText } from "@/lib/cards/data";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { formatPlayTime, storyEpisodeLabel } from "@/lib/story/labels";
import { useNow } from "@/lib/schedule/use-now";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

import { inStorySection, OTHER_CATEGORIES, storyCategoryKey, type StoryChapterSection, type StorySection } from "@/lib/story/sections";

export { inStorySection, storyCategoryKey, type StorySection };

const LIST_VIEWS = ["grid", "table"] as const;
type ListView = typeof LIST_VIEWS[number];
const PLAY_TIME_SORT = [{ key: "playTime", labelKey: "story.ui.playTime", initialDirection: "desc" as const }];

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

  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const visibleStories = useMemo(() => {
    if (showSpoiler) return stories;
    return stories.filter((story) => !isSpoiler(story.startAt, now));
  }, [stories, showSpoiler, now]);

  const sectionStories = useMemo(() => visibleStories.filter((story) => inStorySection(initialCategory, story)), [visibleStories, initialCategory]);
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
  const sortedStories = useMemo(
    () => (sort.value === "default" && initialCategory !== "main" ? [...filtered].sort(compareByStartDesc) : sortEntries(filtered, sort.value, locale)),
    [filtered, sort.value, locale, initialCategory],
  );
  // Main and event stories are browsed by chapter: the list shows one card per chapter, the chapter's own page its episodes.
  const chapters = useMemo(() => groupStoryChapters(sectionStories), [sectionStories]);
  const filteredChapters = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? chapters.filter((chapter) => chapter.searchText.includes(needle)) : chapters;
  }, [chapters, query]);
  const sortedChapters = useMemo(() => {
    const entries = filteredChapters.map((chapter) => ({ ...chapter, id: chapter.chapterId }));
    return sort.value === "default" && initialCategory !== "main" ? [...entries].sort(compareByStartDesc) : sortEntries(entries, sort.value, locale);
  }, [filteredChapters, sort.value, locale, initialCategory]);
  const reset = () => { sort.onChange("default"); setQuery(""); setOtherCategories([]); setLead(null); setPartner(null); setLevels([]); };
  const resultCount = initialCategory === "event" ? filteredChapters.length : filtered.length;
  const categoryTotal = initialCategory === "event" ? chapters.length : sectionStories.length;
  const hasActive = sort.value !== "default" || Boolean(query || otherCategories.length || lead !== null || partner !== null || levels.length);
  const quickFilterContent = hasFilters ? (
    <BaseFilters
      locale={locale}
      sort={sort}
      variant="plain"
      title={t(locale, storyCategoryKey(initialCategory))}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "story.ui.searchPlaceholder")}
      resultCount={resultCount}
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
    [initialCategory, query, otherCategories, lead, partner, levels, pairCharacters, partners, friendshipLevels, resultCount, categoryTotal, locale, sort.value],
  );

  if (initialCategory === "main") {
    if (loading) return <SiriusLoader locale={locale} label={t(locale, "story.ui.loadingMain")} />;
    if (error) return <State text={t(locale, "story.ui.loadMainError")} action={() => setReload((v) => v + 1)} />;
    return (
      <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
        <ChapterGrid chapters={sortedChapters} locale={locale} section="main" />
      </ServerScope>
    );
  }

  // Event stories are chapters too: one card per event, the filters and sort applying to the chapters.
  if (initialCategory === "event") {
    return (
      <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
        <section className="min-w-0" aria-live="polite">
          {filteredChapters.length === 0
            ? <State text={t(locale, "story.ui.empty")} action={reset} />
            : <ChapterGrid chapters={sortedChapters} locale={locale} section="event" />}
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

/** The chapter cards of the main or event story list. */
function ChapterGrid({ chapters, locale, section }: { chapters: StoryChapterSummary[]; locale: AppLocale; section: StoryChapterSection }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
      {chapters.map((chapter) => <ChapterCard key={chapter.chapterId} chapter={chapter} locale={locale} section={section} />)}
    </div>
  );
}

function StoryCard({ story, locale, onOpen }: { story: StoryViewModel; locale: AppLocale; onOpen: () => void }) {
  const assetUrl = useAssetUrl();
  const hasCover = !OTHER_CATEGORIES.includes(story.category);
  const image = hasCover ? (story.assets.banner || story.assets.image) : "";
  const imageUrl = image ? assetUrl(getAssetUrl({ path: `Story/Banner/${story.assets.banner ? "Episode" : "Chapter"}/${image}.png`, type: "raw", locale })) : "";

  const className = "mn-list-card group block w-full overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-low text-left shadow-elevation-1 transition hover:shadow-elevation-1";
  const content = <>
    {hasCover && (
      <div className="aspect-[2/1] bg-surface-container-highest border-b-[1.5px] border-outline-variant overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-headline-medium text-on-surface-variant">◇</div>
        )}
      </div>
    )}
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/12 px-2.5 py-1 text-label-small text-primary">
          {t(locale, storyCategoryKey(story.category))}
        </span>
        <span className="text-label-small tabular-nums text-on-surface-variant">{[formatPlayTime(story.playTime), `ADV ${story.advId}`].filter(Boolean).join(" · ")}</span>
      </div>
      <h3 className="line-clamp-2 text-on-surface text-title-medium">
        {story.title}
      </h3>
      {story.birthday ? (
        <div className="mt-3 flex items-center gap-2">
          <CharacterAvatarStack locale={locale} characters={[{ id: story.birthday.characterId, name: story.birthday.characterName }]} size="md" showNames />
          {story.birthday.month > 0 && <span className="text-label-small text-primary">{t(locale, "story.ui.birthdayDate", { month: story.birthday.month, day: story.birthday.day })}</span>}
        </div>
      ) : (
        <p className="mt-2 truncate text-body-small text-on-surface-variant">
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
          <span className="block truncate font-bold text-on-surface">{story.title}</span>
          <span className="block text-label-small text-on-surface-variant">{[storyEpisodeLabel(locale, story), `ADV ${story.advId}`].filter(Boolean).join(" · ")}</span>
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

function State({ text, action }: { text: string; action?: () => void }) { return <div className="grid min-h-64 place-items-center rounded-shape-lg border border-dashed border-outline-variant bg-surface-container-low p-8 text-center"><div><p className="font-bold text-on-surface-variant">{text}</p>{action && <button type="button" onClick={action} className="md3-button md3-button--filled mt-4">Retry</button>}</div></div>; }
