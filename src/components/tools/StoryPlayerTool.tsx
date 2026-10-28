"use client";

import SiriusLoader, { SiriusIcon } from "@/components/shared/SiriusLoader";
import { useCallback, useEffect, useMemo, useState, type ReactNode, type Ref } from "react";
import type { StoryPlayer } from "ournotes-player/story";
import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import Modal from "@/components/shared/Modal";
import Popover from "@/components/shared/Popover";
import { fetchSiteStory, fetchStorySite, type StoryRuntimes } from "@/lib/story/player-client";
import {
  buildStoryPlayerEntries,
  formatMegabytes,
  getStoryManifestUrl,
  getStoryPlayerHref,
  getStoryPlayerArtworkUrl,
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
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";
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

  const { showSpoiler, now } = useSpoilerSetting();
  const visibleEntries = useMemo(() => {
    if (showSpoiler || now === null) return entries;
    return entries.filter((entry) => !entry.startAt || !isSpoiler(entry.startAt, now));
  }, [entries, showSpoiler, now]);
  const rawCurrent = useMemo(() => entries.find((entry) => entry.advId === advId) ?? null, [entries, advId]);
  const isUnreleased = Boolean(now !== null && rawCurrent?.startAt && isSpoiler(rawCurrent.startAt, now));
  const index = useMemo(() => visibleEntries.findIndex((entry) => entry.advId === advId), [visibleEntries, advId]);
  const current = !showSpoiler && isUnreleased ? null : (index >= 0 ? visibleEntries[index]! : rawCurrent);

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
      {!showSpoiler && isUnreleased ? (
        <SpoilerNotice locale={locale} />
      ) : current ? (
        <StoryView
          key={current.advId}
          locale={locale}
          entry={current}
          language={language}
          onLanguage={setLanguage}
          previous={index > 0 ? visibleEntries[index - 1]! : null}
          next={index + 1 < visibleEntries.length ? visibleEntries[index + 1]! : null}
          onChoose={choose}
          onPick={openPicker}
          onInfo={openInfo}
          onRuntimes={setRuntimes}
        />
      ) : (
        <StageEmpty locale={locale} site={site} onChoose={openPicker} onInfo={openInfo} onRetry={() => setSiteAttempt((value) => value + 1)} />
      )}
      <p className="px-1 text-right text-label-small text-on-surface-variant">{t(locale, "storyPlayer.credit")}</p>

      <StoryPickerDialog locale={locale} entries={visibleEntries} open={pickerOpen} onClose={() => setPickerOpen(false)} currentId={advId} onSelect={choose} />
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
        manifest={getStoryManifestUrl(entry.site.root, entry.site.manifest)}
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
        {eyebrow && <span className="block truncate text-label-small text-primary">{eyebrow}</span>}
        <span className="mt-0.5 line-clamp-2 font-[var(--md-ref-typeface-brand)] text-title-medium text-on-surface transition-colors group-hover:text-primary sm:text-title-large">{title}</span>
        <span className="mt-0.5 block font-mono text-label-small text-on-surface-variant">ADV {entry.advId}{bytes > 0 ? ` · ${formatMegabytes(bytes)}` : ""}</span>
      </span>
    </>
  );

  return (
    <div className="md3-surface flex flex-col gap-3 p-3 sm:p-4 @3xl:flex-row @3xl:items-center">
      {entry.category === "other" ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{summary}</div>
      ) : (
        <a href={localizePath(`/story/${entry.advId}`, locale)} title={t(locale, "storyPlayer.readText")} className="group flex min-w-0 flex-1 items-center gap-3 rounded-shape-md">
          {summary}
        </a>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex gap-1">
          <IconButton label={previous ? `${t(locale, "storyPlayer.previous")}: ${previous.title}` : t(locale, "storyPlayer.previous")} disabled={!previous} onClick={() => previous && onChoose(previous.advId)}>
            <ChevronIcon direction="left" className="" />
          </IconButton>
          <IconButton label={next ? `${t(locale, "storyPlayer.next")}: ${next.title}` : t(locale, "storyPlayer.next")} disabled={!next} onClick={() => next && onChoose(next.advId)}>
            <ChevronIcon direction="right" className="" />
          </IconButton>
        </div>
        {languages.length > 0 && <LanguageSelect locale={locale} languages={languages} value={language} busy={switching} onChange={onLanguage} />}
        <IconButton label={t(locale, "storyPlayer.info.title")} onClick={onInfo}>
          <InfoIcon className="" />
        </IconButton>
        <button
          type="button"
          onClick={onPick}
          className="md3-button md3-button--filled"
        >
          <StoryListIcon className="" />
          {t(locale, "storyPlayer.chooseStory")}
        </button>
      </div>
    </div>
  );
}

/** The episode's banner; a plain tile for episodes without one (the other talks) or when it cannot be loaded. */
function EpisodeArtwork({ locale, entry }: { locale: AppLocale; entry: StoryPlayerEntry }) {
  const [failed, setFailed] = useState(false);
  const url = getStoryPlayerArtworkUrl(entry.image, locale, entry.assetServer);
  const box = "h-14 w-24 shrink-0 rounded-shape-md border border-outline-variant sm:h-16 sm:w-28";
  if (!url || failed) {
    return (
      <span className={`${box} grid place-items-center bg-[linear-gradient(135deg,var(--md-sys-color-secondary-container),var(--md-sys-color-surface-container-highest))] text-primary`} aria-hidden="true">
        <StoryListIcon className="h-6 w-6 opacity-70" />
      </span>
    );
  }
  return <img src={url} alt="" onError={() => setFailed(true)} className={`${box} bg-surface-container-highest object-cover`} />;
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
          className="md3-button md3-button--outlined"
        >
          <LanguageIcon className="text-primary" />
          <span>{label}</span>
          {busy
            ? <SiriusIcon className="" />
            : languages.length > 1 && <ChevronIcon direction="down" className="opacity-60" />}
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
          className="md3-menu-item md3-state"
        >
          {t(locale, `storyPlayer.languages.${code}`)}
        </button>
      ))}
    </Popover>
  );
}

/** How to use the player and what it is: the MotionSync Core's license, or that this site has no voice lip sync. */
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
      <div className="space-y-5 text-body-medium leading-6 text-on-surface-variant">
        <section className="space-y-2">
          <h3 className="text-label-medium text-on-surface">{t(locale, "storyPlayer.info.controls")}</h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {legend.map((item) => (
              <li key={item.key} className="flex items-start gap-2.5 rounded-shape-md bg-surface-container px-3 py-2">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black/85 text-white">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-label-medium text-on-surface">{t(locale, `storyPlayer.info.legend.${item.key}.name`)}</span>
                  <span className="block text-label-small leading-4">{t(locale, `storyPlayer.info.legend.${item.key}.description`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-label-medium text-on-surface">{t(locale, "storyPlayer.info.shortcuts")}</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {keys.map((item) => (
              <li key={item.key} className="flex items-center gap-1.5 text-body-small">
                {item.keys.map((key, position) => (
                  <span key={key} className="flex items-center gap-1.5">
                    {position > 0 && <span aria-hidden="true">/</span>}
                    <kbd className="rounded-shape-sm border border-b-2 border-outline-variant bg-surface-container-low px-1.5 py-px font-mono text-label-small text-on-surface">{key}</kbd>
                  </span>
                ))}
                <span>{t(locale, `storyPlayer.info.legend.${item.key}.name`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-label-medium text-on-surface">{t(locale, "storyPlayer.info.about")}</h3>
          <p>{t(locale, "storyPlayer.notice")}</p>
          {motionSync ? (
            <Note>
              {t(locale, "storyPlayer.motionSyncLicense")}{" "}
              <a href={assetConfig.motionSyncLicense} target="_blank" rel="noreferrer" className="font-bold text-primary underline underline-offset-2">
                {t(locale, "storyPlayer.motionSyncLicenseLink")}
              </a>
            </Note>
          ) : (
            <Note>{t(locale, "storyPlayer.noMotionSync")}</Note>
          )}
        </section>
      </div>
    </Modal>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-shape-md border border-outline-variant bg-secondary-container px-3 py-2 text-body-small leading-5 text-on-surface-variant">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}

function StageEmpty({ locale, site, onChoose, onInfo, onRetry }: { locale: AppLocale; site: SiteState; onChoose: () => void; onInfo: () => void; onRetry: () => void }) {
  const empty = site.kind === "ready" && site.entries.length === 0;
  return (
    <div className="relative grid aspect-[13/6] min-h-64 w-full place-items-center overflow-hidden rounded-shape-lg border border-outline-variant bg-[linear-gradient(180deg,var(--md-sys-color-surface-container-highest),var(--md-sys-color-surface-container-low))] px-6 text-center shadow-elevation-1">
      <StageSignature />
      <div className="relative">
        {site.kind === "loading" && <SiriusLoader locale={locale} compact label={t(locale, "storyPlayer.listLoading")} />}
        {site.kind === "error" && (
          <>
            <p className="text-label-large text-error">{t(locale, "storyPlayer.listError")}</p>
            <button type="button" onClick={onRetry} className="md3-button md3-button--outlined mt-4">{t(locale, "storyPlayer.retry")}</button>
          </>
        )}
        {empty && <p className="text-label-large text-on-surface-variant">{t(locale, "storyPlayer.listEmpty")}</p>}
        {site.kind === "ready" && !empty && (
          <>
            <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{t(locale, "storyPlayer.emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-body-small leading-6 text-on-surface-variant sm:text-body-medium">{t(locale, "storyPlayer.emptyDescription")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onChoose}
                className="md3-button md3-button--filled"
              >
                <StoryListIcon className="" />
                {t(locale, "storyPlayer.chooseStory")}
              </button>
              <button type="button" onClick={onInfo} className="md3-button md3-button--outlined">
                <InfoIcon className="" />
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
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="md3-icon-button md3-icon-button--outlined">
      {children}
    </button>
  );
}


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
