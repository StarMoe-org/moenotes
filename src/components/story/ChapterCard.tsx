"use client";

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getAssetUrl } from "@/lib/assets/url";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import { formatMasterDay } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import type { StoryChapterSummary } from "@/lib/story/chapters";
import { storyChapterPath } from "@/lib/story/paths";
import type { StoryChapterSection } from "@/lib/story/sections";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { Icon } from "@/components/shared/icons";

/**
 * A chapter of the main or event story as a browse card: its banner with (for an event) the schedule's status, then
 * the event number and band, the chapter's title and blurb, and the event's dates.
 */
export default function ChapterCard({ chapter, locale, section }: { chapter: StoryChapterSummary; locale: AppLocale; section: StoryChapterSection }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const assetUrl = useAssetUrl();
  const art = chapter.banner || chapter.image
    ? getAssetUrl({ path: `Story/${chapter.banner ? "Banner" : "Image"}/Chapter/${chapter.banner || chapter.image}.png`, type: "raw", locale })
    : "";
  // A mixed event has no band of its own; the list labels it with the filter's "mixed" option.
  const bandLabel = chapter.bandName || (section === "event" && chapter.bandId === 0 ? t(locale, "story.ui.mixedBand") : "");
  const bandIcon = chapter.bandId > 0 ? assetUrl(getBandSmallIconUrl(chapter.bandId)) : "";
  const start = section === "event" ? formatMasterDay(chapter.startAt, locale, timeZone) : "";
  const end = section === "event" && chapter.endAt ? formatMasterDay(chapter.endAt, locale, timeZone) : "";
  const dates = start && end
    ? t(locale, "schedule.range", { start, end })
    : start
      ? t(locale, "schedule.from", { start })
      : "";

  return (
    <a
      href={localizePath(storyChapterPath(section, chapter.chapterId), locale)}
      className="md3-list-card group flex min-w-0 flex-col overflow-hidden text-left"
      data-list-item-id={chapter.chapterId}
    >
      <div className="relative border-b border-outline-variant">
        <BannerImage src={art} alt="" fallback={chapter.name} />
        {section === "event" && (
          <div className="pointer-events-none absolute right-2 top-2">
            <ScheduleBadge locale={locale} startAt={chapter.startAt} endAt={chapter.endAt} now={now} countdown={false} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex min-w-0 items-center gap-2">
          {chapter.eventId !== null && (
            <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-label-small tabular-nums text-on-surface-variant">#{chapter.eventId}</span>
          )}
          {bandIcon ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface-container py-1 pl-1.5 pr-2.5" title={bandLabel}>
              <img src={bandIcon} alt="" className="h-5 w-auto shrink-0 object-contain" loading="lazy" />
              <span className="min-w-0 truncate text-label-medium text-on-surface-variant">{bandLabel}</span>
            </span>
          ) : bandLabel ? (
            <span className="min-w-0 truncate rounded-full bg-surface-container px-2.5 py-1 text-label-medium text-on-surface-variant">{bandLabel}</span>
          ) : null}
        </div>
        <h2 className="line-clamp-2 text-title-small text-on-surface transition-colors group-hover:text-primary sm:text-title-medium">{chapter.name}</h2>
        {chapter.description && <p className="mt-1 line-clamp-1 text-body-small text-on-surface-variant">{chapter.description}</p>}
        {dates && (
          <p className="mt-2 flex items-center gap-1.5 text-label-medium tabular-nums text-on-surface-variant">
            <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" />
            {dates}
          </p>
        )}
      </div>
    </a>
  );
}
