import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { formatMasterDate } from "@/lib/schedule";
import { countdownParts, type CountdownParts } from "@/lib/schedule/countdown";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";

export interface ScheduleCountdownProps {
  locale: AppLocale;
  startAt: string | null | undefined;
  endAt: string | null | undefined;
  /** Clock from a parent's `useNow()`; when omitted the component keeps its own (once a minute). */
  now?: number | null;
  /** Show "Permanent" for open-ended schedules (default false: nothing renders). */
  showPermanent?: boolean;
  className?: string;
}

const toneByStatus: Record<CountdownParts["status"], string> = {
  ongoing: "text-[var(--mn-accent-deep)]",
  upcoming: "text-[var(--mn-ink-soft)]",
  permanent: "text-[var(--mn-mint-deep)]",
  ended: "text-[var(--mn-text-muted)]",
};

/** "Starts in 3d" / "5h left" / "Ended" for one schedule. */
export function countdownText(locale: AppLocale, parts: CountdownParts): string {
  if (parts.status === "ended") return t(locale, "schedule.ended");
  if (parts.status === "permanent" || !parts.unit) return t(locale, "schedule.permanent");
  const prefix = parts.target === "start" ? "startsIn" : "endsIn";
  return t(locale, `schedule.${prefix}${parts.unit === "hour" ? "Hours" : "Days"}`, { count: parts.count });
}

/**
 * Live countdown text of a MasterData schedule. Renders nothing until the browser clock is known (static HTML never
 * bakes in the build time); the exact edge time is the hover title, in the reader's display zone.
 */
export default function ScheduleCountdown({ locale, startAt, endAt, now: givenNow, showPermanent = false, className = "" }: ScheduleCountdownProps) {
  const ownNow = useNow();
  const timeZone = useDisplayTimeZone();
  const now = givenNow === undefined ? ownNow : givenNow;
  if (now === null) return null;
  const parts = countdownParts(startAt, endAt, now);
  if (parts.status === "permanent" && !showPermanent) return null;
  const edge = parts.target === "start" ? startAt : parts.target === "end" ? endAt : parts.status === "ended" ? endAt : null;
  const title = edge ? formatMasterDate(edge, locale, true, timeZone) : undefined;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold tabular-nums ${toneByStatus[parts.status]} ${className}`} title={title}>
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {countdownText(locale, parts)}
    </span>
  );
}
