import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { formatScheduleRange, masterUtcLabel, parseMasterDate } from "@/lib/schedule";

interface Scheduled {
  startAt: string;
  endAt: string;
}

interface Props<T extends Scheduled> {
  locale: AppLocale;
  /** The entity as every server has it. */
  faceted: ServerFacetedValue<T>;
  /** The build's servers. */
  servers: readonly GameServer[];
  /** Label of an open-ended schedule. */
  alwaysLabel: string;
}

/** Each server's window of a scheduled entity, in that server's time; nothing when the servers agree. */
export default function ServerSchedules<T extends Scheduled>({ locale, faceted, servers, alwaysLabel }: Props<T>) {
  const windows = faceted.servers
    .filter((server) => servers.includes(server))
    .map((server) => ({ server, ...pick(valueForServer(faceted, server)) }));
  const instants = new Set(windows.map((entry) => `${parseMasterDate(entry.startAt)}-${parseMasterDate(entry.endAt)}`));
  if (windows.length < 2 || instants.size < 2) return null;
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--mn-border)] p-3">
      <p className="text-xs font-black text-[var(--mn-text-muted)]">{t(locale, "gameServer.schedules")}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {windows.map(({ server, startAt, endAt }) => (
          <li key={server} className="flex flex-wrap items-baseline gap-x-2">
            <span className="w-16 shrink-0 text-xs font-bold text-[var(--mn-accent-deep)]">{t(locale, `gameServer.short.${server}`)}</span>
            <span className="tabular-nums text-[var(--mn-text)]">{formatScheduleRange(startAt, endAt, locale) || alwaysLabel}</span>
            <span className="text-[11px] text-[var(--mn-text-muted)]">{masterUtcLabel(startAt || endAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pick({ startAt, endAt }: Scheduled): Scheduled {
  return { startAt, endAt };
}
