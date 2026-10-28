import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import { SiriusIcon } from "@/components/shared/SiriusLoader";
import { copyImage, downloadImage, imageFileName } from "@/lib/collectibles/image-client";

const frameShapes = { portrait: "aspect-[3/4]", square: "aspect-square", wide: "aspect-video", banner: "aspect-[7/3]" } as const;
export type GalleryShape = keyof typeof frameShapes;

export interface GalleryAsset {
  id: string;
  label: string;
  /** A note under the switch: the size, "transparent layer". */
  description?: string | undefined;
  url: string;
  /** Optional per-asset frame shape overriding the gallery's default `shape`. */
  shape?: GalleryShape | undefined;
  /** The saved file's name; the URL's file name by default. */
  downloadName?: string | undefined;
  /** Drawn on the transparency grid. */
  transparent?: boolean | undefined;
  /** Small art (icons, strips) drawn whole with room around it instead of filling the frame. */
  compact?: boolean | undefined;
}

interface Props {
  locale: AppLocale;
  assets: readonly GalleryAsset[];
  /** The frame's shape: a card or a standing picture, a jacket, landscape art, or a 7:3 banner. */
  shape?: GalleryShape | undefined;
  /** Load the active image eagerly when used as a primary above-the-fold visual. */
  eager?: boolean | undefined;
  /** Rendered when no asset URL is present or all asset URLs fail to load. */
  fallback?: ReactNode | undefined;
  /** Under the switch, e.g. a song's audio. */
  children?: ReactNode | undefined;
}

const actionButton = "md3-icon-button md3-icon-button--outlined md3-icon-button--small";
const checkIcon = <svg className="text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;

/**
 * A detail page's images, one at a time in a frame, with chips to switch between them below it; the frame opens the
 * image in a dialog that downloads or copies it.
 */
export default function AssetGallery({ locale, assets, shape = "portrait", eager = false, fallback = null, children }: Props) {
  const [activeId, setActiveId] = useState(assets[0]?.id);
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "image" | "link" | "error">("idle");

  const assetSignature = useMemo(() => assets.map((asset) => `${asset.id}:${asset.url}`).join("|"), [assets]);
  useEffect(() => {
    setFailedUrls(new Set());
  }, [assetSignature]);

  const availableAssets = useMemo(
    () => assets.filter((asset) => Boolean(asset.url) && !failedUrls.has(asset.url)),
    [assets, failedUrls],
  );
  const active = availableAssets.find((asset) => asset.id === activeId) ?? availableAssets[0];
  if (!active) return <>{fallback}</>;

  const activeShape = active.shape ?? shape;
  const imageFitClass = active.compact
    ? "absolute inset-0 m-auto max-h-full max-w-full object-contain p-6 sm:p-8"
    : activeShape === "banner" || activeShape === "wide"
      ? "h-full w-full object-cover"
      : "h-full w-full object-cover object-top";

  const download = async () => {
    setDownloading(true);
    await downloadImage(active.url, active.downloadName ?? imageFileName(active.url, `${active.id}.png`));
    setDownloading(false);
  };
  const copy = async () => {
    setCopyState("copying");
    setCopyState(await copyImage(active.url));
    window.setTimeout(() => setCopyState("idle"), 1800);
  };
  const copyLabel = copyState === "image" || copyState === "link" || copyState === "error" ? t(locale, `cards.assets.copyStates.${copyState}`) : t(locale, "cards.assets.copyImage");

  return (
    <div className="flex w-full flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block w-full overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-high ${frameShapes[activeShape]} ${active.transparent ? "md3-transparency-grid" : ""}`}
        aria-label={t(locale, "lightbox.open", { name: active.label })}
      >
        <img
          className={imageFitClass}
          src={active.url}
          alt={active.label}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => {
            setFailedUrls((prev) => {
              if (prev.has(active.url)) return prev;
              const next = new Set(prev);
              next.add(active.url);
              return next;
            });
          }}
        />
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/10" aria-hidden="true">
          <svg className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" /></svg>
        </span>
      </button>
      {availableAssets.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "lightbox.images")}>
          {availableAssets.map((asset) => (
            <button key={asset.id} type="button" aria-pressed={asset.id === active.id} onClick={() => setActiveId(asset.id)} className="md3-filter-chip md3-state">
              {asset.label}
            </button>
          ))}
        </div>
      )}
      {active.description && <p className="text-body-small text-on-surface-variant">{active.description}</p>}
      {children}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={active.label}
        closeLabel={t(locale, "actions.close")}
        size={active.compact ? "sm" : "md"}
        headerActions={
          <>
            <button type="button" onClick={download} disabled={downloading} className={actionButton} aria-label={t(locale, "lightbox.download")} title={t(locale, "lightbox.download")}>
              {downloading ? <SiriusIcon className="" /> : (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              )}
            </button>
            <button type="button" onClick={copy} disabled={copyState === "copying"} className={actionButton} aria-label={t(locale, "cards.assets.copyImage")} title={copyLabel}>
              {copyState === "copying" ? <SiriusIcon className="" /> : copyState === "image" || copyState === "link" ? checkIcon : copyState === "error" ? (
                <svg className="text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
            </button>
          </>
        }
      >
        <div className={`w-full overflow-hidden rounded-shape-lg border border-outline-variant ${active.transparent ? "md3-transparency-grid bg-surface-container-highest" : "bg-surface-container"}`}>
          <img className="mx-auto max-h-[65vh] w-full object-contain" src={active.url} alt={active.label} />
        </div>
      </Modal>
    </div>
  );
}
