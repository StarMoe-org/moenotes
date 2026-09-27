import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StoryPlayer } from "ournotes-player/story";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, { FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import { closeFilterDrawer, openFilterDrawer, useQuickFilter } from "@/lib/filter/use-quick-filter";
import type { StoryCategory } from "@/lib/story/data";
import { fetchSiteStory, fetchStorySite, type StoryRuntimes } from "@/lib/story/player-client";
import {
  formatMegabytes,
  getStoryPlayerHref,
  parseStoryPlayerSearch,
  STORY_LANGUAGES,
  storyControlsLanguage,
  storyDownloadBytes,
  storyLanguageFor,
  storySiteTitle,
  type StoryLanguage,
  type StoryPickerStory,
  type StorySiteEntry,
} from "@/lib/story/player-data";
import StoryStage from "@/components/tools/StoryStage";
import { StageSignature } from "@/components/tools/Live2DStage";

interface Props {
  locale: AppLocale;
  /** Every episode of the build's story data, in the story pages' order, with localized names. */
  stories: StoryPickerStory[];
}

type Category = StoryCategory | "other";
const CATEGORIES: readonly Category[] = ["main", "friendship", "live-result", "home", "tutorial", "other"];

type SiteState = { kind: "loading" } | { kind: "error"; detail: string } | { kind: "ready"; entries: StorySiteEntry[] };

/** An episode the story site has, with what the list, the search and the panel show. */
interface Entry {
  advId: number;
  site: StorySiteEntry;
  category: Category;
  title: string;
  groupId: string;
  groupTitle: string;
  episodeLabel: string;
  searchText: string;
}

/**
 * The story player: the episodes the story site has, grouped as on the story pages (the quick filter narrows them by
 * type and text), and the story screen of the chosen one with its language and neighbours beside it.
 */
export default function StoryPlayerTool({ locale, stories }: Props) {
  const [site, setSite] = useState<SiteState>({ kind: "loading" });
  const [siteAttempt, setSiteAttempt] = useState(0);
  const [advId, setAdvId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [language, setLanguage] = useState<StoryLanguage | null>(null);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  // A story the address names that the index does not list (yet), read from its manifest.
  const [linked, setLinked] = useState<StorySiteEntry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSite({ kind: "loading" });
    fetchStorySite(controller.signal).then(
      (entries) => setSite({ kind: "ready", entries }),
      (error: unknown) => {
        if (!controller.signal.aborted) setSite({ kind: "error", detail: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, [siteAttempt]);

  const entries = useMemo<Entry[]>(() => {
    if (site.kind !== "ready") return [];
    const siteEntries = linked && !site.entries.some((entry) => entry.advId === linked.advId) ? [...site.entries, linked] : site.entries;
    const byAdv = new Map(siteEntries.map((entry) => [entry.advId, entry]));
    const listed = new Set<number>();
    const known: Entry[] = [];
    for (const story of stories) {
      const entry = byAdv.get(story.advId);
      if (!entry || listed.has(story.advId)) continue;
      listed.add(story.advId);
      const title = story.title || storySiteTitle(entry, locale);
      known.push({
        advId: story.advId, site: entry, category: story.category, title, groupId: story.groupId, groupTitle: story.groupTitle,
        episodeLabel: story.episodeLabel, searchText: `${story.searchText} ${title} ${story.advId}`.toLocaleLowerCase(),
      });
    }
    // Episodes published after this build of the site: listed by the site's own titles, in advId order.
    const unknown = siteEntries
      .filter((entry) => !listed.has(entry.advId))
      .sort((a, b) => a.advId - b.advId)
      .map((entry): Entry => {
        const title = storySiteTitle(entry, locale);
        return {
          advId: entry.advId, site: entry, category: "other", title, groupId: "site", groupTitle: t(locale, "storyPlayer.otherEpisodes"),
          episodeLabel: "", searchText: `${title} ${entry.advId}`.toLocaleLowerCase(),
        };
      });
    return [...known, ...unknown];
  }, [site, linked, stories, locale]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => (categories.length === 0 || categories.includes(entry.category)) && (!needle || entry.searchText.includes(needle)));
  }, [entries, query, categories]);
  const presentCategories = useMemo(() => CATEGORIES.filter((category) => entries.some((entry) => entry.category === category)), [entries]);

  const index = useMemo(() => entries.findIndex((entry) => entry.advId === advId), [entries, advId]);
  const current = index >= 0 ? entries[index]! : null;

  // The address names the story: open it once the index has arrived (or from its manifest, when the index lacks it).
  useEffect(() => {
    if (site.kind !== "ready" || restored) return;
    const requested = parseStoryPlayerSearch(window.location.search);
    if (requested === null || site.entries.some((entry) => entry.advId === requested)) {
      if (requested !== null) setAdvId(requested);
      setRestored(true);
      return;
    }
    const controller = new AbortController();
    fetchSiteStory(requested, controller.signal)
      .then((entry) => {
        if (controller.signal.aborted) return;
        if (entry) {
          setLinked(entry);
          setAdvId(entry.advId);
        }
        setRestored(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRestored(true);
      });
    return () => controller.abort();
  }, [site, restored]);

  useEffect(() => {
    if (!restored) return;
    const href = getStoryPlayerHref(locale, advId ?? undefined);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
  }, [restored, advId, locale]);

  const choose = useCallback((id: number) => {
    setAdvId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (window.matchMedia("(max-width: 1023px)").matches) closeFilterDrawer();
  }, []);

  const hasActiveFilters = Boolean(query) || categories.length > 0;
  const resetFilters = useCallback(() => {
    setQuery("");
    setCategories([]);
  }, []);

  const quickFilterContent = (
    <BaseFilters
      variant="plain"
      title={t(locale, "storyPlayer.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "storyPlayer.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={entries.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "storyPlayer.categoryTitle")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={categories.length === 0} onClick={() => setCategories([])}>ALL</FilterButton>
          {presentCategories.map((category) => (
            <FilterButton key={category} active={categories.includes(category)} onClick={() => setCategories((previous) => toggleArrayItem(previous, category))}>
              {t(locale, `storyPlayer.category.${category}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
    </BaseFilters>
  );

  useQuickFilter(t(locale, "storyPlayer.filterTitle"), quickFilterContent, [query, categories, presentCategories, filtered.length, entries.length, hasActiveFilters, locale]);

  return (
    <div className="space-y-4 @container">
      <Notice locale={locale} />
      {current ? (
        <StoryView
          key={current.advId}
          locale={locale}
          entry={current}
          language={language}
          onLanguage={setLanguage}
          previous={index > 0 ? entries[index - 1]! : null}
          next={index + 1 < entries.length ? entries[index + 1]! : null}
          onChoose={choose}
        />
      ) : (
        <StageEmpty locale={locale} site={site} onChoose={openFilterDrawer} onRetry={() => setSiteAttempt((value) => value + 1)} />
      )}
      {site.kind === "ready" && entries.length > 0 && (
        <StoryList locale={locale} entries={filtered} currentId={advId} onChoose={choose} onReset={hasActiveFilters ? resetFilters : null} />
      )}
      <p className="px-1 text-right text-[11px] font-semibold tracking-wide text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.credit")}</p>
    </div>
  );
}

/** The story screen and its panel; remounted per story, so the panel never shows another story's player. */
function StoryView({ locale, entry, language, onLanguage, previous, next, onChoose }: {
  locale: AppLocale;
  entry: Entry;
  /** The language chosen last (kept across stories that have it). */
  language: StoryLanguage | null;
  onLanguage: (language: StoryLanguage) => void;
  previous: Entry | null;
  next: Entry | null;
  onChoose: (advId: number) => void;
}) {
  const [player, setPlayer] = useState<StoryPlayer | null>(null);
  const [runtimes, setRuntimes] = useState<StoryRuntimes | null>(null);
  // The language the stage is created in; once the story is up, changes go through the player instead.
  const [startLanguage, setStartLanguage] = useState(() => storyLanguageFor(locale, entry.site, language));
  const [shown, setShown] = useState<StoryLanguage>(startLanguage);
  const [switching, setSwitching] = useState(false);
  const languages = useMemo(() => STORY_LANGUAGES.filter((code) => entry.site.languages.includes(code)), [entry.site.languages]);
  const eyebrow = [entry.groupTitle, entry.episodeLabel].filter(Boolean).join(" · ");
  const bytes = storyDownloadBytes(entry.site, shown);

  const pickLanguage = (code: StoryLanguage) => {
    if (code === shown || switching) return;
    onLanguage(code);
    setShown(code);
    if (!player || player.disposed) {
      setStartLanguage(code);
      return;
    }
    setSwitching(true);
    player.setLanguage(code).catch(() => undefined).finally(() => setSwitching(false));
  };

  return (
    <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_19rem] @4xl:items-start">
      <StoryStage
        key={startLanguage}
        locale={locale}
        manifest={entry.site.manifest}
        language={startLanguage}
        controlsLanguage={storyControlsLanguage(locale)}
        title={entry.title}
        onReady={(created, loaded) => {
          setPlayer(created);
          setRuntimes(loaded);
        }}
      />
      <aside className="mn-paper space-y-4 p-4" aria-label={t(locale, "storyPlayer.panelLabel")}>
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-black text-[var(--mn-accent)]">{eyebrow}</p>}
          <h2 className="mt-1 font-[var(--mn-font-display)] text-lg font-bold text-[var(--mn-text)]">{entry.title || `ADV ${entry.advId}`}</h2>
          <p className="mt-1 font-mono text-[10px] text-[var(--mn-text-muted)]">
            ADV {entry.advId}{bytes > 0 ? ` · ${formatMegabytes(bytes)}` : ""}
          </p>
        </div>

        {languages.length > 1 && (
          <ControlGroup title={t(locale, "storyPlayer.language")}>
            <div className="flex flex-wrap gap-1.5">
              {languages.map((code) => (
                <button key={code} type="button" aria-pressed={code === shown} disabled={switching} onClick={() => pickLanguage(code)} className={pillClass(code === shown)}>
                  {t(locale, `storyPlayer.languages.${code}`)}
                </button>
              ))}
            </div>
          </ControlGroup>
        )}

        <ControlGroup title={t(locale, "storyPlayer.episodes")}>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={!previous} onClick={() => previous && onChoose(previous.advId)} title={previous?.title} className={`${pillClass(false)} justify-center disabled:opacity-40`}>
              {t(locale, "storyPlayer.previous")}
            </button>
            <button type="button" disabled={!next} onClick={() => next && onChoose(next.advId)} title={next?.title} className={`${pillClass(false)} justify-center disabled:opacity-40`}>
              {t(locale, "storyPlayer.next")}
            </button>
          </div>
          {entry.category !== "other" && (
            <a href={localizePath(`/story/${entry.advId}`, locale)} className={`${pillClass(false)} w-full justify-center`}>{t(locale, "storyPlayer.readText")}</a>
          )}
        </ControlGroup>

        <ControlGroup title={t(locale, "storyPlayer.controlsTitle")}>
          <p className="text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.controlsHint")}</p>
          {runtimes && !runtimes.motionSync && <p className="text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.noMotionSync")}</p>}
          {runtimes && !runtimes.spine && entry.category === "home" && <p className="text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.noSpine")}</p>}
        </ControlGroup>
      </aside>
    </div>
  );
}

/** The site's episodes in groups (a chapter, a bond, a spot), as the story pages list them. */
function StoryList({ locale, entries, currentId, onChoose, onReset }: {
  locale: AppLocale;
  entries: Entry[];
  currentId: number | null;
  onChoose: (advId: number) => void;
  onReset: (() => void) | null;
}) {
  const groups = useMemo(() => {
    const output: Array<{ key: string; title: string; entries: Entry[] }> = [];
    for (const entry of entries) {
      const last = output.at(-1);
      if (last && last.key === `${entry.category}:${entry.groupId}`) last.entries.push(entry);
      else output.push({ key: `${entry.category}:${entry.groupId}`, title: entry.groupTitle || t(locale, `storyPlayer.category.${entry.category}`), entries: [entry] });
    }
    return output;
  }, [entries, locale]);

  if (entries.length === 0) {
    return (
      <section className="mn-paper p-6 text-center">
        <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.noMatches")}</p>
        {onReset && <button type="button" onClick={onReset} className={`${pillClass(false)} mt-3`}>{t(locale, "filter.reset")}</button>}
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label={t(locale, "storyPlayer.listLabel")}>
      {groups.map((group) => (
        <div key={group.key} className="mn-paper p-4">
          <h3 className="text-sm font-black text-[var(--mn-text)]">{group.title}</h3>
          <ul className="mt-2 grid gap-1.5 @xl:grid-cols-2 @4xl:grid-cols-3">
            {group.entries.map((entry) => (
              <li key={entry.advId}>
                <button
                  type="button"
                  onClick={() => onChoose(entry.advId)}
                  aria-current={entry.advId === currentId ? "true" : undefined}
                  className={`${pillClass(entry.advId === currentId)} w-full gap-2 text-left`}
                >
                  {entry.episodeLabel && <span className="shrink-0 text-[10px] font-black opacity-70">{entry.episodeLabel}</span>}
                  <span className="truncate">{entry.title || `ADV ${entry.advId}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** What the player is: the game's own story data, played in a browser. */
function Notice({ locale }: { locale: AppLocale }) {
  return (
    <aside className="flex gap-3 rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-accent-soft)] p-4 text-xs font-semibold leading-relaxed text-[var(--mn-ink-soft)]" aria-label={t(locale, "storyPlayer.noticeTitle")}>
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mn-accent-deep)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
      </svg>
      <p>
        <strong className="text-[var(--mn-text)]">{t(locale, "storyPlayer.noticeTitle")}</strong>
        <span className="mx-1.5 text-[var(--mn-text-muted)]">·</span>
        {t(locale, "storyPlayer.notice")}
      </p>
    </aside>
  );
}

function StageEmpty({ locale, site, onChoose, onRetry }: { locale: AppLocale; site: SiteState; onChoose: () => void; onRetry: () => void }) {
  const empty = site.kind === "ready" && site.entries.length === 0;
  return (
    <div className="relative grid aspect-[13/6] w-full place-items-center overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[linear-gradient(180deg,var(--mn-cream-deep),var(--mn-paper))] px-6 text-center shadow-[var(--mn-shadow-stamp)]">
      <StageSignature />
      <div className="relative">
        {site.kind === "loading" && <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.listLoading")}</p>}
        {site.kind === "error" && (
          <>
            <p className="text-sm font-bold text-[var(--mn-rose)]">{t(locale, "storyPlayer.listError")}</p>
            <button type="button" onClick={onRetry} className={`${pillClass(false)} mt-4`}>{t(locale, "storyPlayer.retry")}</button>
          </>
        )}
        {empty && <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.listEmpty")}</p>}
        {site.kind === "ready" && !empty && (
          <>
            <h2 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">{t(locale, "storyPlayer.emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-6 text-[var(--mn-text-muted)] sm:text-sm">{t(locale, "storyPlayer.emptyDescription")}</p>
            <button
              type="button"
              onClick={onChoose}
              className="mn-focus mn-stamp-press mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--mn-accent)] px-6 py-3 text-sm font-bold text-white shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-accent-deep)]"
            >
              {t(locale, "storyPlayer.filterTitle")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mn-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function pillClass(active: boolean): string {
  return `mn-focus inline-flex items-center rounded-full border-[1.5px] px-3 py-1.5 text-xs font-bold transition ${
    active
      ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
      : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]"
  }`;
}
