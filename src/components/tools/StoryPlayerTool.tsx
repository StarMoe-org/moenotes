import { useCallback, useEffect, useMemo, useState, type ReactNode, type Ref } from "react";
import type { StoryPlayer } from "ournotes-player/story";
import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import Modal from "@/components/shared/Modal";
import Popover from "@/components/shared/Popover";
import { getAssetUrl } from "@/lib/assets/url";
import { fetchSiteStory, fetchStorySite, type StoryRuntimes } from "@/lib/story/player-client";
import {
  buildStoryPlayerEntries,
  formatMegabytes,
  getStoryPlayerHref,
  parseStoryPlayerSearch,
  STORY_LANGUAGES,
  storyDownloadBytes,
  storyLanguageFor,
  type StoryLanguage,
  type StoryPickerStory,
  type StoryPlayerEntry,
  type StorySiteEntry,
} from "@/lib/story/player-data";
import StoryStage from "@/components/tools/StoryStage";
import StoryPickerDialog from "@/components/tools/StoryPickerDialog";
import { StageSignature } from "@/components/tools/Live2DStage";
import {
  AutoIcon,
  ChevronIcon,
  FastForwardIcon,
  FullscreenIcon,
  InfoIcon,
  LanguageIcon,
  NextLineIcon,
  PlayIcon,
  SettingsIcon,
  SkipIcon,
  StoryListIcon,
} from "@/components/tools/story-icons";

interface Props {
  locale: AppLocale;
  /** Every episode of the build's story data, in the story pages' order, with localized names. */
  stories: StoryPickerStory[];
}

type SiteState = { kind: "loading" } | { kind: "error"; detail: string } | { kind: "ready"; entries: StorySiteEntry[] };

/**
 * The story player: the chosen episode's header (banner, title, language, neighbours), its story screen, and the
 * picker of the episodes the story site has (the story pages' lists) and the controls' help in dialogs.
 */
export default function StoryPlayerTool({ locale, stories }: Props) {
  const [site, setSite] = useState<SiteState>({ kind: "loading" });
  const [siteAttempt, setSiteAttempt] = useState(0);
  const [advId, setAdvId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [language, setLanguage] = useState<StoryLanguage | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [runtimes, setRuntimes] = useState<StoryRuntimes | null>(null);
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

  const entries = useMemo<StoryPlayerEntry[]>(() => {
    if (site.kind !== "ready") return [];
    const siteEntries = linked && !site.entries.some((entry) => entry.advId === linked.advId) ? [...site.entries, linked] : site.entries;
    return buildStoryPlayerEntries(stories, siteEntries, locale, t(locale, "storyPlayer.otherEpisodes"));
  }, [site, linked, stories, locale]);

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

  // Shareable address of the episode shown; a dialog's own history entry is left alone.
  const dialogOpen = pickerOpen || infoOpen;
  useEffect(() => {
    if (!restored || dialogOpen) return;
    replaceUrl(getStoryPlayerHref(locale, advId ?? undefined));
  }, [restored, dialogOpen, advId, locale]);

  const choose = useCallback((id: number) => {
    setAdvId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const openPicker = useCallback(() => setPickerOpen(true), []);
  const openInfo = useCallback(() => setInfoOpen(true), []);

  return (
    <div className="space-y-3 @container">
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
          onPick={openPicker}
          onInfo={openInfo}
          onRuntimes={setRuntimes}
        />
      ) : (
        <StageEmpty locale={locale} site={site} onChoose={openPicker} onInfo={openInfo} onRetry={() => setSiteAttempt((value) => value + 1)} />
      )}
      <p className="px-1 text-right text-[11px] font-semibold tracking-wide text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.credit")}</p>

      <StoryPickerDialog locale={locale} entries={entries} open={pickerOpen} onClose={() => setPickerOpen(false)} currentId={advId} onSelect={choose} />
      <StoryInfoDialog locale={locale} open={infoOpen} onClose={() => setInfoOpen(false)} runtimes={runtimes} />
    </div>
  );
}

/** The episode's header and its story screen; remounted per story, so the header never shows another story's player. */
function StoryView({ locale, entry, language, onLanguage, previous, next, onChoose, onPick, onInfo, onRuntimes }: {
  locale: AppLocale;
  entry: StoryPlayerEntry;
  /** The language chosen last (kept across stories that have it). */
  language: StoryLanguage | null;
  onLanguage: (language: StoryLanguage) => void;
  previous: StoryPlayerEntry | null;
  next: StoryPlayerEntry | null;
  onChoose: (advId: number) => void;
  onPick: () => void;
  onInfo: () => void;
  onRuntimes: (runtimes: StoryRuntimes) => void;
}) {
  const [player, setPlayer] = useState<StoryPlayer | null>(null);
  // The language the stage is created in; once the story is up, changes go through the player instead.
  const [startLanguage, setStartLanguage] = useState(() => storyLanguageFor(locale, entry.site, language));
  const [shown, setShown] = useState<StoryLanguage>(startLanguage);
  const [switching, setSwitching] = useState(false);
  const languages = useMemo(() => STORY_LANGUAGES.filter((code) => entry.site.languages.includes(code)), [entry.site.languages]);

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
    <>
      <StoryHeader
        locale={locale}
        entry={entry}
        languages={languages}
        language={shown}
        switching={switching}
        onLanguage={pickLanguage}
        previous={previous}
        next={next}
        onChoose={onChoose}
        onPick={onPick}
        onInfo={onInfo}
      />
      <StoryStage
        key={startLanguage}
        locale={locale}
        manifest={entry.site.manifest}
        language={startLanguage}
        title={entry.title}
        simple={entry.site.playbackMode === 1}
        nextEpisode={next ? next.title || `ADV ${next.advId}` : null}
        onNextEpisode={() => next && onChoose(next.advId)}
        onReady={(created, loaded) => {
          setPlayer(created);
          onRuntimes(loaded);
        }}
      />
    </>
  );
}

/** Banner, group and title of the episode (a link to its story page), with its language, neighbours and the picker. */
function StoryHeader({ locale, entry, languages, language, switching, onLanguage, previous, next, onChoose, onPick, onInfo }: {
  locale: AppLocale;
  entry: StoryPlayerEntry;
  languages: StoryLanguage[];
  language: StoryLanguage;
  switching: boolean;
  onLanguage: (language: StoryLanguage) => void;
  previous: StoryPlayerEntry | null;
  next: StoryPlayerEntry | null;
  onChoose: (advId: number) => void;
  onPick: () => void;
  onInfo: () => void;
}) {
  const episode = [entry.episodeLabel, entry.episodeNote].filter(Boolean).join(" ");
  const eyebrow = [entry.groupTitle, episode].filter(Boolean).join(" · ");
  const bytes = storyDownloadBytes(entry.site, language);
  const title = entry.title || `ADV ${entry.advId}`;
  const summary = (
    <>
      <EpisodeArtwork locale={locale} entry={entry} />
      <span className="min-w-0">
        {eyebrow && <span className="block truncate text-[11px] font-black text-[var(--mn-accent)]">{eyebrow}</span>}
        <span className="mt-0.5 line-clamp-2 font-[var(--mn-font-display)] text-base font-bold text-[var(--mn-text)] transition-colors group-hover:text-[var(--mn-accent-deep)] sm:text-lg">{title}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-[var(--mn-text-muted)]">ADV {entry.advId}{bytes > 0 ? ` · ${formatMegabytes(bytes)}` : ""}</span>
      </span>
    </>
  );

  return (
    <div className="mn-paper flex flex-col gap-3 p-3 sm:p-4 @3xl:flex-row @3xl:items-center">
      {entry.category === "other" ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{summary}</div>
      ) : (
        <a href={localizePath(`/story/${entry.advId}`, locale)} title={t(locale, "storyPlayer.readText")} className="mn-focus group flex min-w-0 flex-1 items-center gap-3 rounded-xl">
          {summary}
        </a>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex gap-1">
          <IconButton label={previous ? `${t(locale, "storyPlayer.previous")}: ${previous.title}` : t(locale, "storyPlayer.previous")} disabled={!previous} onClick={() => previous && onChoose(previous.advId)}>
            <ChevronIcon direction="left" className="h-4 w-4" />
          </IconButton>
          <IconButton label={next ? `${t(locale, "storyPlayer.next")}: ${next.title}` : t(locale, "storyPlayer.next")} disabled={!next} onClick={() => next && onChoose(next.advId)}>
            <ChevronIcon direction="right" className="h-4 w-4" />
          </IconButton>
        </div>
        {languages.length > 0 && <LanguageSelect locale={locale} languages={languages} value={language} busy={switching} onChange={onLanguage} />}
        <IconButton label={t(locale, "storyPlayer.info.title")} onClick={onInfo}>
          <InfoIcon className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={onPick}
          className="mn-focus mn-stamp-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--mn-accent)] px-4 text-sm font-bold text-white shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-accent-deep)]"
        >
          <StoryListIcon className="h-4 w-4" />
          {t(locale, "storyPlayer.chooseStory")}
        </button>
      </div>
    </div>
  );
}

/** The episode's banner; a plain tile for episodes without one (the other talks) or when it cannot be loaded. */
function EpisodeArtwork({ locale, entry }: { locale: AppLocale; entry: StoryPlayerEntry }) {
  const [failed, setFailed] = useState(false);
  const url = entry.image ? getAssetUrl({ path: `${entry.image}.png`, type: "raw", locale }) : "";
  const box = "h-14 w-24 shrink-0 rounded-xl border-[1.5px] border-[var(--mn-border)] sm:h-16 sm:w-28";
  if (!url || failed) {
    return (
      <span className={`${box} grid place-items-center bg-[linear-gradient(135deg,var(--mn-accent-soft),var(--mn-cream-deep))] text-[var(--mn-accent-deep)]`} aria-hidden="true">
        <StoryListIcon className="h-6 w-6 opacity-70" />
      </span>
    );
  }
  return <img src={url} alt="" onError={() => setFailed(true)} className={`${box} bg-[var(--mn-cream-deep)] object-cover`} />;
}

/** The story languages the episode has, as a compact dropdown. */
function LanguageSelect({ locale, languages, value, busy, onChange }: {
  locale: AppLocale;
  languages: StoryLanguage[];
  value: StoryLanguage;
  busy: boolean;
  onChange: (language: StoryLanguage) => void;
}) {
  const label = t(locale, `storyPlayer.languages.${value}`);
  const name = `${t(locale, "storyPlayer.language")}: ${label}`;
  return (
    <Popover
      align="end"
      minWidth={150}
      trigger={({ ref, onClick, ...aria }) => (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          {...aria}
          disabled={busy || languages.length < 2}
          aria-busy={busy}
          aria-label={name}
          title={name}
          className={`${PILL} gap-1.5 px-3 disabled:cursor-default`}
        >
          <LanguageIcon className="h-4 w-4 shrink-0 text-[var(--mn-accent-deep)]" />
          <span>{label}</span>
          {busy
            ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--mn-accent)] border-t-transparent" aria-hidden="true" />
            : languages.length > 1 && <ChevronIcon direction="down" className="h-3.5 w-3.5 opacity-60" />}
        </button>
      )}
    >
      {({ close }) => languages.map((code) => (
        <button
          key={code}
          type="button"
          role="menuitemradio"
          aria-checked={code === value}
          onClick={() => {
            onChange(code);
            close();
          }}
          className={`w-full rounded-xl px-4 py-2 text-left text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${code === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
        >
          {t(locale, `storyPlayer.languages.${code}`)}
        </button>
      ))}
    </Popover>
  );
}

/** How to use the player and what it is (and that this site has no voice lip sync when it has none). */
function StoryInfoDialog({ locale, open, onClose, runtimes }: { locale: AppLocale; open: boolean; onClose: () => void; runtimes: StoryRuntimes | null }) {
  // Before a story has loaded the page scripts, the deployment's configuration tells.
  const motionSync = runtimes ? runtimes.motionSync : Boolean(assetConfig.motionSyncCore);
  const legend: Array<{ icon: ReactNode; key: string }> = [
    { icon: <PlayIcon className="h-4 w-4" />, key: "play" },
    { icon: <NextLineIcon className="h-4 w-4" />, key: "next" },
    { icon: <AutoIcon className="h-4 w-4" />, key: "auto" },
    { icon: <FastForwardIcon className="h-4 w-4" />, key: "fastForward" },
    { icon: <SkipIcon className="h-4 w-4" />, key: "skip" },
    { icon: <SettingsIcon className="h-4 w-4" />, key: "settings" },
    { icon: <FullscreenIcon className="h-4 w-4" />, key: "fullscreen" },
  ];
  const keys: Array<{ keys: string[]; key: string }> = [
    { keys: ["Space", "Enter"], key: "next" },
    { keys: ["A"], key: "auto" },
    { keys: ["F"], key: "fastForward" },
    { keys: ["K"], key: "play" },
  ];

  return (
    <Modal isOpen={open} onClose={onClose} title={t(locale, "storyPlayer.info.title")} closeLabel={t(locale, "actions.close")} size="md">
      <div className="space-y-5 text-sm leading-6 text-[var(--mn-text-muted)]">
        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mn-text)]">{t(locale, "storyPlayer.info.controls")}</h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {legend.map((item) => (
              <li key={item.key} className="flex items-start gap-2.5 rounded-xl bg-[var(--mn-surface)] px-3 py-2">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black/85 text-white">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-[var(--mn-text)]">{t(locale, `storyPlayer.info.legend.${item.key}.name`)}</span>
                  <span className="block text-[11px] leading-4">{t(locale, `storyPlayer.info.legend.${item.key}.description`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mn-text)]">{t(locale, "storyPlayer.info.shortcuts")}</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {keys.map((item) => (
              <li key={item.key} className="flex items-center gap-1.5 text-xs">
                {item.keys.map((key, position) => (
                  <span key={key} className="flex items-center gap-1.5">
                    {position > 0 && <span aria-hidden="true">/</span>}
                    <kbd className="rounded-md border border-b-2 border-[var(--mn-border)] bg-[var(--mn-paper)] px-1.5 py-px font-mono text-[11px] font-bold text-[var(--mn-text)]">{key}</kbd>
                  </span>
                ))}
                <span>{t(locale, `storyPlayer.info.legend.${item.key}.name`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mn-text)]">{t(locale, "storyPlayer.info.about")}</h3>
          <p>{t(locale, "storyPlayer.notice")}</p>
          {!motionSync && <Note>{t(locale, "storyPlayer.noMotionSync")}</Note>}
        </section>
      </div>
    </Modal>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-accent-soft)] px-3 py-2 text-xs leading-5 text-[var(--mn-ink-soft)]">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mn-accent-deep)]" />
      <span>{children}</span>
    </p>
  );
}

function StageEmpty({ locale, site, onChoose, onInfo, onRetry }: { locale: AppLocale; site: SiteState; onChoose: () => void; onInfo: () => void; onRetry: () => void }) {
  const empty = site.kind === "ready" && site.entries.length === 0;
  return (
    <div className="relative grid aspect-[13/6] min-h-64 w-full place-items-center overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[linear-gradient(180deg,var(--mn-cream-deep),var(--mn-paper))] px-6 text-center shadow-[var(--mn-shadow-stamp)]">
      <StageSignature />
      <div className="relative">
        {site.kind === "loading" && <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.listLoading")}</p>}
        {site.kind === "error" && (
          <>
            <p className="text-sm font-bold text-[var(--mn-rose)]">{t(locale, "storyPlayer.listError")}</p>
            <button type="button" onClick={onRetry} className={`${PILL} mt-4 px-4`}>{t(locale, "storyPlayer.retry")}</button>
          </>
        )}
        {empty && <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "storyPlayer.listEmpty")}</p>}
        {site.kind === "ready" && !empty && (
          <>
            <h2 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">{t(locale, "storyPlayer.emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-6 text-[var(--mn-text-muted)] sm:text-sm">{t(locale, "storyPlayer.emptyDescription")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onChoose}
                className="mn-focus mn-stamp-press inline-flex items-center gap-2 rounded-full bg-[var(--mn-accent)] px-6 py-3 text-sm font-bold text-white shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-accent-deep)]"
              >
                <StoryListIcon className="h-4 w-4" />
                {t(locale, "storyPlayer.chooseStory")}
              </button>
              <button type="button" onClick={onInfo} className={`${PILL} gap-1.5 px-4`}>
                <InfoIcon className="h-4 w-4" />
                {t(locale, "storyPlayer.info.title")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`${PILL} w-9 justify-center disabled:opacity-40`}>
      {children}
    </button>
  );
}

const PILL = "mn-focus inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-xs font-bold text-[var(--mn-text)] transition enabled:hover:border-[var(--mn-accent)] enabled:hover:text-[var(--mn-accent-deep)]";

/**
 * Replaces the address of the current history entry. A closing modal leaves its own entry with `history.back()`,
 * which lands after this runs; the address is then written once that navigation is done.
 */
function replaceUrl(href: string) {
  const apply = () => {
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
  };
  if (window.history.state?.modal) window.addEventListener("popstate", apply, { once: true });
  else apply();
}
