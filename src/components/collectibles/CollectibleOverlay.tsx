import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import DetailOverlay from "@/components/shared/DetailOverlay";
import Lightbox, { type LightboxImage } from "@/components/shared/Lightbox";
import CharacterAvatarStack, { type AvatarStackCharacter } from "@/components/shared/CharacterAvatarStack";
import ServerSchedules from "@/components/shared/ServerSchedules";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import { SiriusIcon } from "@/components/shared/SiriusLoader";
import { copyImage, downloadImage } from "@/lib/collectibles/image-client";
import { formatMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import type { ServerFaceted, ServerFacetedValue, ServerVariants } from "@/lib/servers/facets";

export interface CollectibleFact {
  label: string;
  value: ReactNode;
}

interface Scheduled {
  startAt: string;
  endAt: string;
}

export interface CollectibleOverlayProps<T extends ServerFaceted<{ id: number }>> {
  locale: AppLocale;
  /** The build's servers. */
  servers: readonly GameServer[];
  /** The entry shown (as the page's server has it), or null when closed. */
  entry: (T & Partial<Scheduled>) | null;
  onClose: () => void;
  title: string;
  /** Close button name. */
  closeLabel: string;
  /** The current filter results, in list order: the Lightbox pages through their artwork. */
  results: readonly T[];
  /** An entry's artwork for the Lightbox. */
  toImage: (item: T) => LightboxImage;
  /** The Lightbox moved to another result: open that one in the overlay too. */
  onNavigate: (id: number) => void;
  /** Frame of the large image: square art (stickers, titles) or wide art (comics, backgrounds). */
  frame?: "square" | "wide";
  description?: ReactNode;
  characters?: readonly AvatarStackCharacter[];
  facts?: readonly CollectibleFact[];
  children?: ReactNode;
}

type CopyState = "idle" | "copying" | "image" | "link" | "error";

const actionButton = "mn-focus grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50";
const checkIcon = <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;

/**
 * Detail of a collectible (title, sticker, comic, background) over its list, opened from `?id=`: the artwork (opens
 * the zoomable Lightbox, which pages through the current results), name, description, characters, release time per
 * server, and download / copy buttons.
 */
export default function CollectibleOverlay<T extends ServerFaceted<{ id: number }>>({
  locale, servers, entry, onClose, title, closeLabel, results, toImage, onNavigate,
  frame = "square", description, characters = [], facts = [], children,
}: CollectibleOverlayProps<T>) {
  const timeZone = useDisplayTimeZone();
  const [zoomed, setZoomed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [downloading, setDownloading] = useState(false);
  // A deep-linked entry the current filters hide is viewed on its own.
  const listedIndex = entry ? results.findIndex((item) => item.id === entry.id) : -1;
  const gallery = useMemo(() => (listedIndex >= 0 ? results.map(toImage) : entry ? [toImage(entry)] : []), [listedIndex, results, toImage, entry]);
  const galleryIndex = Math.max(0, listedIndex);
  const image = gallery[galleryIndex];
  const imageUrl = image?.src ?? "";

  const entryId = entry?.id;
  useEffect(() => {
    setCopyState("idle");
    if (entryId === undefined) setZoomed(false);
  }, [entryId]);

  const handleDownload = async () => {
    if (!image?.downloadName) return;
    setDownloading(true);
    await downloadImage(image.src, image.downloadName);
    setDownloading(false);
  };

  const handleCopy = async () => {
    if (!imageUrl) return;
    setCopyState("copying");
    setCopyState(await copyImage(imageUrl));
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const headerActions = entry && imageUrl ? (
    <>
      <button type="button" onClick={handleDownload} disabled={downloading} className={actionButton} aria-label={t(locale, "lightbox.download")} title={t(locale, "lightbox.download")}>
        {downloading ? <SiriusIcon /> : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        )}
      </button>
      <button type="button" onClick={handleCopy} disabled={copyState === "copying"} className={actionButton} aria-label={t(locale, "cards.assets.copyImage")} title={copyState === "image" || copyState === "link" || copyState === "error" ? t(locale, `cards.assets.copyStates.${copyState}`) : t(locale, "cards.assets.copyImage")}>
        {copyState === "copying" ? <SiriusIcon /> : copyState === "image" || copyState === "link" ? checkIcon : copyState === "error" ? (
          <svg className="h-4 w-4 text-[var(--mn-rose)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        )}
      </button>
    </>
  ) : undefined;

  const releasedAt = entry?.startAt ? formatMasterDate(entry.startAt, locale, true, timeZone) : "";
  const schedule: ServerFacetedValue<Scheduled> | null = entry && entry.startAt !== undefined
    ? {
      value: { startAt: entry.startAt ?? "", endAt: entry.endAt ?? "" },
      servers: entry.servers,
      ...(entry.serverVariants ? { serverVariants: entry.serverVariants as ServerVariants<Scheduled> } : {}),
    }
    : null;

  return (
    <>
      <DetailOverlay locale={locale} open={entry !== null} onClose={onClose} title={title} closeLabel={closeLabel} size={frame === "wide" ? "xl" : "lg"} headerActions={headerActions}>
        {entry ? (
          <div className="space-y-4">
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label={t(locale, "lightbox.label")}
                className={`mn-focus group block w-full cursor-zoom-in overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] ${frame === "wide" ? "bg-[var(--mn-surface)] p-2" : "mn-stripes-cream bg-[var(--mn-cream-deep)] p-4"}`}
              >
                <img className={`mx-auto object-contain transition duration-300 group-hover:scale-[1.01] ${frame === "wide" ? "max-h-[60vh] w-full" : "max-h-[45vh] w-auto max-w-full"}`} src={imageUrl} alt={image?.alt ?? title} />
              </button>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <ServerAvailabilityBadge locale={locale} entity={entry} servers={servers} showLabel />
            </div>
            {description ? <div className="whitespace-pre-line text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{description}</div> : null}
            {characters.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-black text-[var(--mn-text-muted)]">{t(locale, "nav.items.characters")}</p>
                <CharacterAvatarStack locale={locale} characters={characters} max={8} size="lg" showNames />
              </div>
            ) : null}
            <dl className="divide-y divide-dashed divide-[var(--mn-border)]/60 text-sm">
              {facts.map((fact) => (
                <div key={fact.label} className="flex justify-between gap-4 py-2.5">
                  <dt className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{fact.label}</dt>
                  <dd className="min-w-0 text-right font-semibold">{fact.value}</dd>
                </div>
              ))}
              {releasedAt ? (
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{t(locale, "sorting.date")}</dt>
                  <dd className="text-right font-semibold tabular-nums">{releasedAt}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="font-semibold text-[var(--mn-text-muted)]">ID</dt>
                <dd className="font-mono">#{entry.id}</dd>
              </div>
            </dl>
            {schedule ? <ServerSchedules locale={locale} faceted={schedule} servers={servers} alwaysLabel={t(locale, "schedule.permanent")} /> : null}
            {children}
          </div>
        ) : null}
      </DetailOverlay>
      <Lightbox
        locale={locale}
        images={gallery}
        index={galleryIndex}
        open={zoomed && entry !== null && gallery.length > 0}
        onClose={() => setZoomed(false)}
        {...(listedIndex >= 0 ? { onIndexChange: (index: number) => { const next = results[index]; if (next) onNavigate(next.id); } } : {})}
      />
    </>
  );
}
