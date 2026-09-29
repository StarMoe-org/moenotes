import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { displayUtcLabel } from "@/lib/schedule";

interface Props {
  locale: AppLocale;
  /** A timestamp of the schedule, for its server's offset while the reader's zone is unknown. */
  value: string;
  /** From useDisplayTimeZone(). */
  timeZone: string | null;
  className?: string;
}

/** Names the zone a page's schedule times are shown in: the reader's, or the server's in the static HTML. */
export default function TimesNote({ locale, value, timeZone, className = "" }: Props) {
  const zone = displayUtcLabel(value, timeZone);
  return <p className={className}>{t(locale, timeZone ? "gameServer.localTimesIn" : "gameServer.timesIn", { zone })}</p>;
}
