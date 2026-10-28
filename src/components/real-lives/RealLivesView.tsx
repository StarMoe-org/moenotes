"use client";

import { useMemo } from "react";
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
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  lives: ServerFaceted<RealLiveViewModel>[];
  servers: GameServer[];
}

const toneByStatus: Record<RealLiveStatus, string> = {
  ongoing: "border-primary/45 bg-secondary-container text-primary",
  ready: "border-success/80 bg-success-container text-on-success-container",
  upcoming: "border-category1/70 bg-category1-container text-on-surface-variant",
  permanent: "border-outline-variant bg-surface-container-highest text-on-surface-variant",
  ended: "border-outline-variant bg-surface-container-highest text-on-surface-variant",
};

/** The bands' real-world lives the game schedules, earliest first. */
export default function RealLivesView({ locale, servers, lives: initialLives }: Props) {
  const { server, pickServer, items: lives } = useServerList(locale, servers, initialLives);
  const { showSpoiler, now } = useSpoilerSetting();
  const timeZone = useDisplayTimeZone();
  const visibleLives = useMemo(() => {
    if (showSpoiler) return lives;
    return lives.filter((live) => !isSpoiler(live.startAt, now));
  }, [lives, showSpoiler, now]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      {visibleLives.length === 0 ? (
        <p className="md3-surface p-8 text-center text-body-medium text-on-surface-variant">{t(locale, "realLives.empty")}</p>
      ) : (
        <>
          <ol className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleLives.map((live) => {
              const status = now === null ? null : realLiveStatus(live, now);
              const names = live.bands.map((band) => band.name).filter(Boolean).join(" / ");
              return (
                <li key={live.id} className="md3-surface flex min-w-0 flex-col gap-4 p-5" aria-label={names || `#${live.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {status && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-label-small ${toneByStatus[status]}`}>
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
                  {names && <h2 className="font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface">{names}</h2>}
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-medium">
                    <dt className="font-semibold text-on-surface-variant">{t(locale, "realLives.readyAt")}</dt>
                    <dd className="tabular-nums text-on-surface">{formatMasterDate(live.readyAt, locale, true, timeZone) || "—"}</dd>
                    <dt className="font-semibold text-on-surface-variant">{t(locale, "realLives.startAt")}</dt>
                    <dd className="tabular-nums font-bold text-on-surface">{formatMasterDate(live.startAt, locale, true, timeZone) || "—"}</dd>
                    <dt className="font-semibold text-on-surface-variant">{t(locale, "realLives.endAt")}</dt>
                    <dd className="tabular-nums text-on-surface">{formatMasterDate(live.endAt, locale, true, timeZone) || "—"}</dd>
                  </dl>
                </li>
              );
            })}
          </ol>
          <TimesNote locale={locale} value={visibleLives[0]?.startAt ?? ""} timeZone={timeZone} className="mt-4 text-body-small text-on-surface-variant" />
        </>
      )}
    </ServerScope>
  );
}
