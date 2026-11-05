"use client";

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getAssetUrl } from "@/lib/assets/url";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import type { StoryChapterSummary } from "@/lib/story/chapters";
import { formatPlayTime, storyEpisodeLabel } from "@/lib/story/labels";
import { storyPath } from "@/lib/story/paths";
import BannerImage from "@/components/shared/BannerImage";

/**
 * One chapter as its own page: the banner, the chapter's copy and its main/another/extra episode runs. This is the
 * view the story list used to show inline, before its cards opened a chapter page.
 */
export default function ChapterDetail({ chapter, locale }: { chapter: StoryChapterSummary; locale: AppLocale }) {
  const assetUrl = useAssetUrl();
  const chapterArt = chapter.banner || chapter.image
    ? getAssetUrl({ path: `Story/${chapter.banner ? "Banner" : "Image"}/Chapter/${chapter.banner || chapter.image}.png`, type: "raw", locale })
    : "";

  return (
    <article className="mn-list-group overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-low shadow-elevation-1">
      <div className="flex flex-col">
        {chapterArt && <BannerImage src={chapterArt} alt="" fallback={chapter.name} eager />}
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="text-label-medium text-primary">{chapter.bandName}</p>
          <h1 className="mt-2 text-balance text-headline-small text-on-surface">{chapter.name}</h1>
          {chapter.description && <p className="mt-4 whitespace-pre-line leading-7 text-on-surface-variant">{chapter.description}</p>}
          {chapter.characterNames.length > 0 && <p className="mt-4 text-body-small text-on-surface-variant">{chapter.characterNames.join(" · ")}</p>}
          <p className="mt-3 text-label-small tabular-nums text-on-surface-variant">{t(locale, "story.ui.episodeCount", { count: chapter.episodeCount })}</p>
        </div>
      </div>
      <div className="space-y-5 border-t-[1.5px] border-outline-variant bg-surface-container p-4 sm:p-6">
        {chapter.runs.map((run) => (
          <div key={run.kind}>
            {run.kind !== "main" && <h2 className="mb-3 text-label-medium text-on-surface-variant">{t(locale, run.kind === "another" ? "story.ui.anotherStories" : "story.ui.extraStories")}</h2>}
            {/* Columns as wide as a banner and a title need, however narrow the content column is. */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
              {run.episodes.map((episode) => {
                const banner = episode.assets.banner
                  ? getAssetUrl({ path: `Story/Banner/Episode/${episode.assets.banner}.png`, type: "raw", locale })
                  : "";
                return (
                  <a key={episode.id} href={localizePath(storyPath(episode.advId), locale)} className="md3-list-card group flex min-w-0 items-center gap-4 p-3">
                    {banner ? (
                      <img src={assetUrl(banner)} alt="" className="h-16 w-28 shrink-0 rounded-shape-md object-cover" loading="lazy" />
                    ) : (
                      <span className="md3-placeholder h-16 w-28 shrink-0 rounded-shape-md" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-label-small text-primary">
                        {storyEpisodeLabel(locale, episode)}
                        {episode.episodeKind === "another" && episode.characterNames[0] && <span className="ml-1.5 font-bold text-on-surface-variant">{episode.characterNames[0]}</span>}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-label-large text-on-surface">{episode.title}</h3>
                      {episode.playTime ? <p className="mt-1 text-label-small tabular-nums text-on-surface-variant">{formatPlayTime(episode.playTime)}</p> : null}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
