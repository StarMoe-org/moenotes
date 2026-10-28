"use client";

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
  ongoing: "bg-primary-container text-on-primary-container",
  upcoming: "bg-tertiary-container text-on-tertiary-container",
  permanent: "bg-success-container text-on-success-container",
  ended: "bg-surface-container-highest text-on-surface-variant",
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
    <span className={`inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-shape-sm px-2 text-label-medium ${toneByStatus[status]}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {t(locale, `schedule.${status}`)}
      {detail && <span className="truncate opacity-80">· {detail}</span>}
    </span>
  );
}
