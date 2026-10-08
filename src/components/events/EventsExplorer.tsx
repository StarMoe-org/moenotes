import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { orderServers, type GameServer } from "@/config/servers";
import EventBanner from "@/components/events/EventBanner";
import ServerScope from "@/components/shared/ServerScope";
import ServerFlag from "@/components/shared/ServerFlag";
import BaseFilters, { BandFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import type { EventCharacter, EventViewModel } from "@/lib/events/data";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { eventPath } from "@/lib/events/links";
import { formatScheduleRange, scheduleStatus, type ScheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useServerList } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  initialEvents: ServerFaceted<EventViewModel>[];
  servers: GameServer[];
  bands: Array<[number, string]>;
}

const statuses: ScheduleStatus[] = ["ongoing", "upcoming", "ended"];

export default function EventsExplorer({ locale, servers, initialEvents, bands }: Props) {
  const memory = useListPageMemory("event-list");
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const { server, pickServer, items: events } = useServerList(locale, servers, initialEvents);
  const [query, setQuery] = useState("");
  const sort = useListSort("event-list", locale, "date,endingSoon");
  const [selectedStatuses, setSelectedStatuses] = useState<ScheduleStatus[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);

  // Servers that have held events, for a server that has not yet.
  const eventServers = useMemo(() => orderServers(initialEvents.flatMap((event) => event.servers)).filter((entry) => servers.includes(entry)), [initialEvents, servers]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedStatuses(remembered.statuses);
    setSelectedBands(remembered.bands);
  }, [memory.state?.filtersHash]);

  useEffect(() => {
    if (!memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;
    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    const filtersHash = JSON.stringify({ query, statuses: selectedStatuses, bands: selectedBands });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedStatuses, selectedBands, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const eventBands = useMemo(() => {
    const used = new Set(events.flatMap((event) => event.bandIds));
    return bands.filter(([id]) => used.has(id));
  }, [events, bands]);

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return events.filter((event) => {
      // Status depends on the visitor's clock, so it only filters once that is known.
      if (selectedStatuses.length > 0 && now !== null && !selectedStatuses.includes(scheduleStatus(event.startAt, event.endAt, now))) return false;
      if (selectedBands.length > 0 && !event.bandIds.some((id) => selectedBands.includes(id))) return false;
      return !needle || event.searchText.includes(needle);
    });
  }, [events, query, selectedStatuses, selectedBands, now]);

  const sortedEvents = useMemo(() => sortEntries(filteredEvents, sort.value, locale, now === null ? {} : { now }), [filteredEvents, sort.value, locale, now]);

  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedStatuses.length > 0 || selectedBands.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedStatuses([]);
    setSelectedBands([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "events.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "events.searchPlaceholder")}
      resultCount={filteredEvents.length}
      totalCount={events.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "events.status")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedStatuses.length === 0} onClick={() => setSelectedStatuses([])}>ALL</FilterButton>
          {statuses.map((status) => (
            <FilterButton key={status} active={selectedStatuses.includes(status)} onClick={() => setSelectedStatuses((current) => toggleArrayItem(current, status))}>
              {t(locale, `schedule.${status}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>

      {eventBands.length > 0 && (
        <BandFilter
          title={t(locale, "events.band")}
          bands={eventBands}
          selectedBands={selectedBands}
          onChange={setSelectedBands}
        />
      )}
    </BaseFilters>
  );

  useQuickFilter(t(locale, "events.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedStatuses,
    selectedBands,
    eventBands,
    hasActiveFilters,
    filteredEvents.length,
    events.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <MdMuiProvider>
      <section className="min-w-0" aria-live="polite">
        {events.length === 0 ? (
          <NoEventsOnServer locale={locale} server={server} eventServers={eventServers} onPick={pickServer} />
        ) : filteredEvents.length === 0 ? (
          <EmptyState locale={locale} onReset={resetFilters} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5">
            {sortedEvents.map((event) => (
              <EventCard key={event.id} event={event} locale={locale} now={now} timeZone={timeZone} onClick={saveCurrentState} />
            ))}
          </div>
        )}
      </section>
      </MdMuiProvider>
    </ServerScope>
  );
}

function EventCard({ event, locale, now, timeZone, onClick }: { event: EventViewModel; locale: AppLocale; now: number | null; timeZone: string | null; onClick: () => void }) {
  return (
    <a
      href={localizePath(eventPath(event.id), locale)}
      onClick={onClick}
      className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border-[1.5px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] transition-colors hover:border-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
      data-list-item-id={event.id}
      aria-label={t(locale, "events.openDetail", { name: event.name })}
    >
      <div className="relative border-b border-[var(--md-sys-color-outline-variant)]">
        <EventBanner event={event} alt="" />
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <ScheduleBadge locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} countdown />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--md-sys-color-on-surface)] transition-colors group-hover:text-[var(--md-sys-color-primary)]">{event.name}</h3>
          <p className="mt-1 truncate text-xs font-medium tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{formatScheduleRange(event.startAt, event.endAt, locale, timeZone)}</p>
          <ScheduleCountdown locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} className="mt-1" />
        </div>
        {event.characters.length > 0 && (
          <div className="mt-auto border-t border-dashed border-[var(--md-sys-color-outline-variant)] pt-2">
            <Faces characters={event.characters} label={t(locale, "events.bonus")} />
          </div>
        )}
      </div>
    </a>
  );
}

function Faces({ characters, label }: { characters: EventCharacter[]; label: string }) {
  const assetUrl = useAssetUrl();
  const shown = characters.slice(0, 8);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[10px] font-black tracking-wider text-[var(--md-sys-color-primary)]">{label}</span>
      <span className="flex items-center" title={characters.map((character) => character.name).join(" / ")}>
        {shown.map((character) => (
          <img
            key={character.id}
            className="-ml-1.5 h-7 w-7 rounded-full border-2 border-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] object-cover first:ml-0"
            src={assetUrl(getCharacterFaceIconUrl(character.id))}
            alt={character.name}
            loading="lazy"
          />
        ))}
        {characters.length > shown.length && <span className="ml-1 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">+{characters.length - shown.length}</span>}
      </span>
    </span>
  );
}

/** The reader's server has held no event yet; offer the servers that have. */
function NoEventsOnServer({ locale, server, eventServers, onPick }: { locale: AppLocale; server: GameServer; eventServers: GameServer[]; onPick: (server: GameServer) => void }) {
  return (
    <Card variant="outlined" sx={{ px: { xs: 4, sm: 6 }, py: { xs: 4, sm: 6 }, textAlign: "center" }}>
      <Typography component="h2" sx={{ fontFamily: "var(--mn-font-display)", fontSize: 24, color: "var(--md-sys-color-on-surface)" }}>{t(locale, "events.noneOnServer", { server: t(locale, `gameServer.names.${server}`) })}</Typography>
      {eventServers.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {eventServers.map((entry) => (
            <Button
              key={entry}
              variant="outlined"
              onClick={() => onPick(entry)}
              startIcon={<ServerFlag server={entry} className="h-5 w-5" />}
            >
              {t(locale, "events.showServer", { server: t(locale, `gameServer.names.${entry}`) })}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <Card variant="outlined" sx={{ px: { xs: 4, sm: 6 }, py: { xs: 4, sm: 6 }, textAlign: "center" }}>
      <Typography component="h2" sx={{ fontFamily: "var(--mn-font-display)", fontSize: 24, color: "var(--md-sys-color-on-surface)" }}>{t(locale, "events.emptyTitle")}</Typography>
      <Typography variant="body2" sx={{ mx: "auto", mt: 1.5, maxWidth: 576, fontWeight: 500, lineHeight: 1.75, color: "var(--md-sys-color-on-surface-variant)" }}>{t(locale, "events.emptyDescription")}</Typography>
      <Button variant="outlined" onClick={onReset} sx={{ mt: 3 }}>
        {t(locale, "events.reset")}
      </Button>
    </Card>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", statuses: [] as ScheduleStatus[], bands: [] as number[] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      statuses: Array.isArray(parsed.statuses) ? parsed.statuses.filter((status) => statuses.includes(status)) : [],
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
    };
  } catch {
    return fallback;
  }
}
