import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { hoursUntil, parseMasterDate, scheduleStatus, type ScheduleStatus } from "@/lib/schedule";

interface Props {
  locale: AppLocale;
  startAt: string;
  endAt: string;
  /** From `useNow()`; nothing renders until the browser clock is known. */
  now: number | null;
  countdown?: boolean;
}

const toneByStatus: Record<ScheduleStatus, string> = {
  ongoing: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]",
  upcoming: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]",
  permanent: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
  ended: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]",
};

const TWO_DAYS = 48 * 3_600_000;

function countdownLabel(locale: AppLocale, status: ScheduleStatus, startAt: string, endAt: string, now: number): string {
  const target = status === "ongoing" ? parseMasterDate(endAt) : status === "upcoming" ? parseMasterDate(startAt) : null;
  if (target === null) return "";
  const prefix = status === "ongoing" ? "endsIn" : "startsIn";
  const remaining = target - now;
  return remaining < TWO_DAYS
    ? t(locale, `schedule.${prefix}Hours`, { count: hoursUntil(target, now) })
    : t(locale, `schedule.${prefix}Days`, { count: Math.ceil(remaining / 86_400_000) });
}

export default function ScheduleBadge({ locale, startAt, endAt, now, countdown = true }: Props) {
  if (now === null) return null;
  const status = scheduleStatus(startAt, endAt, now);
  const detail = countdown ? countdownLabel(locale, status, startAt, endAt, now) : "";

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${toneByStatus[status]}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {t(locale, `schedule.${status}`)}
      {detail && <span className="truncate font-medium opacity-80">· {detail}</span>}
    </span>
  );
}
