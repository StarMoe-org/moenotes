import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries, type ListSort } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import BaseFilters, { FilterButton, FilterSection } from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import Modal from "@/components/shared/Modal";
import StoryScriptReader from "@/components/story/StoryScriptReader";
import { getAssetUrl } from "@/lib/assets/url";
import { fetchAndParseStory, type ParsedStoryScript } from "@/lib/story/parser";
import type { RawStoryCharacter, StoryCategory, StoryViewModel } from "@/lib/story/data";
import type { RawText } from "@/lib/cards/data";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { storyEpisodeLabel } from "@/lib/story/labels";

export type StorySection = "main" | "friendship" | "other";

function storyCategoryKey(category: StoryCategory | "other"): string {
  if (category === "live-result") return "story.categories.liveResult";
  return `story.categories.${category}`;
}

export default function StoryExplorer({ locale, initialCategory, initialStories, initialCharacters, initialTexts }: { locale: AppLocale; initialCategory: StorySection; initialStories: StoryViewModel[]; initialCharacters: RawStoryCharacter[]; initialTexts: RawText[] }) {
  const sort = useListSort(`story-${initialCategory}`, locale, "date");
  const [stories] = useState<StoryViewModel[]>(initialStories);
  const [query, setQuery] = useState("");
  const [otherCategories, setOtherCategories] = useState<StoryCategory[]>([]);
  const loading = false;
  const error = false;
  const [, setReload] = useState(0);
  const [active, setActive] = useState<StoryViewModel | null>(null);
  const characters = initialCharacters;
  const texts = initialTexts;

  const inSection = (story: StoryViewModel) => initialCategory === "other" ? ["live-result", "home", "tutorial"].includes(story.category) : story.category === initialCategory;
  const filtered = useMemo(() => stories.filter((story) => inSection(story) && (initialCategory !== "other" || otherCategories.length === 0 || otherCategories.includes(story.category)) && (!query.trim() || story.searchText.includes(query.trim().toLocaleLowerCase()))), [stories, initialCategory, otherCategories, query]);
  const sortedStories = useMemo(() => sortEntries(filtered, sort.value, locale), [filtered, sort.value, locale]);
  const reset = () => { sort.onChange("default"); setQuery(""); setOtherCategories([]); };
  const categoryTotal = stories.filter(inSection).length;
  const quickFilterContent = initialCategory === "main" ? null : (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, storyCategoryKey(initialCategory))}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel="Search"
      searchPlaceholder={t(locale, "story.ui.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={categoryTotal}
      hasActiveFilters={sort.value !== "default" || Boolean(query || otherCategories.length)}
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
            {(["live-result", "home", "tutorial"] as StoryCategory[]).map((category) => (
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
      ) : (
        <div />
      )}
    </BaseFilters>
  );

  useQuickFilter(
    t(locale, storyCategoryKey(initialCategory)),
    quickFilterContent,
    [initialCategory, query, otherCategories, filtered.length, categoryTotal, locale, sort.value]
  );

  if (initialCategory === "main") {
    if (loading) return <State text={t(locale, "story.ui.loadingMain")} />;
    if (error) return <State text={t(locale, "story.ui.loadMainError")} action={() => setReload((v) => v + 1)} />;
    return <MainStoryGroups stories={stories.filter(inSection)} locale={locale} sort="default" />;
  }

  return (
    <>
      <section className="min-w-0" aria-live="polite">
        {loading ? (
          <State text={t(locale, "story.ui.loading")} />
        ) : error ? (
          <State text={t(locale, "story.ui.loadError")} action={() => setReload((v) => v + 1)} />
        ) : filtered.length === 0 ? (
          <State text={t(locale, "story.ui.empty")} action={reset} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedStories.map((story) => (
              <StoryCard key={story.id} story={story} locale={locale} onOpen={() => setActive(story)} />
            ))}
          </div>
        )}
      </section>
      <StoryReader story={active} locale={locale} characters={characters} texts={texts} onClose={() => setActive(null)} />
    </>
  );
}

function MainStoryGroups({ stories, locale, sort }: { stories: StoryViewModel[]; locale: AppLocale; sort: ListSort }) {
  const chapters = [...new Map(stories.map((story) => [story.chapterId, story])).values()]
    .sort((a, b) => (a.chapterId ?? 0) - (b.chapterId ?? 0));

  return <div className="space-y-8">{sortEntries(chapters.map((chapter) => ({ ...chapter, title: chapter.chapterName })), sort, locale).map((chapter) => {
    // Main, another and extra episodes each number from 1, so they are listed as separate runs.
    const episodes = stories.filter((story) => story.chapterId === chapter.chapterId).sort((a, b) => a.sortOrder - b.sortOrder);
    const runs = (["main", "another", "extra"] as const)
      .map((kind) => ({ kind, episodes: episodes.filter((episode) => (episode.episodeKind ?? "main") === kind) }))
      .filter((run) => run.episodes.length > 0);
    const chapterAsset = chapter.chapterBanner || chapter.chapterImage;
    const chapterImageUrl = chapterAsset ? getAssetUrl({ path: `Story/${chapter.chapterBanner ? "Banner" : "Image"}/Chapter/${chapterAsset}.png`, type: "raw" }) : "";
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortEntries(run.episodes, sort, locale).map((episode) => <a key={episode.id} href={localizePath(`/story/${episode.advId}`, locale)} className="mn-list-card mn-list-card-row group flex items-center gap-4 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-3 shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp)]">
              <img src={getAssetUrl({ path: `Story/Banner/Episode/${episode.assets.banner}.png`, type: "raw", locale })} alt="" className="h-16 w-28 shrink-0 rounded-xl object-cover" loading="lazy" />
              <div className="min-w-0">
                <p className="text-[11px] font-black text-[var(--mn-accent)]">
                  {storyEpisodeLabel(locale, episode)}
                  {episode.episodeKind === "another" && episode.characterNames[0] && <span className="ml-1.5 font-bold text-[var(--mn-text-muted)]">{episode.characterNames[0]}</span>}
                </p>
                <h4 className="mt-1 line-clamp-2 text-sm font-black text-[var(--mn-text)]">{episode.title}</h4>
              </div>
            </a>)}
          </div>
        </div>)}
      </div>
    </section>;
  })}</div>;
}

function StoryCard({ story, locale, onOpen }: { story: StoryViewModel; locale: AppLocale; onOpen: () => void }) {
  const hasCover = story.category === "main" || story.category === "friendship";
  const image = hasCover ? (story.assets.banner || story.assets.image) : "";
  const imageUrl = image ? getAssetUrl({ path: `Story/Banner/${story.assets.banner ? "Episode" : "Chapter"}/${image}.png`, type: "raw", locale }) : "";

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
        <span className="text-[11px] font-bold text-[var(--mn-text-muted)]">ADV {story.advId}</span>
      </div>
      <h3 className="line-clamp-2 font-black text-[var(--mn-text)] text-base leading-snug">
        {story.title}
      </h3>
      <p className="mt-2 truncate text-xs font-medium text-[var(--mn-text-muted)]">
        {story.characterNames.join(" · ") || story.groupTitle}
      </p>
    </div>
  </>;
  return story.category === "main" || story.category === "friendship"
    ? <a href={localizePath(`/story/${story.advId}`, locale)} className={className} data-list-item-id={story.id}>{content}</a>
    : <button type="button" onClick={onOpen} className={className} data-list-item-id={story.id}>{content}</button>;
}

function StoryReader({ story, locale, characters, texts, onClose }: { story: StoryViewModel | null; locale: AppLocale; characters: RawStoryCharacter[]; texts: RawText[]; onClose: () => void }) {
  const [script, setScript] = useState<ParsedStoryScript | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!story) return;
    let alive = true;
    setScript(null);
    setFailed(false);

    void fetchAndParseStory(story.assets.advEpisodeAsset, { locale })
      .then((value) => alive && setScript(value))
      .catch(() => alive && setFailed(true));

    return () => { alive = false; };
  }, [story, locale]);

  return <Modal isOpen={Boolean(story)} onClose={onClose} title={story?.title} closeLabel={t(locale, "story.ui.close")} size="xl">
    {failed ? <State text={t(locale, "story.ui.scriptUnavailable")} /> : !script || !story ? <State text={t(locale, "story.ui.parsing")} /> : (
      // Keyed by story, so playback state resets and audio stops when another story opens or the modal closes.
      <StoryScriptReader key={story.id} locale={locale} script={script} characters={characters} texts={texts} layer="modal" />
    )}
  </Modal>;
}

function State({ text, action }: { text: string; action?: () => void }) { return <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-8 text-center"><div><p className="font-bold text-[var(--mn-text-muted)]">{text}</p>{action && <button type="button" onClick={action} className="mt-4 rounded-full bg-[var(--mn-accent)] px-5 py-2 text-sm font-black text-white">Retry</button>}</div></div>; }
