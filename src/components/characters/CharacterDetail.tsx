import SiriusLoader from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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
      <MdMuiProvider>
        <Card variant="outlined" sx={{ px: { xs: 4, sm: 6 }, py: { xs: 4, sm: 6 }, textAlign: "center" }} role={error ? "alert" : undefined}>
          <Typography component="h2" sx={{ fontFamily: "var(--mn-font-display)", fontSize: 24, color: "var(--md-sys-color-on-surface)" }}>
            {t(locale, error ? "characters.loadErrorTitle" : "characters.detailNotFound")}
          </Typography>
          <Typography variant="body2" sx={{ mx: "auto", mt: 1.5, maxWidth: 576, fontWeight: 500, lineHeight: 1.75, color: "var(--md-sys-color-on-surface-variant)" }}>
            {t(locale, error ? "characters.loadErrorDescription" : "characters.detailNotFoundDescription")}
          </Typography>
          {error && (
            <Button variant="contained" onClick={() => setReloadKey((value) => value + 1)} sx={{ mt: 3 }}>
              {t(locale, "cards.retry")}
            </Button>
          )}
        </Card>
      </MdMuiProvider>
    );
  }

  const previewActions = selectedAsset ? (
    <MdMuiProvider>
      <IconButton
        onClick={handleDownload}
        disabled={downloadState === "downloading"}
        size="small"
        sx={{ border: "1px solid var(--md-sys-color-outline-variant)" }}
      >
        {downloadState === "idle" && <DownloadIcon fontSize="small" />}
        {downloadState === "downloading" && <CircularProgress size={16} color="inherit" />}
        {downloadState === "success" && <CheckIcon fontSize="small" sx={{ color: "success.main" }} />}
      </IconButton>
      <IconButton
        onClick={copySelectedAsset}
        disabled={copyState === "copying"}
        size="small"
        sx={{ border: "1px solid var(--md-sys-color-outline-variant)" }}
      >
        {copyState === "idle" && <ContentCopyIcon fontSize="small" />}
        {copyState === "copying" && <CircularProgress size={16} color="inherit" />}
        {copyState === "success" && <CheckIcon fontSize="small" sx={{ color: "success.main" }} />}
        {copyState === "error" && <CloseIcon fontSize="small" sx={{ color: "error.main" }} />}
      </IconButton>
    </MdMuiProvider>
  ) : null;

  const activeAsset = assets.find((a) => a.id === activeTabId);

  return (
    <MdMuiProvider>
    <div className="space-y-8 w-full">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        {/* Left Column: Fixed / Sticky Asset Pane */}
        <aside className="lg:sticky lg:top-24 w-full flex flex-col pt-8">
          <Card
            variant="outlined"
            sx={{ position: "relative", aspectRatio: "3 / 4", width: "100%", p: 2.5 }}
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
                    className={`px-3 pt-1.5 pb-3 text-[10px] font-semibold tracking-wider uppercase border border-b-0 border-[var(--md-sys-color-outline-variant)] rounded-t-xl transition-all origin-bottom -mb-[6px] ${
                      isActive
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-level1)] z-20 -translate-y-[2px]"
                        : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-secondary-container)] hover:-translate-y-[1px]"
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
                  <ButtonBase
                    onClick={() => activeAsset && setSelectedAsset(activeAsset)}
                    className="group"
                    sx={{ position: "relative", display: "block", width: "100%", height: "100%", overflow: "hidden", borderRadius: 4, border: "1px solid var(--md-sys-color-outline-variant)", bgcolor: "var(--md-sys-color-surface-container-high)" }}
                    aria-label={activeAsset?.label}
                  >
                    {activeAsset && (
                      <div className={`h-full w-full flex items-center justify-center ${activeAsset.transparent ? "mn-stripes-cream bg-[var(--md-sys-color-surface-container-high)]" : ""}`}>
                        <img
                          className={activeAsset.compact ? "max-h-full max-w-full object-contain p-4" : "h-full w-full object-cover"}
                          src={activeAsset.url}
                          alt={activeAsset.label}
                        />
                      </div>
                    )}
                    {/* Zoom Indicator */}
                    <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10 flex items-center justify-center">
                      <ZoomInIcon className="opacity-0 transition group-hover:opacity-100" sx={{ fontSize: 32, color: "white" }} aria-hidden="true" />
                    </div>
                  </ButtonBase>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col justify-between">
                  {/* Handwritten Bio Scrapbook Info */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {character.catchCopy && (
                      <div className="relative rounded-2xl border border-solid border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-secondary-container)] p-4 text-xs font-semibold leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
                        <div className="absolute top-2 right-2 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--md-sys-color-primary)] rounded">
                          CATCHCOPY
                        </div>
                        <p className="mt-2 italic font-[var(--mn-font-hand)] text-sm">"{character.catchCopy}"</p>
                      </div>
                    )}

                    <div className="rounded-2xl border border-solid border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-4 space-y-3">
                      <h4 className="font-[var(--mn-font-display)] text-sm tracking-tight text-[var(--md-sys-color-on-surface)] border-b border-[var(--md-sys-color-outline-variant)]/60 pb-1.5">Profile Log</h4>
                      <div className="space-y-2 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Band</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{character.bandName}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Color</span>
                          <span className="inline-flex items-center gap-1.5 text-[var(--md-sys-color-on-surface)]">
                            <span className="h-2 w-2 rounded-full border border-[var(--md-sys-color-outline-variant)]" style={{ backgroundColor: character.mainColor }} />
                            <span className="text-[10px] uppercase tabular-nums">{character.mainColor}</span>
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Role</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{character.bandPart}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Birthday</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{character.birthday}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Height</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{character.height}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Blood Type</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{character.bloodType || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>ID</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">#{character.id}</span>
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
                    className={`px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-wider uppercase border border-t-0 border-[var(--md-sys-color-outline-variant)] rounded-b-xl transition-all origin-top -mt-[6px] ${
                      isActive
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-level1)] z-20 translate-y-[2px]"
                        : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-secondary-container)] hover:translate-y-[1px]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </Card>
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
          <Card variant="outlined" sx={{ overflow: "hidden" }}>
            {/* Title Section (Header Banner) */}
            <div className="border-b border-[var(--md-sys-color-outline-variant)] bg-gradient-to-r from-[color-mix(in_oklab,var(--md-sys-color-primary)_6%,transparent)] to-transparent p-6 sm:p-8">
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
                    <span className="font-[var(--mn-font-note)] text-sm text-[var(--md-sys-color-primary)]">{character.bandName}</span>
                  </div>
                  <Typography component="h2" sx={{ mt: 0.5, fontFamily: "var(--mn-font-display)", fontSize: { xs: 30, sm: 36 }, lineHeight: 1.25, color: "var(--md-sys-color-on-surface)" }}>{character.name}</Typography>
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 700, letterSpacing: "0.025em", textTransform: "uppercase", color: "var(--md-sys-color-on-surface-variant)" }}>{character.enName}</Typography>
                </div>
                <Chip label={character.bandPart} size="small" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }} />
              </div>
            </div>

            {/* Body Section (Detail Rows List) */}
            <div className="p-6 sm:p-8">
              <div className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
                <DetailRow label={t(locale, "characters.detailBand")} value={character.bandName} />
                <DetailRow
                  label={t(locale, "characters.detailColor")}
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-[var(--md-sys-color-outline-variant)]" style={{ backgroundColor: character.mainColor }} />
                      <span className="text-xs uppercase tabular-nums">{character.mainColor}</span>
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
          </Card>

          {/* Description Card */}
          {character.description && (
            <Card variant="outlined" sx={{ overflow: "hidden" }}>
              <div className="border-b border-[var(--md-sys-color-outline-variant)] bg-gradient-to-r from-[color-mix(in_oklab,var(--md-sys-color-primary)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
                <Typography component="h3" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
                  {t(locale, "characters.profileTitle")}
                </Typography>
              </div>
              <div className="p-6 sm:p-8">
                <p className="whitespace-pre-line text-sm font-medium leading-7 text-[var(--md-sys-color-on-surface)]">
                  {character.description}
                </p>
              </div>
            </Card>
          )}

          {/* The full card lists live in the related section; the profile keeps the counts. */}
          <Card variant="outlined" sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, px: { xs: 3, sm: 4 }, py: 2 }}>
            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              {t(locale, "characters.related.summary", { cards: data.cards.length, supportCards: extras.supportCards.length, stories: extras.stories.length + extras.friendshipStories.length })}
            </p>
            <Button variant="outlined" size="small" onClick={() => setSection("related")}>
              {t(locale, "characters.related.open")}
            </Button>
          </Card>

          <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.rankTitle")} groups={progression?.rankRewards ?? []} />
          </>}

          <div className="flex justify-start">
            <Button component="a" href={localizePath(getRoutePathById("characters"), locale)} variant="outlined">
              {t(locale, "characters.backToList")}
            </Button>
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
          <div className={`w-full overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] ${selectedAsset.transparent ? "mn-stripes-cream" : ""}`}>
            <img
              className="mx-auto max-h-[65vh] w-full object-contain"
              src={selectedAsset.url}
              alt={selectedAsset.label}
            />
          </div>
        )}
      </Modal>
    </div>
    </MdMuiProvider>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-sm">
      <span className="font-semibold text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{value}</span>
    </div>
  );
}
