import SiriusLoader from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
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
import { formatMasterDay } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import Modal from "@/components/shared/Modal";
import {
  getCardBackgroundUrl,
  getCardCharacterUrl,
  getCardFullUrl,
  getCardSkillSpriteUrl,
  getCardThumbnailUrl,
  getCardTypeIconUrl,
  getRarityIconUrl,
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  getBandSmallIconUrl,
} from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import {
  maxMemberCardBuild,
  maxSkillLevel,
  memberCardLevelLimit,
  memberCardParameters,
  pickSkillLevel,
  type MemberCardBuild,
  type MemberCardGrowth,
} from "@/lib/cards/growth";
import {
  type SkillKind,
  type SkillLevelViewModel,
  type SkillViewModel,
} from "@/lib/cards/skills";
import { LevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import CardMaterialsPanel from "@/components/cards/CardMaterialsPanel";
import type { CardMaterials } from "@/lib/cards/materials";

interface Props {
  locale: AppLocale;
  cardId: number;
  initialData: ServerFacetedValue<DetailData>;
  /** Upgrade materials and the gacha voice (build-card-materials.ts); null when no server has the card. */
  materials?: ServerFacetedValue<CardMaterials> | null;
  servers: GameServer[];
}

interface DetailData {
  card: CardViewModel | null;
  skills: SkillViewModel[];
  growth: MemberCardGrowth;
}

interface AssetPreview {
  id: "full" | "character" | "background" | "thumbnail" | "sprite";
  label: string;
  description: string;
  url: string;
  transparent?: boolean;
  compact?: boolean;
}

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

/** The member card as the page's server has it (docs/servers.md). */
export default function CardDetail({ locale, initialData, materials: facetedMaterials = null, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const materials = useMemo(() => facetedMaterials && moveReleaseUrls(valueForServer(facetedMaterials, server), entityServer(facetedMaterials, server)), [facetedMaterials, server]);
  return (
    <MdMuiProvider>
      <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers}>
        <CardDetailView locale={locale} data={data} materials={materials} />
      </ServerScope>
    </MdMuiProvider>
  );
}

function CardDetailView({ locale, data, materials }: { locale: AppLocale; data: DetailData; materials: CardMaterials | null }) {
  const assetUrl = useAssetUrl();
  const timeZone = useDisplayTimeZone();
  const loading = false;
  const error = false;
  const [, setReloadKey] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<AssetPreview | null>(null);
  const [copyState, setCopyState] = useState<("idle" | "copying" | "success" | "error")>("idle");
  const [downloadState, setDownloadState] = useState<("idle" | "downloading" | "success")>("idle");

  const card = data.card;
  const growth = data.growth;
  const maxBuild = useMemo(() => maxMemberCardBuild(growth), [growth]);
  const [build, setBuild] = useState<MemberCardBuild>(maxBuild);
  const [skillLevels, setSkillLevels] = useState<Partial<Record<SkillKind, number>>>({});
  const assets = useMemo<AssetPreview[]>(() => {
    if (!card) return [];
    return [
      { id: "full", label: t(locale, "cards.assets.full"), description: "1440 × 1920", url: assetUrl(getCardFullUrl(card.assetId)) },
      { id: "character", label: t(locale, "cards.assets.character"), description: t(locale, "cards.assets.transparentLayer"), url: assetUrl(getCardCharacterUrl(card.assetId)), transparent: true },
      ...(card.rarity >= 3 ? [{ id: "background" as const, label: t(locale, "cards.assets.background"), description: "1440 × 1920", url: assetUrl(getCardBackgroundUrl(card.assetId)) }] : []),
      { id: "thumbnail", label: t(locale, "cards.assets.thumbnail"), description: "384 × 512", url: assetUrl(getCardThumbnailUrl(card.assetId)) },
      { id: "sprite", label: t(locale, "cards.assets.skillSprite"), description: "120 × 48", url: assetUrl(getCardSkillSpriteUrl(card.assetId)), transparent: true, compact: true },
    ];
  }, [card, locale, assetUrl]);

  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    setViewportWidth(window.innerWidth);
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    document.addEventListener("astro:page-load", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("astro:page-load", handleResize);
    };
  }, []);

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
    if (!card) return [];
    return [
      { id: "full" as const, label: t(locale, "cards.assets.full") },
      { id: "character" as const, label: t(locale, "cards.assets.character") },
      ...(card.rarity >= 3 ? [{ id: "background" as const, label: t(locale, "cards.assets.background") }] : []),
      { id: "thumbnail" as const, label: t(locale, "cards.assets.thumbnail") },
      { id: "sprite" as const, label: t(locale, "cards.assets.skillSprite") },
      { id: "info" as const, label: t(locale, "seo.cardDetail.title") },
    ];
  }, [card, locale]);

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

  const tabs = allTabs;

  const [activeTabId, setActiveTabId] = useState<string>("full");

  useEffect(() => {
    if (tabs.length > 0) {
      setActiveTabId((prev) => {
        const found = tabs.find((t) => t.id === prev);
        return found ? prev : "full";
      });
    }
  }, [tabs]);

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
    return (
      <MdMuiProvider>
        <Card variant="outlined">
          <SiriusLoader locale={locale} label={t(locale, "cards.loading")} className="min-h-72" />
        </Card>
      </MdMuiProvider>
    );
  }

  if (error || !card) {
    return (
      <MdMuiProvider>
        <Card variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: "center" }} role={error ? "alert" : undefined}>
          <Typography sx={{ fontFamily: "var(--mn-font-display)", fontSize: 24, color: "var(--md-sys-color-on-surface)" }}>
            {t(locale, error ? "cards.loadErrorTitle" : "cards.detailNotFound")}
          </Typography>
          <Typography variant="body2" sx={{ mx: "auto", mt: 1.5, maxWidth: "36rem", fontWeight: 500, lineHeight: 1.75, color: "var(--md-sys-color-on-surface-variant)" }}>
            {t(locale, error ? "cards.loadErrorDescription" : "cards.detailNotFoundDescription")}
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

  const attribute = t(locale, `cards.attributes.${card.cardType}`);
  const rarity = t(locale, `cards.rarities.${card.rarity}`);
  const levelLimit = memberCardLevelLimit(growth, build.awakeCount);
  const parameters = memberCardParameters(card, growth, build);
  const maxParameters = memberCardParameters(card, growth, maxBuild);
  const parameterScale = Math.max(maxParameters.performancePower, maxParameters.technicPower, maxParameters.visualPower);
  const isMaxBuild = build.level === maxBuild.level && build.awakeCount === maxBuild.awakeCount && build.rank === maxBuild.rank;
  const leaderSkillLevel = growth.rankSteps.find((step) => step.rank === build.rank)?.leaderSkillLevel;
  const skillLevelFor = (skill: SkillViewModel) =>
    (skill.kind === "leader" && leaderSkillLevel !== undefined ? leaderSkillLevel : skillLevels[skill.kind]) ?? maxSkillLevel(skill);
  // The leader skill level is derived from the rank (in-game Awaken), so changing it moves the rank instead.
  const setSkillLevel = (skill: SkillViewModel, level: number) => {
    const rankStep = skill.kind === "leader"
      ? [...growth.rankSteps].reverse().find((step) => step.leaderSkillLevel <= level) ?? growth.rankSteps[0]
      : undefined;
    if (rankStep) setBuild((current) => ({ ...current, rank: rankStep.rank }));
    else setSkillLevels((current) => ({ ...current, [skill.kind]: level }));
  };
  const setAwakeCount = (awakeCount: number) =>
    setBuild((current) => ({ ...current, awakeCount, level: Math.min(current.level, memberCardLevelLimit(growth, awakeCount)) }));

  const previewActions = selectedAsset ? (
    <>
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
    </>
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
                  {/* Polar-like Photo Frame */}
                  <ButtonBase
                    onClick={() => activeAsset && setSelectedAsset(activeAsset)}
                    className="group"
                    sx={{ position: "relative", display: "block", width: "100%", height: "100%", overflow: "hidden", borderRadius: 4, border: "1px solid var(--md-sys-color-outline-variant)", bgcolor: "var(--md-sys-color-surface-container-high)" }}
                    aria-label={t(locale, "cards.assets.previewFull")}
                  >
                    {activeAsset && (
                      <div className={`h-full w-full ${activeAsset.transparent ? "mn-stripes-cream bg-[var(--md-sys-color-surface-container-high)]" : ""}`}>
                        <img
                          className={activeAsset.compact ? "max-h-full max-w-full object-contain mx-auto my-auto absolute inset-0 p-4" : "h-full w-full object-cover"}
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
                  {/* Quote and card metadata */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {card.gachaVoice && (
                      <div className="relative rounded-2xl border border-solid border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-secondary-container)] p-4 text-xs font-semibold leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
                        <div className="absolute top-2 right-2 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--md-sys-color-primary)] rounded">
                          QUOTE
                        </div>
                        <div className="mt-2 flex items-start gap-2">
                          {materials?.gachaVoiceUrl && (
                            <AudioPlayButton locale={locale} size="sm" track={{ id: `card-gacha-voice:${card.id}`, src: materials.gachaVoiceUrl, title: card.gachaVoice, subtitle: card.characterName }} />
                          )}
                          <p className="italic">"{card.gachaVoice}"</p>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-solid border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-4 space-y-3">
                      <h4 className="font-[var(--mn-font-display)] text-sm tracking-tight text-[var(--md-sys-color-on-surface)] border-b border-[var(--md-sys-color-outline-variant)]/60 pb-1.5">Notebook Log</h4>
                      <div className="space-y-2 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Rarity</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{rarity}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Attribute</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{attribute}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Band</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{card.bandName}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Release</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">{formatMasterDay(card.startAt, locale, timeZone)}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-1">
                          <span>Card ID</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">#{card.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Asset ID</span>
                          <span className="text-[var(--md-sys-color-on-surface)]">#{card.assetId}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lower asset tabs */}
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
          {/* Card Info Card */}
          <Card variant="outlined" sx={{ overflow: "hidden" }}>
            {/* Title Section (Header Banner) */}
            <Box sx={{ borderBottom: "1px solid var(--md-sys-color-outline-variant)", p: { xs: 3, sm: 4 } }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <img
                      className="h-6 w-auto object-contain block dark:hidden"
                      src={assetUrl(getBandLogoUrl(card.bandId, locale))}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <img
                      className="h-6 w-auto object-contain hidden dark:block"
                      src={assetUrl(getBandLogoWhiteUrl(card.bandId, locale))}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span className="font-[var(--mn-font-note)] text-sm text-[var(--md-sys-color-primary)]">{card.bandName}</span>
                  </div>
                  <h2 className="mt-1 font-[var(--mn-font-display)] text-3xl leading-tight text-[var(--md-sys-color-on-surface)] sm:text-4xl">{card.title}</h2>
                  <p className="mt-3 text-base font-medium text-[var(--md-sys-color-on-surface-variant)]">{card.characterName}</p>
                </div>
                <img className="h-12 w-auto" src={assetUrl(getRarityIconUrl(card.rarity))} alt={rarity} />
              </div>
            </Box>

            {/* Body Section (Detail Rows List) */}
            <Box sx={{ p: { xs: 3, sm: 4 } }}>
              <div className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
                <DetailRow label={t(locale, "cards.detailRarity")} value={rarity} />
                <DetailRow label={t(locale, "cards.detailAttribute")} value={<span className="inline-flex items-center gap-2"><img className="h-5 w-5" src={assetUrl(getCardTypeIconUrl(card.cardType))} alt="" aria-hidden="true" />{attribute}</span>} />
                <DetailRow
                  label={t(locale, "cards.detailBand")}
                  value={
                    <span className="inline-flex items-center gap-2">
                      <img
                        className="h-5 w-5 object-contain"
                        src={assetUrl(getBandSmallIconUrl(card.bandId))}
                        alt=""
                        aria-hidden="true"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      {card.bandName}
                    </span>
                  }
                />
                <DetailRow label={t(locale, "cards.detailReleasedAt")} value={formatMasterDay(card.startAt, locale, timeZone)} />
                <DetailRow label={t(locale, "cards.detailCardId")} value={`#${card.id}`} />
                <DetailRow label={t(locale, "cards.detailAssetId")} value={`#${card.assetId}`} />
              </div>
            </Box>
          </Card>

          {/* Parameters Card */}
          <Card variant="outlined" sx={{ overflow: "hidden" }}>
            {/* Title Section */}
            <Box sx={{ borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
              <Typography sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
                {t(locale, "cards.parametersTitle")}
              </Typography>
            </Box>
            {/* Body Section */}
            <Box sx={{ p: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 2.5 }}>
              {growth.levelCurve.length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid var(--md-sys-color-outline-variant)", pb: 2.5 }}>
                  <LevelControl locale={locale} level={build.level} limit={levelLimit} onChange={(level) => setBuild((current) => ({ ...current, level }))} />
                  {growth.awakeSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "cards.growth.training")}
                      value={build.awakeCount}
                      options={growth.awakeSteps.map((step) => step.awakeCount)}
                      onChange={setAwakeCount}
                    />
                  )}
                  {growth.rankSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "cards.growth.awaken")}
                      value={build.rank}
                      options={growth.rankSteps.map((step) => step.rank)}
                      onChange={(rank) => setBuild((current) => ({ ...current, rank }))}
                    />
                  )}
                </Box>
              )}

              {/* Highlighted Total Parameter Row */}
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--md-sys-color-outline-variant)", pb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {t(locale, isMaxBuild ? "cards.detailPower" : "cards.growth.power")}
                </Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--md-sys-color-primary)" }}>
                  {parameters.totalPower.toLocaleString(locale)}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <ParameterBar label={t(locale, "cards.parameters.performance")} value={parameters.performancePower} max={parameterScale} color="var(--md-sys-color-primary)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.technique")} value={parameters.technicPower} max={parameterScale} color="var(--md-sys-color-secondary)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.visual")} value={parameters.visualPower} max={parameterScale} color="var(--md-sys-color-tertiary)" locale={locale} />
              </Box>
            </Box>
          </Card>

          {/* Skills Card */}
          <Card variant="outlined" sx={{ overflow: "hidden" }}>
            {/* Title Section */}
            <Box sx={{ borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
              <Typography sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
                {t(locale, "cards.skillsTitle")}
              </Typography>
            </Box>
            {/* Body Section */}
            <Box sx={{ p: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 2 }}>
              {data.skills.map((skill) => (
                <SkillCard
                  key={skill.kind}
                  skill={skill}
                  level={skillLevelFor(skill)}
                  locale={locale}
                  hint={skill.kind === "leader" && growth.rankSteps.length > 0 ? t(locale, "cards.growth.leaderSkillHint") : undefined}
                  onLevelChange={(level) => setSkillLevel(skill, level)}
                />
              ))}
            </Box>
          </Card>

          {materials && materials.groups.length > 0 && <CardMaterialsPanel locale={locale} groups={materials.groups} />}

          <div className="flex justify-start">
            <Button component="a" href={localizePath(getRoutePathById("cards"), locale)} variant="outlined">
              {t(locale, "cards.backToList")}
            </Button>
          </div>
        </section>
      </div>

      <Modal
        isOpen={selectedAsset !== null}
        onClose={closePreview}
        title={selectedAsset?.label ?? ""}
        closeLabel={t(locale, "actions.close")}
        size={selectedAsset?.id === "sprite" ? "sm" : "md"}
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

function ParameterBar({ label, value, max, color, locale }: { label: string; value: number; max: number; color: string; locale: AppLocale }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--md-sys-color-on-surface)" }}>{value.toLocaleString(locale)}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.max(4, (value / max) * 100)}
        aria-label={label}
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: "var(--md-sys-color-surface-container-highest)",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 999 },
        }}
      />
    </Box>
  );
}

function SkillCard({
  skill,
  level,
  locale,
  hint,
  onLevelChange,
}: {
  skill: SkillViewModel;
  level: number;
  locale: AppLocale;
  hint?: string | undefined;
  onLevelChange: (level: number) => void;
}) {
  const current = pickSkillLevel(skill, level);
  const assetUrl = useAssetUrl();
  return (
    <Box component="article" sx={{ borderRadius: 4, border: "1px solid var(--md-sys-color-outline-variant)", bgcolor: "var(--md-sys-color-surface-container-high)", p: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        {skill.iconUrl ? <img className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] object-contain p-1" src={assetUrl(skill.iconUrl)} alt="" aria-hidden="true" /> : null}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--md-sys-color-primary)" }}>
            {t(locale, `cards.skillKinds.${skill.kind}`)}
          </Typography>
          <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 600, lineHeight: 1.5, color: "var(--md-sys-color-on-surface)" }}>
            {skill.name}
          </Typography>
          <Typography variant="caption" sx={{ mt: 0.5, color: "var(--md-sys-color-on-surface-variant)" }}>
            {t(locale, "cards.skillMeta", { level: current.level, id: skill.id })}
          </Typography>
        </Box>
      </Box>
      {skill.levels.length > 1 ? (
        <Box sx={{ mt: 2 }}>
          <StepControl label={t(locale, "cards.growth.skillLevel")} value={current.level} options={skill.levels.map((entry) => entry.level)} onChange={onLevelChange} />
        </Box>
      ) : null}
      {hint ? <Typography variant="caption" sx={{ mt: 1.5, fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>{hint}</Typography> : null}
      <Typography sx={{ mt: 2, whiteSpace: "pre-line", borderRadius: 4, border: "1px solid var(--md-sys-color-outline-variant)", bgcolor: "var(--md-sys-color-surface-container-highest)", p: 2, fontSize: 14, fontWeight: 500, lineHeight: 1.75, color: "var(--md-sys-color-on-surface)" }}>
        {current.description || fallbackSkillDescription(current, locale)}
      </Typography>
    </Box>
  );
}

function fallbackSkillDescription(skill: SkillLevelViewModel, locale: AppLocale): string {
  const values = skill.effects.map((effect) => {
    const value = effect.effectType < 10000 ? `${(effect.value / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%` : effect.value.toLocaleString(locale);
    return effect.duration === undefined ? value : `${effect.duration.toFixed(1)}s · ${value}`;
  }).join(" / ");
  return t(locale, "cards.skillFallback", { values });
}
