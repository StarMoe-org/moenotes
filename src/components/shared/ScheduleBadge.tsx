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
  ongoing: "border-[color-mix(in_srgb,var(--mn-accent)_45%,transparent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]",
  upcoming: "border-[color-mix(in_srgb,var(--mn-pink)_70%,transparent)] bg-[var(--mn-pink-soft)] text-[var(--mn-ink-soft)]",
  permanent: "border-[color-mix(in_srgb,var(--mn-mint)_80%,transparent)] bg-[var(--mn-mint-soft)] text-[var(--mn-mint-deep)]",
  ended: "border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] text-[var(--mn-text-muted)]",
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
