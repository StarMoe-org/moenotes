import SiriusLoader, { SiriusIcon } from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import Modal from "@/components/shared/Modal";
import {
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  getCharacterSpriteUrl,
  getCharacterThumbnailUrl,
  getCharacterFaceIconUrl,
  getCharacterBoardIconUrl,
} from "@/lib/cards/assets";
import {
  type CardViewModel,
} from "@/lib/cards/data";
import {
  type CharacterProgressionData,
  type CharacterViewModel,
} from "@/lib/characters/data";
import { CharacterSectionTabs, CostumesPanel, RankRewardsPanel, useCharacterSection } from "@/components/characters/CharacterSections";
import CharacterVoicesSection from "@/components/characters/CharacterVoices";
import { BondPartnersPanel, CharacterMissionsPanel, RelatedPanels } from "@/components/characters/CharacterExtraSections";
import type { CharacterExtrasData } from "@/lib/characters/relations";

interface Props {
  locale: AppLocale;
  characterId: number;
  initialData: ServerFacetedValue<DetailData>;
  progressionData: CharacterProgressionData | null;
  /** Bonds, missions and related entries (build-character-extras.ts). */
  extrasData: ServerFacetedValue<CharacterExtrasData>;
  servers: GameServer[];
}

interface DetailData {
  character: CharacterViewModel | null;
  cards: CardViewModel[];
}

interface AssetPreview {
  id: "sprite" | "thumbnail" | "face" | "board";
  label: string;
  description: string;
  url: string;
  transparent?: boolean;
  compact?: boolean;
}

type CopyState = "idle" | "copying" | "success" | "error";

function estimateTabWidth(label: string): number {
  let width = 24 + 3; // padding-x (px-3 = 12px * 2) + border (1.5px * 2)
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    if (code > 127) {
      width += 12; // CJK character
    } else {
      width += 7.5; // Latin character
    }
  }
  return width;
}

/** The character as the page's server has it (docs/servers.md). */
export default function CharacterDetail({ locale, initialData, progressionData, extrasData, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const extras = useMemo(() => moveReleaseUrls(valueForServer(extrasData, server), entityServer(extrasData, server)), [extrasData, server]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers}>
      <CharacterDetailView locale={locale} data={data} progression={progressionData} extras={extras} />
    </ServerScope>
  );
}

function CharacterDetailView({ locale, data, progression, extras }: { locale: AppLocale; data: DetailData; progression: CharacterProgressionData | null; extras: CharacterExtrasData }) {
  const assetUrl = useAssetUrl();
  const [section, setSection] = useCharacterSection();
  const loading = false;
  const error = false;
  const [, setReloadKey] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<AssetPreview | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [downloadState, setDownloadState] = useState<("idle" | "downloading" | "success")>("idle");
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [activeTabId, setActiveTabId] = useState<string>("sprite");

  useEffect(() => {
    setViewportWidth(window.innerWidth);
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const character = data.character;
  const characterNames = useMemo(() => new Map(extras.characters.map((entry) => [entry.id, entry.name])), [extras.characters]);

  const assets = useMemo<AssetPreview[]>(() => {
    if (!character) return [];
    return [
      { id: "sprite", label: t(locale, "characters.assets.sprite"), description: t(locale, "characters.assets.spriteDesc"), url: assetUrl(getCharacterSpriteUrl(character.id)), transparent: true },
      { id: "thumbnail", label: t(locale, "characters.assets.thumbnail"), description: t(locale, "characters.assets.thumbnailDesc"), url: assetUrl(getCharacterThumbnailUrl(character.id)) },
      { id: "face", label: t(locale, "characters.assets.face"), description: t(locale, "characters.assets.faceDesc"), url: assetUrl(getCharacterFaceIconUrl(character.id)), transparent: true, compact: true },
      { id: "board", label: t(locale, "characters.assets.board"), description: t(locale, "characters.assets.boardDesc"), url: assetUrl(getCharacterBoardIconUrl(character.id)), transparent: true, compact: true },
    ];
  }, [character, locale, assetUrl]);

  const containerWidth = useMemo(() => {
    const v = Math.min(1920, viewportWidth);
    if (v < 768) {
      return v - 32;
    }
    if (v < 1024) {
      return v - 336;
    }
    return Math.max(352, (v - 336) * 0.4);
  }, [viewportWidth]);

  const allTabs = useMemo(() => {
    if (!character) return [];
    return [
      { id: "sprite" as const, label: t(locale, "characters.assets.sprite") },
      { id: "thumbnail" as const, label: t(locale, "characters.assets.thumbnail") },
      { id: "face" as const, label: t(locale, "characters.assets.face") },
      { id: "board" as const, label: t(locale, "characters.assets.board") },
      { id: "info" as const, label: t(locale, "characters.assets.bio") },
    ];
  }, [character, locale]);

  const { topTabs, bottomTabs } = useMemo(() => {
    const top: typeof allTabs = [];
    const bottom: typeof allTabs = [];
    const maxAvailableWidth = containerWidth - 48;
    let currentTopWidth = 0;

    for (const tab of allTabs) {
      const tabWidth = estimateTabWidth(tab.label) + 4;
      if (currentTopWidth + tabWidth <= maxAvailableWidth) {
        top.push(tab);
        currentTopWidth += tabWidth;
      } else {
        bottom.push(tab);
      }
    }

    if (top.length === 0 && allTabs.length > 0) {
      top.push(allTabs[0]!);
      bottom.shift();
    }

    return { topTabs: top, bottomTabs: bottom };
  }, [allTabs, containerWidth]);

  const closePreview = () => {
    setSelectedAsset(null);
    setCopyState("idle");
    setDownloadState("idle");
  };

  const copySelectedAsset = async () => {
    if (!selectedAsset) return;
    setCopyState("copying");
    try {
      const response = await fetch(selectedAsset.url);
      const blob = await response.blob();
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
        setCopyState("success");
      } else {
        await navigator.clipboard.writeText(selectedAsset.url);
        setCopyState("success");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(selectedAsset.url);
        setCopyState("success");
      } catch {
        setCopyState("error");
      }
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const handleDownload = async () => {
    if (!selectedAsset) return;
    setDownloadState("downloading");
    try {
      const response = await fetch(selectedAsset.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = selectedAsset.url.split("/").pop() || "download";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setDownloadState("success");
    } catch {
      window.open(selectedAsset.url, "_blank");
      setDownloadState("success");
    }
    setTimeout(() => setDownloadState("idle"), 1500);
  };

  if (loading) {
    return <SiriusLoader locale={locale} label={t(locale, "characters.loading")} className="mn-paper min-h-72" />;
  }

  if (error || !character) {
    return (
      <div className="mn-paper p-8 text-center sm:p-12" role={error ? "alert" : undefined}>
        <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">
          {t(locale, error ? "characters.loadErrorTitle" : "characters.detailNotFound")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">
          {t(locale, error ? "characters.loadErrorDescription" : "characters.detailNotFoundDescription")}
        </p>
        {error && (
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mn-focus mn-stamp-press mt-6 rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-3 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "cards.retry")}
          </button>
        )}
      </div>
    );
  }

  const previewActions = selectedAsset ? (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloadState === "downloading"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      >
        {downloadState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {downloadState === "downloading" && <SiriusIcon />}
        {downloadState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>
      <button
        type="button"
        onClick={copySelectedAsset}
        disabled={copyState === "copying"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      >
        {copyState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        {copyState === "copying" && <SiriusIcon />}
        {copyState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {copyState === "error" && <svg className="h-4 w-4 text-[var(--mn-rose)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
      </button>
    </>
  ) : null;

  const activeAsset = assets.find((a) => a.id === activeTabId);

  return (
    <div className="space-y-8 w-full">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        {/* Left Column: Fixed / Sticky Asset Pane */}
        <aside className="lg:sticky lg:top-24 w-full flex flex-col pt-8">
          <div
            className="relative aspect-[3/4] w-full rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-stamp-lg)]"
          >
            {/* Asset preview panel */}

            {/* Upper asset tabs */}
            <div className="absolute bottom-full left-4 right-4 flex flex-wrap gap-1 pb-[1px] z-10">
              {topTabs.map((tab) => {
                const isActive = activeTabId === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className={`px-3 pt-1.5 pb-3 text-[10px] font-semibold tracking-wider uppercase border border-b-0 border-[var(--mn-border)] rounded-t-xl transition-all origin-bottom -mb-[6px] ${
                      isActive
                        ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-md z-20 -translate-y-[2px]"
                        : "bg-[var(--mn-surface)] text-[var(--mn-text)] hover:bg-[var(--mn-accent-soft)] hover:-translate-y-[1px]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Book Pages */}
            <div className="relative h-full w-full flex flex-col">
              {activeTabId !== "info" ? (
                <div className="h-full w-full">
                  {/* Photo Frame */}
                  <button
                    type="button"
                    onClick={() => activeAsset && setSelectedAsset(activeAsset)}
                    className="group relative block w-full h-full overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] shadow-inner transition hover:scale-[1.01]"
                    aria-label={activeAsset?.label}
                  >
                    {activeAsset && (
                      <div className={`h-full w-full flex items-center justify-center ${activeAsset.transparent ? "mn-stripes-cream bg-[var(--mn-cream-deep)]" : ""}`}>
                        <img
                          className={activeAsset.compact ? "max-h-full max-w-full object-contain p-4" : "h-full w-full object-cover"}
                          src={activeAsset.url}
                          alt={activeAsset.label}
                        />
                      </div>
                    )}
                    {/* Zoom Indicator */}
                    <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10 flex items-center justify-center">
                      <svg className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" /></svg>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col justify-between">
                  {/* Handwritten Bio Scrapbook Info */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {character.catchCopy && (
                      <div className="relative rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-accent-soft)] p-4 text-xs font-semibold leading-relaxed text-[var(--mn-ink-soft)] shadow-inner">
                        <div className="absolute top-2 right-2 bg-[var(--mn-surface)] border border-[var(--mn-border)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--mn-accent-deep)] rounded">
                          CATCHCOPY
                        </div>
                        <p className="mt-2 italic font-[var(--mn-font-hand)] text-sm">"{character.catchCopy}"</p>
                      </div>
                    )}

                    <div className="rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 space-y-3 shadow-inner">
                      <h4 className="font-[var(--mn-font-display)] text-sm tracking-tight text-[var(--mn-text)] border-b border-[var(--mn-border)]/60 pb-1.5">Profile Log</h4>
                      <div className="space-y-2 text-[11px] font-bold text-[var(--mn-text-muted)]">
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Band</span>
                          <span className="text-[var(--mn-text)]">{character.bandName}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Color</span>
                          <span className="inline-flex items-center gap-1.5 text-[var(--mn-text)]">
                            <span className="h-2 w-2 rounded-full border border-[var(--mn-border)]" style={{ backgroundColor: character.mainColor }} />
                            <span className="font-mono text-[10px] uppercase">{character.mainColor}</span>
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Role</span>
                          <span className="text-[var(--mn-text)]">{character.bandPart}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Birthday</span>
                          <span className="text-[var(--mn-text)]">{character.birthday}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Height</span>
                          <span className="text-[var(--mn-text)]">{character.height}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Blood Type</span>
                          <span className="text-[var(--mn-text)]">{character.bloodType || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>ID</span>
                          <span className="text-[var(--mn-text)]">#{character.id}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Horizontal Bookmarks/Tabs on the Bottom Edge */}
            <div className="absolute top-full left-4 right-4 flex flex-wrap gap-1 pt-[1px] z-10">
              {bottomTabs.map((tab) => {
                const isActive = activeTabId === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className={`px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-wider uppercase border border-t-0 border-[var(--mn-border)] rounded-b-xl transition-all origin-top -mt-[6px] ${
                      isActive
                        ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-md z-20 translate-y-[2px]"
                        : "bg-[var(--mn-surface)] text-[var(--mn-text)] hover:bg-[var(--mn-accent-soft)] hover:translate-y-[1px]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Column: Other Content */}
        <section className="flex-1 min-w-0 space-y-6">
          <CharacterSectionTabs locale={locale} value={section} onChange={setSection} />
          {section === "costumes" && <CostumesPanel locale={locale} costumes={progression?.costumes ?? []} />}
          {section === "voices" && <CharacterVoicesSection locale={locale} characterId={character.id} characterNames={characterNames} cards={data.cards} />}
          {section === "bonds" && <>
            <BondPartnersPanel locale={locale} extras={extras} />
            <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.friendshipTitle")} groups={progression?.friendshipRewards ?? []} />
          </>}
          {section === "missions" && <CharacterMissionsPanel locale={locale} characterName={character.name} extras={extras} />}
          {section === "related" && <RelatedPanels locale={locale} cards={data.cards} extras={extras} />}
          {section === "profile" && <>
          {/* Character Bio Info Card */}
          <div className="mn-paper overflow-hidden">
            {/* Title Section (Header Banner) */}
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <img
                      className="h-6 w-auto object-contain block dark:hidden"
                      src={assetUrl(getBandLogoUrl(character.bandId, locale))}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <img
                      className="h-6 w-auto object-contain hidden dark:block"
                      src={assetUrl(getBandLogoWhiteUrl(character.bandId, locale))}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span className="font-[var(--mn-font-note)] text-sm text-[var(--mn-accent-deep)]">{character.bandName}</span>
                  </div>
                  <h2 className="mt-1 font-[var(--mn-font-display)] text-3xl leading-tight text-[var(--mn-text)] sm:text-4xl">{character.name}</h2>
                  <p className="mt-2 text-sm font-bold text-[var(--mn-text-muted)] tracking-wide uppercase">{character.enName}</p>
                </div>
                <span className="px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
                  {character.bandPart}
                </span>
              </div>
            </div>

            {/* Body Section (Detail Rows List) */}
            <div className="p-6 sm:p-8 bg-[var(--mn-paper)]">
              <div className="divide-y divide-dashed divide-[var(--mn-border)]/60">
                <DetailRow label={t(locale, "characters.detailBand")} value={character.bandName} />
                <DetailRow
                  label={t(locale, "characters.detailColor")}
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-[var(--mn-border)]" style={{ backgroundColor: character.mainColor }} />
                      <span className="font-mono text-xs uppercase">{character.mainColor}</span>
                    </span>
                  }
                />
                <DetailRow label={t(locale, "characters.detailPart")} value={character.bandPart} />
                <DetailRow label={t(locale, "characters.detailBirthday")} value={character.birthday} />
                {character.height && <DetailRow label={t(locale, "characters.detailHeight")} value={character.height} />}
                {character.school && (
                  <DetailRow
                    label={t(locale, "characters.detailSchool")}
                    value={character.schoolClass ? `${character.school} ${character.schoolClass}` : character.school}
                  />
                )}
                {character.hobby && <DetailRow label={t(locale, "characters.detailHobby")} value={character.hobby} />}
                {character.favoriteFood && <DetailRow label={t(locale, "characters.detailFavoriteFood")} value={character.favoriteFood} />}
                {character.constellation && <DetailRow label={t(locale, "characters.detailConstellation")} value={character.constellation} />}
                <DetailRow label={t(locale, "characters.detailVoiceActor")} value={character.voiceActor} />
              </div>
            </div>
          </div>

          {/* Description Card */}
          {character.description && (
            <div className="mn-paper overflow-hidden">
              <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
                <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
                  {t(locale, "characters.profileTitle")}
                </h3>
              </div>
              <div className="p-6 sm:p-8 bg-[var(--mn-paper)]">
                <p className="whitespace-pre-line text-sm font-medium leading-7 text-[var(--mn-text)]">
                  {character.description}
                </p>
              </div>
            </div>
          )}

          {/* The full card lists live in the related section; the profile keeps the counts. */}
          <div className="mn-paper flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8">
            <p className="text-sm font-bold text-[var(--mn-text)]">
              {t(locale, "characters.related.summary", { cards: data.cards.length, supportCards: extras.supportCards.length, stories: extras.stories.length + extras.friendshipStories.length })}
            </p>
            <button type="button" onClick={() => setSection("related")} className="mn-focus mn-stamp-press rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-1.5 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)] hover:text-[var(--mn-accent-deep)]">
              {t(locale, "characters.related.open")}
            </button>
          </div>

          <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.rankTitle")} groups={progression?.rankRewards ?? []} />
          </>}

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("characters"), locale)} className="mn-focus mn-stamp-press inline-flex rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
              {t(locale, "characters.backToList")}
            </a>
          </div>
        </section>
      </div>

      <Modal
        isOpen={selectedAsset !== null}
        onClose={closePreview}
        title={selectedAsset?.label ?? ""}
        closeLabel={t(locale, "actions.close")}
        size={selectedAsset?.id === "face" || selectedAsset?.id === "board" ? "sm" : "md"}
        headerActions={previewActions}
      >
        {selectedAsset && (
          <div className={`w-full overflow-hidden rounded-2xl border border-[var(--mn-border)] ${selectedAsset.transparent ? "mn-stripes-cream bg-[var(--mn-cream-deep)]" : "bg-[var(--mn-surface)]"}`}>
            <img
              className="mx-auto max-h-[65vh] w-full object-contain"
              src={selectedAsset.url}
              alt={selectedAsset.label}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-sm">
      <span className="font-semibold text-[var(--mn-text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--mn-text)]">{value}</span>
    </div>
  );
}
