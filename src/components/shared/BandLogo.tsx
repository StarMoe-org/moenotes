"use client";

import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { getBandLogoUrl, getBandLogoWhiteUrl } from "@/lib/cards/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  bandId: number;
  bandName: string;
  locale: AppLocale;
}

/** The band's logo beside its name in a detail page heading (DetailHero `eyebrow`); nothing when the artwork is missing. */
export function BandLogoMark({ bandId, locale }: { bandId: number; locale: AppLocale }) {
  const [failed, setFailed] = useState(false);
  const assetUrl = useAssetUrl();
  if (!bandId || failed) return null;
  return (
    <>
      <img className="block h-6 w-auto object-contain dark:hidden" src={assetUrl(getBandLogoUrl(bandId, locale))} alt="" aria-hidden="true" onError={() => setFailed(true)} />
      <img className="hidden h-6 w-auto object-contain dark:block" src={assetUrl(getBandLogoWhiteUrl(bandId, locale))} alt="" aria-hidden="true" onError={() => setFailed(true)} />
    </>
  );
}

/** Band logo for list-card footers; falls back to the band name when the artwork is missing. */
export default function BandLogo({ bandId, bandName, locale }: Props) {
  const [failed, setFailed] = useState(false);
  const assetUrl = useAssetUrl();

  if (!bandId || failed) {
    return <span className="truncate text-[11px] font-medium text-on-surface-variant">{bandName}</span>;
  }

  return (
    <span className="flex min-w-0 items-center" title={bandName}>
      <img className="block h-4 w-auto max-w-[70px] object-contain dark:hidden" src={assetUrl(getBandLogoUrl(bandId, locale))} alt={bandName} onError={() => setFailed(true)} />
      <img className="hidden h-4 w-auto max-w-[70px] object-contain dark:block" src={assetUrl(getBandLogoWhiteUrl(bandId, locale))} alt={bandName} onError={() => setFailed(true)} />
    </span>
  );
}
