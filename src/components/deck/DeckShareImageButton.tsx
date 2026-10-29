"use client";

import { useEffect, useState } from "react";
import type { BoxCatalog } from "@/components/box/BoxManager";
import Modal from "@/components/shared/Modal";
import SiriusLoader from "@/components/shared/SiriusLoader";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { CardBox } from "@/lib/box/model";
import { getCardThumbnailUrl } from "@/lib/cards/assets";
import type { DeckTeam } from "@/lib/deck/answer";
import {
  computeDeckShareHeight,
  DECK_SHARE_WIDTH,
  renderDeckShareImage,
  type DeckShareSlot,
  type DeckShareSongRow,
} from "@/lib/deck/share-image";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";

const LEADER_SLOT = 2;

export interface DeckShareImageButtonProps {
  locale: AppLocale;
  team: DeckTeam;
  box: CardBox | null;
  catalog: BoxCatalog;
  goalLabel: string;
  songSummary: string;
  proofBadge: string;
  metricLabel: string;
  metricValue: string;
  powerValue: string;
  songNames?: Readonly<Record<number, string>>;
}

type Status = "idle" | "rendering" | "ready" | "failed";

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.floor(value));
}

export default function DeckShareImageButton({
  locale,
  team,
  box,
  catalog,
  goalLabel,
  songSummary,
  proofBadge,
  metricLabel,
  metricValue,
  powerValue,
  songNames,
}: DeckShareImageButtonProps) {
  const assetUrl = useAssetUrl();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const aggregateCount = team.aggregate?.songs.length ?? 0;
  const shareHeight = computeDeckShareHeight(aggregateCount);

  async function generate() {
    setOpen(true);
    setStatus("rendering");
    setCopied(false);

    const cardOf = (kind: "member" | "snap", id: number | null) =>
      id === null ? null : box?.cards.find((card) => card.kind === kind && card.identity.value === String(id)) ?? null;

    const slots: DeckShareSlot[] = team.layout.members.map((memberId, slotIndex) => {
      const view = catalog.members.find((c) => c.id === memberId);
      const boxMember = cardOf("member", memberId);
      const snapId = team.layout.snaps[slotIndex] ?? null;
      const snapView = snapId === null ? undefined : catalog.snaps.find((c) => c.id === snapId);
      const boxSnap = cardOf("snap", snapId);

      const memberMetaParts: string[] = [];
      if (boxMember?.fields.level.value != null) memberMetaParts.push(`Lv.${boxMember.fields.level.value}`);
      if (boxMember?.fields.rank.value != null) memberMetaParts.push(`R${boxMember.fields.rank.value}`);
      if (boxMember?.fields.liveSkillLevel.value != null) memberMetaParts.push(`Sk${boxMember.fields.liveSkillLevel.value}`);
      if (boxMember?.fields.gekisouSkillLevel.value != null) memberMetaParts.push(`Gk${boxMember.fields.gekisouSkillLevel.value}`);

      const snapMetaParts: string[] = [];
      if (boxSnap?.fields.level.value != null) snapMetaParts.push(`Lv.${boxSnap.fields.level.value}`);
      if (boxSnap?.fields.rank.value != null) snapMetaParts.push(`R${boxSnap.fields.rank.value}`);

      return {
        slotIndex,
        isLeader: slotIndex === LEADER_SLOT,
        memberTitle: view?.characterName || view?.title || `#${memberId}`,
        memberSubtitle: view && view.title !== view.characterName ? view.title : "",
        memberMeta: memberMetaParts.join(" · ") || `#${memberId}`,
        memberArtUrl: view ? assetUrl(getCardThumbnailUrl(view.assetId)) : null,
        snapTitle: snapId === null ? null : (snapView?.title ?? `#${snapId}`),
        snapMeta: snapMetaParts.join(" · ") || (snapId === null ? "" : `#${snapId}`),
        snapArtUrl: snapView ? assetUrl(getSupportCardThumbnailUrl(snapView.assetId)) : null,
      };
    });

    const aggregateRows: DeckShareSongRow[] = (team.aggregate?.songs ?? []).map((entry) => ({
      title: String(songNames?.[entry.song.musicId] ?? `#${entry.song.musicId}`),
      meta: `${entry.song.difficulty.toUpperCase()} · ${t(locale, "deckWorkspace.solver.power")} ${formatNumber(entry.power, locale)}`,
      score: formatNumber(entry.mean, locale),
      range: `${formatNumber(entry.min, locale)} – ${formatNumber(entry.max, locale)}`,
    }));

    try {
      const rendered = await renderDeckShareImage(
        {
          rankBadge: team.rankCertified ? `#${team.rank}` : t(locale, "deckWorkspace.solver.candidateRank", { n: team.rank }),
          goalLabel,
          songSummary,
          proofBadge,
          metricLabel,
          metricValue,
          powerLabel: t(locale, "deckWorkspace.solver.power"),
          powerValue,
          membersHeading: t(locale, "deckShare.membersHeading"),
          snapsHeading: t(locale, "deckShare.snapsHeading"),
          leaderTag: t(locale, "deckWorkspace.solver.leaderShort"),
          noSnapLabel: t(locale, "deckWorkspace.solver.meta.noSnap"),
          slots,
          ...(aggregateRows.length > 0
            ? {
                aggregateHeading: `${t(locale, "deckWorkspace.solver.arenaPoolTitle")} (${aggregateRows.length})`,
                aggregateRows,
              }
            : {}),
          footerLeft: new Date().toLocaleDateString(locale),
          footerRight: t(locale, "deckShare.footerRight"),
        },
        getComputedStyle(document.body).fontFamily,
      );
      if (preview) URL.revokeObjectURL(preview);
      setBlob(rendered);
      setPreview(URL.createObjectURL(rendered));
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }

  const fileName = `moenotes-deck-rank${team.rank}.png`;
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
  const canShare = Boolean(file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));

  async function copy() {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: fileName });
    } catch {
      // User dismissed native share dialog.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void generate()}
        className="md3-button md3-button--tonal md3-button--small"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        {t(locale, "deckShare.button")}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t(locale, "deckShare.dialogTitle")}
        closeLabel={t(locale, "deckShare.close")}
        size="lg"
      >
        <div className="space-y-4">
          <div
            className="mx-auto w-full overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-highest"
            style={{ aspectRatio: `${DECK_SHARE_WIDTH} / ${shareHeight}` }}
          >
            {status === "ready" && preview ? (
              <img src={preview} alt={fileName} className="h-full w-full object-contain" />
            ) : status !== "failed" ? (
              <SiriusLoader locale={locale} label={t(locale, "deckShare.rendering")} className="h-full" />
            ) : (
              <p className="grid h-full place-items-center p-6 text-center text-body-medium text-on-surface-variant">
                {t(locale, "deckShare.failed")}
              </p>
            )}
          </div>

          {status === "ready" && preview && (
            <div className="flex flex-wrap justify-center gap-2">
              <a href={preview} download={fileName} className="md3-button md3-button--filled">
                {t(locale, "deckShare.download")}
              </a>
              {typeof ClipboardItem !== "undefined" && (
                <button type="button" onClick={() => void copy()} className="md3-button md3-button--tonal">
                  {t(locale, copied ? "deckShare.copied" : "deckShare.copy")}
                </button>
              )}
              {canShare && (
                <button type="button" onClick={() => void share()} className="md3-button md3-button--outlined">
                  {t(locale, "deckShare.share")}
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
