import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
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

interface Props {
  locale: AppLocale;
  cardId: number;
  initialData: DetailData;
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

export default function CardDetail({ locale, initialData }: Props) {
  const [data] = useState<DetailData>(initialData);
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
      { id: "full", label: t(locale, "cards.assets.full"), description: "1440 × 1920", url: getCardFullUrl(card.assetId) },
      { id: "character", label: t(locale, "cards.assets.character"), description: t(locale, "cards.assets.transparentLayer"), url: getCardCharacterUrl(card.assetId), transparent: true },
      ...(card.rarity >= 3 ? [{ id: "background" as const, label: t(locale, "cards.assets.background"), description: "1440 × 1920", url: getCardBackgroundUrl(card.assetId) }] : []),
      { id: "thumbnail", label: t(locale, "cards.assets.thumbnail"), description: "384 × 512", url: getCardThumbnailUrl(card.assetId) },
      { id: "sprite", label: t(locale, "cards.assets.skillSprite"), description: "120 × 48", url: getCardSkillSpriteUrl(card.assetId), transparent: true, compact: true },
    ];
  }, [card, locale]);

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
    return <div className="mn-paper h-72 animate-pulse" aria-label={t(locale, "cards.loading")} />;
  }

  if (error || !card) {
    return (
      <div className="mn-paper p-8 text-center sm:p-12" role={error ? "alert" : undefined}>
        <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">
          {t(locale, error ? "cards.loadErrorTitle" : "cards.detailNotFound")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">
          {t(locale, error ? "cards.loadErrorDescription" : "cards.detailNotFoundDescription")}
        </p>
        {error && (
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mn-focus mn-stamp-press mt-6 rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-3 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "cards.retry")}
          </button>
        )}
      </div>
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
        {downloadState === "downloading" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
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
        {copyState === "copying" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
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
                  {/* Polar-like Photo Frame */}
                  <button
                    type="button"
                    onClick={() => activeAsset && setSelectedAsset(activeAsset)}
                    className="group relative block w-full h-full overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] shadow-inner transition hover:scale-[1.01]"
                    aria-label={t(locale, "cards.assets.previewFull")}
                  >
                    {activeAsset && (
                      <div className={`h-full w-full ${activeAsset.transparent ? "mn-stripes-cream bg-[var(--mn-cream-deep)]" : ""}`}>
                        <img
                          className={activeAsset.compact ? "max-h-full max-w-full object-contain mx-auto my-auto absolute inset-0 p-4" : "h-full w-full object-cover"}
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
                  {/* Quote and card metadata */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {card.gachaVoice && (
                      <div className="relative rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-accent-soft)] p-4 text-xs font-semibold leading-relaxed text-[var(--mn-ink-soft)] shadow-inner">
                        <div className="absolute top-2 right-2 bg-[var(--mn-surface)] border border-[var(--mn-border)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--mn-accent-deep)] rounded">
                          QUOTE
                        </div>
                        <p className="mt-2 italic">"{card.gachaVoice}"</p>
                      </div>
                    )}

                    <div className="rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 space-y-3 shadow-inner">
                      <h4 className="font-[var(--mn-font-display)] text-sm tracking-tight text-[var(--mn-text)] border-b border-[var(--mn-border)]/60 pb-1.5">Notebook Log</h4>
                      <div className="space-y-2 text-[11px] font-bold text-[var(--mn-text-muted)]">
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Rarity</span>
                          <span className="text-[var(--mn-text)]">{rarity}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Attribute</span>
                          <span className="text-[var(--mn-text)]">{attribute}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Band</span>
                          <span className="text-[var(--mn-text)]">{card.bandName}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Release</span>
                          <span className="text-[var(--mn-text)]">{formatDate(card.startAt, locale)}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Card ID</span>
                          <span className="text-[var(--mn-text)]">#{card.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Asset ID</span>
                          <span className="text-[var(--mn-text)]">#{card.assetId}</span>
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
          {/* Card Info Card */}
          <div className="mn-paper overflow-hidden">
            {/* Title Section (Header Banner) */}
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <img
                      className="h-6 w-auto object-contain block dark:hidden"
                      src={getBandLogoUrl(card.bandId)}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <img
                      className="h-6 w-auto object-contain hidden dark:block"
                      src={getBandLogoWhiteUrl(card.bandId)}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span className="font-[var(--mn-font-note)] text-sm text-[var(--mn-accent-deep)]">{card.bandName}</span>
                  </div>
                  <h2 className="mt-1 font-[var(--mn-font-display)] text-3xl leading-tight text-[var(--mn-text)] sm:text-4xl">{card.title}</h2>
                  <p className="mt-3 text-base font-medium text-[var(--mn-text-muted)]">{card.characterName}</p>
                </div>
                <img className="h-12 w-auto" src={getRarityIconUrl(card.rarity)} alt={rarity} />
              </div>
            </div>

            {/* Body Section (Detail Rows List) */}
            <div className="p-6 sm:p-8 bg-[var(--mn-paper)]">
              <div className="divide-y divide-dashed divide-[var(--mn-border)]/60">
                <DetailRow label={t(locale, "cards.detailRarity")} value={rarity} />
                <DetailRow label={t(locale, "cards.detailAttribute")} value={<span className="inline-flex items-center gap-2"><img className="h-5 w-5" src={getCardTypeIconUrl(card.cardType)} alt="" aria-hidden="true" />{attribute}</span>} />
                <DetailRow
                  label={t(locale, "cards.detailBand")}
                  value={
                    <span className="inline-flex items-center gap-2">
                      <img
                        className="h-5 w-5 object-contain"
                        src={getBandSmallIconUrl(card.bandId)}
                        alt=""
                        aria-hidden="true"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      {card.bandName}
                    </span>
                  }
                />
                <DetailRow label={t(locale, "cards.detailReleasedAt")} value={formatDate(card.startAt, locale)} />
                <DetailRow label={t(locale, "cards.detailCardId")} value={`#${card.id}`} />
                <DetailRow label={t(locale, "cards.detailAssetId")} value={`#${card.assetId}`} />
              </div>
            </div>
          </div>

          {/* Parameters Card */}
          <div className="mn-paper overflow-hidden">
            {/* Title Section */}
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
              <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
                {t(locale, "cards.parametersTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 space-y-5">
              {growth.levelCurve.length > 0 && (
                <div className="space-y-4 border-b border-solid border-[var(--mn-border)]/60 pb-5">
                  <LevelControl locale={locale} level={build.level} limit={levelLimit} onChange={(level) => setBuild((current) => ({ ...current, level }))} />
                  {growth.awakeSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "cards.growth.training")}
                      value={build.awakeCount}
                      options={growth.awakeSteps.map((step) => step.awakeCount)}
                      formatOption={(_, index) => String(index)}
                      onChange={setAwakeCount}
                    />
                  )}
                  {growth.rankSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "cards.growth.awaken")}
                      value={build.rank}
                      options={growth.rankSteps.map((step) => step.rank)}
                      formatOption={(_, index) => String(index)}
                      onChange={(rank) => setBuild((current) => ({ ...current, rank }))}
                    />
                  )}
                </div>
              )}

              {/* Highlighted Total Parameter Row */}
              <div className="flex items-center justify-between border-b border-solid border-[var(--mn-border)]/60 pb-4">
                <span className="text-sm font-semibold text-[var(--mn-text-muted)]">
                  {t(locale, isMaxBuild ? "cards.detailPower" : "cards.growth.power")}
                </span>
                <span className="font-mono text-xl font-bold text-[var(--mn-accent-deep)]">
                  {parameters.totalPower.toLocaleString(locale)}
                </span>
              </div>

              <div className="space-y-4">
                <ParameterBar label={t(locale, "cards.parameters.performance")} value={parameters.performancePower} max={parameterScale} color="var(--mn-accent)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.technique")} value={parameters.technicPower} max={parameterScale} color="var(--mn-cyan)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.visual")} value={parameters.visualPower} max={parameterScale} color="var(--mn-mint)" locale={locale} />
              </div>
            </div>
          </div>

          {/* Skills Card */}
          <div className="mn-paper overflow-hidden">
            {/* Title Section */}
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
              <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
                {t(locale, "cards.skillsTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 flex flex-col gap-4">
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
            </div>
          </div>

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("cards"), locale)} className="mn-focus mn-stamp-press inline-flex rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
              {t(locale, "cards.backToList")}
            </a>
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

function ParameterBar({ label, value, max, color, locale }: { label: string; value: number; max: number; color: string; locale: AppLocale }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="text-[var(--mn-text-muted)]">{label}</span>
        <span className="font-mono text-[var(--mn-text)]">{value.toLocaleString(locale)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-[var(--mn-border)] bg-[var(--mn-cream-deep)]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
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
  return (
    <article className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-5 shadow-[var(--mn-shadow-stamp)]">
      <div className="flex items-start gap-4">
        {skill.iconUrl ? <img className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] object-contain p-1" src={skill.iconUrl} alt="" aria-hidden="true" /> : null}
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--mn-accent-deep)]">{t(locale, `cards.skillKinds.${skill.kind}`)}</p><h3 className="mt-1 text-base font-semibold leading-6 text-[var(--mn-text)]">{skill.name}</h3><p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "cards.skillMeta", { level: current.level, id: skill.id })}</p></div>
      </div>
      {skill.levels.length > 1 ? (
        <div className="mt-4">
          <StepControl label={t(locale, "cards.growth.skillLevel")} value={current.level} options={skill.levels.map((entry) => entry.level)} onChange={onLevelChange} />
        </div>
      ) : null}
      {hint ? <p className="mt-3 text-xs font-medium text-[var(--mn-text-muted)]">{hint}</p> : null}
      <p className="mt-4 whitespace-pre-line rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 text-sm font-medium leading-7 text-[var(--mn-text)]">
        {current.description || fallbackSkillDescription(current, locale)}
      </p>
    </article>
  );
}

function fallbackSkillDescription(skill: SkillLevelViewModel, locale: AppLocale): string {
  const values = skill.effects.map((effect) => {
    const value = effect.effectType < 10000 ? `${(effect.value / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%` : effect.value.toLocaleString(locale);
    return effect.duration === undefined ? value : `${effect.duration.toFixed(1)}s · ${value}`;
  }).join(" / ");
  return t(locale, "cards.skillFallback", { values });
}

function formatDate(value: string, locale: AppLocale): string {
  const normalized = value.replaceAll("/", "-").replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
}
