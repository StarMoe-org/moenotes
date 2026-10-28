"use client";

import type { CSSProperties, ReactNode } from "react";

interface Props {
  /** The entry's name: the page's h1. */
  title: ReactNode;
  /** The line above the name: the band, a status, the kind of entry. */
  eyebrow?: ReactNode;
  /** A second name under the title: the original title, the card's character. */
  subtitle?: ReactNode;
  /** The entry's own colors (a character's main and sub color), drawn as a strap at the start edge. */
  strap?: { main: string; sub?: string | undefined } | null | undefined;
  /** The entry's icon before the names (an item's). */
  media?: ReactNode;
  /** Long names (gacha and event titles) take a smaller size. */
  long?: boolean;
  /** The server switch, at the end of the row. */
  aside?: ReactNode;
  /** Under the names: a catchphrase, a voice line, a description. */
  children?: ReactNode;
}

/** The heading of a detail page: the entry's name instead of a generic "… details" (PageLayout `hideHeader`). */
export default function DetailHero({ title, eyebrow, subtitle, strap, media, long = false, aside, children }: Props) {
  const strapStyle = strap ? ({ "--mn-strap-main": strap.main, "--mn-strap-sub": strap.sub || strap.main } as CSSProperties) : undefined;
  const names = (
    <div className={`flex min-w-0 flex-col gap-2 ${media ? "flex-1" : `flex-[1_1_20rem] ${strap ? "mn-detail-hero pl-5" : ""}`}`} style={media ? undefined : strapStyle}>
      {eyebrow && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label-large text-on-surface-variant">{eyebrow}</div>}
      <h1 className={`max-w-[28ch] text-balance text-on-surface ${long ? "text-headline-small sm:text-headline-large" : "text-headline-large sm:text-display-small"}`}>{title}</h1>
      {subtitle && <div className="text-title-medium text-on-surface-variant">{subtitle}</div>}
      {children}
    </div>
  );
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      {media ? <div className="flex min-w-0 flex-[1_1_20rem] items-center gap-5">{media}{names}</div> : names}
      {aside}
    </header>
  );
}
