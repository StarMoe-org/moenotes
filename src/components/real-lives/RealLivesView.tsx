import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import BandLogo from "@/components/shared/BandLogo";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import ServerScope from "@/components/shared/ServerScope";
import TimesNote from "@/components/shared/TimesNote";
import { t } from "@/i18n";
import { realLiveStatus, type RealLiveStatus, type RealLiveViewModel } from "@/lib/real-lives/data";
import { formatMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  lives: ServerFaceted<RealLiveViewModel>[];
  servers: GameServer[];
}

const toneByStatus: Record<RealLiveStatus, string> = {
  ongoing: "border-[color-mix(in_srgb,var(--mn-accent)_45%,transparent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]",
  ready: "border-[color-mix(in_srgb,var(--mn-mint)_80%,transparent)] bg-[var(--mn-mint-soft)] text-[var(--mn-mint-deep)]",
  upcoming: "border-[color-mix(in_srgb,var(--mn-pink)_70%,transparent)] bg-[var(--mn-pink-soft)] text-[var(--mn-ink-soft)]",
  permanent: "border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] text-[var(--mn-text-muted)]",
  ended: "border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] text-[var(--mn-text-muted)]",
};

/** The bands' real-world lives the game schedules, earliest first. */
export default function RealLivesView({ locale, servers, lives: initialLives }: Props) {
  const { server, pickServer, items: lives } = useServerList(locale, servers, initialLives);
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      {lives.length === 0 ? (
        <p className="mn-paper p-8 text-center text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "realLives.empty")}</p>
      ) : (
        <>
          <ol className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {lives.map((live) => {
              const status = now === null ? null : realLiveStatus(live, now);
              const names = live.bands.map((band) => band.name).filter(Boolean).join(" / ");
              return (
                <li key={live.id} className="mn-paper flex min-w-0 flex-col gap-4 p-5" aria-label={names || `#${live.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {status && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${toneByStatus[status]}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                        {t(locale, status === "ready" ? "realLives.ready" : `schedule.${status}`)}
                      </span>
                    )}
                    <ScheduleCountdown locale={locale} startAt={live.startAt} endAt={live.endAt} now={now} />
                    <ServerAvailabilityBadge locale={locale} entity={live} servers={servers} />
                  </div>
                  <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
                    {live.bands.map((band) => (
                      <span key={band.id} className="flex items-center gap-2">
                        <span className="[&_img]:h-8 [&_img]:max-w-[120px]"><BandLogo bandId={band.id} bandName={band.name} locale={locale} /></span>
                      </span>
                    ))}
                  </div>
                  {names && <h2 className="font-[var(--mn-font-display)] text-lg leading-tight text-[var(--mn-text)]">{names}</h2>}
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="font-semibold text-[var(--mn-text-muted)]">{t(locale, "realLives.readyAt")}</dt>
                    <dd className="tabular-nums text-[var(--mn-text)]">{formatMasterDate(live.readyAt, locale, true, timeZone) || "—"}</dd>
                    <dt className="font-semibold text-[var(--mn-text-muted)]">{t(locale, "realLives.startAt")}</dt>
                    <dd className="tabular-nums font-bold text-[var(--mn-text)]">{formatMasterDate(live.startAt, locale, true, timeZone) || "—"}</dd>
                    <dt className="font-semibold text-[var(--mn-text-muted)]">{t(locale, "realLives.endAt")}</dt>
                    <dd className="tabular-nums text-[var(--mn-text)]">{formatMasterDate(live.endAt, locale, true, timeZone) || "—"}</dd>
                  </dl>
                </li>
              );
            })}
          </ol>
          <TimesNote locale={locale} value={lives[0]?.startAt ?? ""} timeZone={timeZone} className="mt-4 text-xs text-[var(--mn-text-muted)]" />
        </>
      )}
    </ServerScope>
  );
}
