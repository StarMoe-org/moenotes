import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import { FilterButton } from "@/components/shared/BaseFilters";
import { getAssetUrl } from "@/lib/assets/url";
import type { StoryEpisodeKind } from "@/lib/story/data";
import { STORY_SECTIONS, type StoryPlayerEntry, type StorySection } from "@/lib/story/player-data";

interface StoryPickerDialogProps {
  locale: AppLocale;
  /** The site's episodes in the story pages' order. */
  entries: readonly StoryPlayerEntry[];
  open: boolean;
  onClose: () => void;
  currentId: number | null;
  onSelect: (advId: number) => void;
}

type OtherCategory = StoryPlayerEntry["category"];

/**
 * The episode picker: the story pages' three lists (main story by chapter, bond stories by pair, the other talks by
 * spot or cast) with each episode's banner and title, a search over all of them, and the current episode marked.
 */
export default function StoryPickerDialog({ locale, entries, open, onClose, currentId, onSelect }: StoryPickerDialogProps) {
  // Lives outside the modal body, so the tab and the search survive closing and reopening.
  const [section, setSection] = useState<StorySection>("main");
  const [query, setQuery] = useState("");
  const [others, setOthers] = useState<OtherCategory[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const current = useMemo(() => entries.find((entry) => entry.advId === currentId) ?? null, [entries, currentId]);

  // Opening shows the current episode's list (only then: the tabs are the viewer's afterwards).
  useEffect(() => {
    if (open && current) setSection(current.section);
  }, [open]);

  const needle = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => (needle ? entries.filter((entry) => entry.searchText.includes(needle)) : entries), [entries, needle]);
  const counts = useMemo(() => {
    const result: Record<StorySection, number> = { main: 0, event: 0, friendship: 0, other: 0 };
    for (const entry of matches) result[entry.section] += 1;
    return result;
  }, [matches]);
  const otherCategories = useMemo(() => [...new Set(entries.filter((entry) => entry.section === "other").map((entry) => entry.category))], [entries]);
  const shown = useMemo(
    () => matches.filter((entry) => entry.section === section && (section !== "other" || others.length === 0 || others.includes(entry.category))),
    [matches, section, others],
  );
  const groups = useMemo(() => groupEntries(shown), [shown]);

  useEffect(() => {
    if (!open || currentId === null) return;
    // After the panel has mounted: bring the current episode into view.
    const frame = requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-adv-id="${currentId}"]`)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, currentId, section]);

  const pick = (advId: number) => {
    onSelect(advId);
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={t(locale, "storyPlayer.chooseStory")} closeLabel={t(locale, "actions.close")} size="xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div role="tablist" aria-label={t(locale, "storyPlayer.sections")} className="grid shrink-0 grid-cols-3 gap-1 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-1">
            {STORY_SECTIONS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={section === key}
                onClick={() => setSection(key)}
                className={`mn-focus inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition sm:px-4 sm:text-sm ${
                  section === key ? "bg-[var(--mn-accent)] text-white shadow-[var(--mn-shadow-stamp-sm)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"
                }`}
              >
                {t(locale, `story.categories.${key}`)}
                <span className={`font-mono text-[10px] ${section === key ? "text-white/80" : "text-[var(--mn-text-muted)]"}`}>{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t(locale, "filter.search")}</span>
            <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--mn-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(locale, "storyPlayer.searchPlaceholder")}
              className="w-full min-w-0 rounded-full border border-[var(--mn-border)] bg-[var(--mn-surface)] py-2 pl-11 pr-4 text-sm text-[var(--mn-text)] placeholder:text-[var(--mn-text-muted)] focus:border-[var(--mn-accent)] focus:bg-[var(--mn-paper)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--mn-accent)_20%,transparent)]"
            />
          </label>
        </div>

        {section === "other" && otherCategories.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "storyPlayer.categoryTitle")}>
            <FilterButton active={others.length === 0} onClick={() => setOthers([])}>ALL</FilterButton>
            {otherCategories.map((category) => (
              <FilterButton
                key={category}
                active={others.includes(category)}
                onClick={() => setOthers((previous) => (previous.includes(category) ? previous.filter((item) => item !== category) : [...previous, category]))}
              >
                {categoryLabel(locale, category)}
              </FilterButton>
            ))}
          </div>
        )}

        <div ref={listRef} role="tabpanel" aria-label={t(locale, `story.categories.${section}`)} className="space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-8 text-center">
              <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.noMatches")}</p>
              {(query || others.length > 0) && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setOthers([]); }}
                  className="mn-focus mt-3 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-1.5 text-xs font-bold text-[var(--mn-text)] hover:border-[var(--mn-accent)]"
                >
                  {t(locale, "filter.reset")}
                </button>
              )}
            </div>
          ) : (
            groups.map((group) => <EpisodeGroup key={group.key} locale={locale} group={group} currentId={currentId} onPick={pick} />)
          )}
        </div>
      </div>
    </Modal>
  );
}

interface Group {
  key: string;
  section: StorySection;
  title: string;
  subtitle: string;
  image: string;
  entries: StoryPlayerEntry[];
}

/**
 * The episodes of each group, in the order the groups first appear (the entries come in the story pages' order): a
 * chapter or a bond pair; the other talks by type, as the story pages' other list shows them. Every group is listed
 * once (its key is the list's React key).
 */
function groupEntries(entries: readonly StoryPlayerEntry[]): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of entries) {
    const other = entry.section === "other";
    const key = other ? `other:${entry.category}` : `${entry.category}:${entry.groupId}`;
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, {
      key, section: entry.section, title: other ? "" : entry.groupTitle, subtitle: entry.groupSubtitle, image: entry.groupImage, entries: [entry],
    });
  }
  return [...groups.values()];
}

function EpisodeGroup({ locale, group, currentId, onPick }: { locale: AppLocale; group: Group; currentId: number | null; onPick: (advId: number) => void }) {
  const title = group.title || categoryLabel(locale, group.entries[0]?.category ?? "other");
  // A chapter's main, another and extra episodes each number from 1: listed as separate runs, as on the story pages.
  const runs = group.section === "main"
    ? (["main", "another", "extra"] as const)
      .map((kind) => ({ kind, entries: group.entries.filter((entry) => (entry.episodeKind ?? "main") === kind) }))
      .filter((run) => run.entries.length > 0)
    : [{ kind: "main" as StoryEpisodeKind, entries: group.entries }];
  const imageUrl = group.image ? getAssetUrl({ path: `${group.image}.png`, type: "raw", locale }) : "";

  return (
    <section className="overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-sm)]">
      <header className="flex items-center gap-3 border-b-[1.5px] border-[var(--mn-border)] px-4 py-3">
        {imageUrl && <HidingImage src={imageUrl} className="aspect-[3/1] w-28 shrink-0 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover sm:w-36" />}
        <div className="min-w-0">
          {group.subtitle && <p className="truncate text-[11px] font-black uppercase tracking-wider text-[var(--mn-accent)]">{group.subtitle}</p>}
          <h3 className="line-clamp-2 text-sm font-black text-[var(--mn-text)] sm:text-base">{title}</h3>
        </div>
      </header>
      <div className="space-y-3 bg-[var(--mn-surface)] p-3 sm:p-4">
        {runs.map((run) => (
          <div key={run.kind}>
            {run.kind !== "main" && (
              <h4 className="mb-2 text-[11px] font-black uppercase tracking-wider text-[var(--mn-text-muted)]">
                {t(locale, run.kind === "another" ? "story.ui.anotherStories" : "story.ui.extraStories")}
              </h4>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {run.entries.map((entry) => (
                <li key={entry.advId}>
                  <EpisodeOption locale={locale} entry={entry} current={entry.advId === currentId} onPick={() => onPick(entry.advId)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function EpisodeOption({ locale, entry, current, onPick }: { locale: AppLocale; entry: StoryPlayerEntry; current: boolean; onPick: () => void }) {
  const imageUrl = entry.image ? getAssetUrl({ path: `${entry.image}.png`, type: "raw", locale }) : "";
  // The other talks are listed by type: their spot or cast names them (the site's own episodes, their id).
  const label = entry.section === "other"
    ? entry.category === "other" ? `ADV ${entry.advId}` : entry.groupTitle
    : entry.episodeLabel;
  return (
    <button
      type="button"
      onClick={onPick}
      data-adv-id={entry.advId}
      aria-current={current ? "true" : undefined}
      className={`mn-focus group flex h-full w-full min-w-0 items-center gap-3 rounded-2xl border-[1.5px] bg-[var(--mn-paper)] p-2 text-left shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp)] ${
        current ? "border-[var(--mn-accent)] ring-2 ring-[var(--mn-accent)]" : "border-[var(--mn-border)]"
      } ${imageUrl ? "" : "px-3"}`}
    >
      {imageUrl && <HidingImage src={imageUrl} className="h-14 w-24 shrink-0 rounded-xl bg-[var(--mn-cream-deep)] object-cover" />}
      <span className="min-w-0 flex-1">
        {(label || current) && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-black text-[var(--mn-accent)]">
            {label && <span className="truncate">{label}{entry.episodeNote && <span className="ml-1.5 font-bold text-[var(--mn-text-muted)]">{entry.episodeNote}</span>}</span>}
            {current && <span className="shrink-0 rounded-full bg-[var(--mn-accent)] px-1.5 py-px text-[9px] text-white">{t(locale, "storyPlayer.playing")}</span>}
          </span>
        )}
        <span className={`mt-0.5 line-clamp-2 text-sm font-black ${current ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]"}`}>
          {entry.title || `ADV ${entry.advId}`}
        </span>
      </span>
    </button>
  );
}

/** An artwork that leaves the layout when it cannot be loaded (some banners are missing from the asset server). */
function HidingImage({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

function categoryLabel(locale: AppLocale, category: OtherCategory): string {
  if (category === "other") return t(locale, "storyPlayer.otherEpisodes");
  if (category === "live-result") return t(locale, "story.categories.liveResult");
  return t(locale, `story.categories.${category}`);
}
