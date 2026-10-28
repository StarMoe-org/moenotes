"use client";

import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Lightbox from "@/components/shared/Lightbox";
import type { HelpCarouselViewModel, HelpText } from "@/lib/help/data";
import { imageFileName } from "@/lib/collectibles/image-client";
import { useAssetUrl } from "@/lib/servers/use-content-server";

/** Help copy with its TextMeshPro styling (size, emphasis, furigana); line breaks kept. */
export function HelpRichText({ value, className = "" }: { value: HelpText; className?: string }) {
  return (
    <p className={`whitespace-pre-line ${className}`}>
      {value.runs
        ? value.runs.map((run, index) => {
          const style = [run.bold && "font-black", run.italic && "italic", run.underline && "underline", run.strike && "line-through"].filter(Boolean).join(" ");
          return (
            <span key={index} className={style || undefined} style={run.scale ? { fontSize: `${run.scale}em`, lineHeight: 1.3 } : undefined}>
              {run.ruby ? <ruby>{run.text}<rp>(</rp><rt className="text-[0.55em]">{run.ruby}</rt><rp>)</rp></ruby> : run.text}
            </span>
          );
        })
        : value.text}
    </p>
  );
}

/** A category's carousel guides: each a row of page thumbnails that open the Lightbox on that guide's pages. */
export function HelpCarousels({ locale, carousels }: { locale: AppLocale; carousels: readonly HelpCarouselViewModel[] }) {
  const assetUrl = useAssetUrl();
  const [open, setOpen] = useState<{ carousel: number; page: number } | null>(null);
  if (carousels.length === 0) return null;
  const current = open ? carousels.find((carousel) => carousel.id === open.carousel) : undefined;
  const images = (current?.imageUrls ?? []).map((url, page) => {
    const src = assetUrl(url);
    return {
      src,
      alt: t(locale, "help.carouselPage", { title: current?.title ?? "", page: page + 1 }),
      caption: t(locale, "help.carouselPage", { title: current?.title ?? "", page: page + 1 }),
      downloadName: imageFileName(src, `help_${current?.id ?? 0}_${page}.webp`),
    };
  });

  return (
    <div className="space-y-4">
      {carousels.map((carousel) => (
        <section key={carousel.id} className="rounded-shape-lg border border-outline-variant bg-surface-container-low p-3">
          <h3 className="mb-2 text-label-large text-on-surface">
            {carousel.title}
            <span className="ml-2 text-label-small text-on-surface-variant">{t(locale, "help.carouselPages", { count: carousel.imageUrls.length })}</span>
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {carousel.imageUrls.map((url, page) => (
              <button
                key={url}
                type="button"
                onClick={() => setOpen({ carousel: carousel.id, page })}
                aria-label={t(locale, "help.carouselPage", { title: carousel.title, page: page + 1 })}
                className="group shrink-0 cursor-zoom-in overflow-hidden rounded-shape-md border border-outline-variant bg-surface-container-highest"
              >
                <img src={assetUrl(url)} alt="" loading="lazy" decoding="async" className="h-28 w-auto object-contain transition group-hover:scale-[1.03] sm:h-36" />
              </button>
            ))}
          </div>
        </section>
      ))}
      <Lightbox
        locale={locale}
        images={images}
        index={open?.page ?? 0}
        open={open !== null && images.length > 0}
        onClose={() => setOpen(null)}
        onIndexChange={(page) => setOpen((value) => (value ? { ...value, page } : value))}
      />
    </div>
  );
}
