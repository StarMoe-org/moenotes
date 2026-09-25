import { useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getAssetUrl } from "@/lib/assets/url";
import type { ParsedStoryScript } from "@/lib/story/parser";
import type { RawStoryCharacter, StoryNeighbor, StoryViewModel } from "@/lib/story/data";
import { storyEpisodeLabel } from "@/lib/story/labels";
import type { RawText } from "@/lib/cards/data";
import StoryScriptReader from "@/components/story/StoryScriptReader";

/** Main episodes have an illustration; bond stories only a banner. Banners carry lettering, so they follow the locale. */
function storyArtworkUrl(story: StoryViewModel | null, locale: AppLocale): string {
  if (!story) return "";
  if (story.category === "main" && story.assets.image) return getAssetUrl({ path: `Story/Image/Episode/${story.assets.image}.png`, type: "raw", locale });
  if (story.assets.banner) return getAssetUrl({ path: `Story/Banner/Episode/${story.assets.banner}.png`, type: "raw", locale });
  return "";
}

export default function StoryDetail({ locale, advId, initialTitle, initialScript, initialCharacters, initialTexts, story, previous, next }: {
  locale: AppLocale;
  advId: number;
  initialTitle: string;
  initialScript: ParsedStoryScript | null;
  initialCharacters: RawStoryCharacter[];
  initialTexts: RawText[];
  story: StoryViewModel | null;
  previous: StoryNeighbor | null;
  next: StoryNeighbor | null;
}) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const artworkUrl = storyArtworkUrl(story, locale);
  const episodeLabel = story ? storyEpisodeLabel(locale, story) : "";
  const eyebrow = [story?.groupTitle || story?.bandName, episodeLabel].filter(Boolean).join(" · ");

  const header = (controls: ReactNode) => <header className="mb-6 overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
    <div className="flex flex-col sm:flex-row">
      {artworkUrl && !artworkFailed && (
        <img
          src={artworkUrl}
          alt=""
          onError={() => setArtworkFailed(true)}
          className={`w-full shrink-0 border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover sm:w-72 sm:border-b-0 sm:border-r-[1.5px] ${story?.category === "main" ? "aspect-[4/3]" : "aspect-[49/16] sm:aspect-auto"}`}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center p-6">
        <p className="text-xs font-black text-[var(--mn-accent)]">{eyebrow || `ADV ${advId}`}</p>
        <h1 className="mt-2 text-2xl font-black text-[var(--mn-text)]">{initialTitle}</h1>
        {story?.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--mn-text-muted)]">{story.description}</p>}
        {eyebrow && <p className="mt-3 text-[11px] font-bold text-[var(--mn-text-muted)]">ADV {advId}</p>}
      </div>
    </div>
    {controls && <div className="border-t border-[var(--mn-border)] px-6 py-4">{controls}</div>}
  </header>;

  return <div className="mx-auto max-w-4xl">
    {initialScript
      ? <StoryScriptReader locale={locale} script={initialScript} characters={initialCharacters} texts={initialTexts} layer="page" renderHeader={header} />
      : <>
        {header(null)}
        <div className="rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-10 text-center font-bold text-[var(--mn-text-muted)]">{t(locale, "story.ui.scriptUnavailable")}</div>
      </>}

    {(previous || next) && <nav className="mt-2 grid gap-3 sm:grid-cols-2">
      {previous ? <NeighborLink neighbor={previous} locale={locale} direction="previous" /> : <span className="hidden sm:block" aria-hidden="true" />}
      {next && <NeighborLink neighbor={next} locale={locale} direction="next" />}
    </nav>}
  </div>;
}

function NeighborLink({ neighbor, locale, direction }: { neighbor: StoryNeighbor; locale: AppLocale; direction: "previous" | "next" }) {
  const isNext = direction === "next";
  const detail = [neighbor.groupTitle, storyEpisodeLabel(locale, neighbor)].filter(Boolean).join(" · ");
  return <a
    href={localizePath(`/story/${neighbor.advId}`, locale)}
    rel={isNext ? "next" : "prev"}
    className={`group flex min-w-0 items-center gap-3 rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp)] ${isNext ? "flex-row-reverse text-right sm:col-start-2" : ""}`}
  >
    <svg className="h-5 w-5 shrink-0 fill-current text-[var(--mn-accent)]" viewBox="0 0 24 24" aria-hidden="true">
      <path d={isNext ? "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" : "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"} />
    </svg>
    <span className="min-w-0">
      <span className="block text-[11px] font-black text-[var(--mn-accent)]">{t(locale, isNext ? "story.ui.nextEpisode" : "story.ui.previousEpisode")}</span>
      {detail && <span className="mt-0.5 block truncate text-[11px] font-bold text-[var(--mn-text-muted)]">{detail}</span>}
      <span className="mt-0.5 block truncate text-sm font-black text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{neighbor.title}</span>
    </span>
  </a>;
}
