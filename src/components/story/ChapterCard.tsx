"use client";

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getAssetUrl } from "@/lib/assets/url";
import { formatScheduleDayRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import type { StoryChapterSummary } from "@/lib/story/chapters";
import { storyChapterPath } from "@/lib/story/paths";
import { storyCategoryKey, type StoryChapterSection } from "@/lib/story/sections";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleBadge from "@/components/shared/ScheduleBadge";

/**
 * A chapter of the main or event story as a browse card: its banner with the category and (for an event) the
 * schedule's status, then the chapter's number, group, length and dates.
 */
export default function ChapterCard({ chapter, locale, section }: { chapter: StoryChapterSummary; locale: AppLocale; section: StoryChapterSection }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const art = chapter.banner || chapter.image
    ? getAssetUrl({ path: `Story/${chapter.banner ? "Banner" : "Image"}/Chapter/${chapter.banner || chapter.image}.png`, type: "raw", locale })
    : "";
  const dates = section === "event" ? formatScheduleDayRange(chapter.startAt, chapter.endAt, locale, timeZone) : "";

  return (
    <a
      href={localizePath(storyChapterPath(section, chapter.chapterId), locale)}
      className="md3-list-card group flex min-w-0 flex-col overflow-hidden text-left"
      data-list-item-id={chapter.chapterId}
    >
      <div className="relative border-b border-outline-variant">
        <BannerImage src={art} alt="" fallback={chapter.name} />
        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <span className="inline-flex h-6 items-center rounded-shape-sm bg-surface-container-highest/95 px-2 text-label-medium text-on-surface">
            {t(locale, storyCategoryKey(chapter.category))}
          </span>
        </div>
        {section === "event" && (
          <div className="pointer-events-none absolute right-2 top-2">
            <ScheduleBadge locale={locale} startAt={chapter.startAt} endAt={chapter.endAt} now={now} countdown={false} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex min-w-0 items-center gap-2 text-label-small tabular-nums text-on-surface-variant">
          {chapter.eventId !== null && <span className="shrink-0">#{chapter.eventId}</span>}
          {chapter.bandName && <span className="truncate">{chapter.bandName}</span>}
          <span className="ml-auto shrink-0">{t(locale, "story.ui.episodeCount", { count: chapter.episodeCount })}</span>
        </div>
        <h2 className="line-clamp-2 text-label-large leading-5 text-on-surface transition-colors group-hover:text-primary">{chapter.name}</h2>
        {dates && <p className="mt-auto truncate text-body-small tabular-nums text-on-surface-variant">{dates}</p>}
      </div>
    </a>
  );
}
