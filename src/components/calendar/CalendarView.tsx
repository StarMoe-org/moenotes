import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import BaseFilters, { CharacterFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import CollectionViewSwitch, { useCollectionView } from "@/components/shared/CollectionViewSwitch";
import ServerScope from "@/components/shared/ServerScope";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import {
  CALENDAR_KINDS,
  CALENDAR_KIND_COLORS,
  calendarItems,
  filterCalendarItems,
  type CalendarBirthday,
  type CalendarData,
  type CalendarItem,
  type CalendarKind,
} from "@/lib/calendar/data";
import {
  calendarDayAt,
  chunkWeeks,
  itemsOnDay,
  layoutWeekLimited,
  monthGrid,
  monthKey,
  monthOf,
  parseCalendarDate,
  parseMonthKey,
  shiftMonth,
  weekStartFor,
  weekdayOrder,
  type CalendarDate,
  type CalendarMonth,
} from "@/lib/calendar/model";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { entityLinkPath } from "@/lib/route/entity-link";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import { browserTimeZone, formatScheduleRange, MASTER_TIME_ZONE, utcOffsetLabel } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  data: ServerFacetedValue<CalendarData>;
  birthdays: CalendarBirthday[];
  servers: GameServer[];
  /** Characters for the character filter, in display order. */
  characters: Array<{ id: number; name: string }>;
  /** The month the static HTML shows (the build's), until the reader's clock is known. */
  buildMonth: string;
}

type CalendarViewMode = "grid" | "list";
const VIEWS: readonly CalendarViewMode[] = ["grid", "list"];
/** Bar rows a desktop week shows before "+N more". */
const MAX_LANES = 4;

/** Month and list views of everything dated on the reader's server, in the reader's time zone. */
export default function CalendarView({ locale, data, birthdays, servers, characters, buildMonth }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const { entries } = valueForServer(data, server);
  const now = useNow();
  const displayZone = useDisplayTimeZone();
  // The static HTML lays days out in the game's time; the reader's zone takes over after hydration.
  const timeZone = displayZone ?? MASTER_TIME_ZONE;
  const [view, setView] = useCollectionView<CalendarViewMode>("calendar", VIEWS, "grid", { syncUrl: false });
  const [month, setMonth] = useState<CalendarMonth>(() => parseMonthKey(buildMonth) ?? { year: 2026, month: 1 });
  const [selectedKinds, setSelectedKinds] = useState<CalendarKind[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<CalendarDate | null>(null);
  const weekStart = useMemo(() => weekStartFor(locale), [locale]);
  const today = now === null ? null : calendarDayAt(now, displayZone ?? browserTimeZone() ?? MASTER_TIME_ZONE);

  // ?view=month|list&month=YYYY-MM: read once, then kept in the URL.
  useEffect(() => {
    const fromView = readQueryParam("view");
    if (fromView === "list") setView("list");
    else if (fromView === "month") setView("grid");
    const fromMonth = parseMonthKey(readQueryParam("month"));
    if (fromMonth) setMonth(fromMonth);
    else setMonth(monthOf(calendarDayAt(Date.now(), browserTimeZone() ?? MASTER_TIME_ZONE)));
  }, []);

  const pickView = (next: CalendarViewMode) => {
    setView(next);
    replaceQueryParam("view", next === "list" ? "list" : "month");
  };
  const goMonth = (next: CalendarMonth) => {
    setMonth(next);
    setSelectedDay(null);
    replaceQueryParam("month", monthKey(next));
  };

  const days = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const allItems = useMemo(() => calendarItems(entries, birthdays, first, last, timeZone), [entries, birthdays, first, last, timeZone]);
  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return filterCalendarItems(allItems, { kinds: selectedKinds, characterIds: selectedCharacters }).filter((item) => !needle || item.title.toLocaleLowerCase().includes(needle));
  }, [allItems, selectedKinds, selectedCharacters, query]);
  const monthFirst = `${monthKey(month)}-01`;
  const monthLast = `${monthKey(month)}-${String(new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()).padStart(2, "0")}`;
  const monthItems = useMemo(() => items.filter((item) => item.start <= monthLast && item.end >= monthFirst), [items, monthFirst, monthLast]);

  const hasFilters = selectedKinds.length > 0 || selectedCharacters.length > 0 || query.trim() !== "";
  const resetFilters = () => {
    setSelectedKinds([]);
    setSelectedCharacters([]);
    setQuery("");
  };

  const filterContent = (
    <BaseFilters
      variant="plain"
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      title={t(locale, "calendar.filterTitle")}
      resultCount={monthItems.length}
      totalCount={allItems.filter((item) => item.start <= monthLast && item.end >= monthFirst).length}
      hasActiveFilters={hasFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "calendar.kindFilter")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedKinds.length === 0} onClick={() => setSelectedKinds([])}>ALL</FilterButton>
          {CALENDAR_KINDS.map((kind) => (
            <FilterButton key={kind} active={selectedKinds.includes(kind)} onClick={() => setSelectedKinds((current) => toggleArrayItem(current, kind))}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CALENDAR_KIND_COLORS[kind] }} aria-hidden="true" />
                {t(locale, `calendar.kinds.${kind}`)}
              </span>
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      <CharacterFilter
        title={t(locale, "calendar.characterFilter")}
        characters={characters}
        selectedCharacters={selectedCharacters}
        onChange={setSelectedCharacters}
      />
    </BaseFilters>
  );
  useQuickFilter(t(locale, "calendar.filterTitle"), filterContent, [selectedKinds, selectedCharacters, query, monthItems.length, allItems.length, locale, characters]);

  const monthTitle = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(month.year, month.month - 1, 1));
  const zoneLabel = displayZone ? t(locale, "calendar.timeZone", { zone: `${displayZone} (${utcOffsetLabel(Date.now(), displayZone)})` }) : "";

  return (
    <ServerScope
      locale={locale}
      servers={servers}
      server={server}
      onChange={pickServer}
      actions={<CollectionViewSwitch locale={locale} views={VIEWS} value={view} onChange={pickView} label={t(locale, "calendar.views.label")} labels={{ grid: t(locale, "calendar.views.month"), list: t(locale, "calendar.views.list") }} compact />}
    >
      <div className="mn-paper p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <NavButton label={t(locale, "calendar.previousMonth")} onClick={() => goMonth(shiftMonth(month, -1))}><path d="m15 6-6 6 6 6" /></NavButton>
          <NavButton label={t(locale, "calendar.nextMonth")} onClick={() => goMonth(shiftMonth(month, 1))}><path d="m9 6 6 6-6 6" /></NavButton>
          <h2 className="mx-1 font-[var(--mn-font-display)] text-xl text-[var(--mn-text)]" aria-live="polite">{monthTitle}</h2>
          <button
            type="button"
            onClick={() => goMonth(monthOf(calendarDayAt(Date.now(), timeZone)))}
            className="mn-focus rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-3 py-1.5 text-xs font-bold text-[var(--mn-accent-deep)] hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]"
          >
            {t(locale, "calendar.today")}
          </button>
          {zoneLabel && <span className="ml-auto text-[11px] font-medium text-[var(--mn-text-muted)]">{zoneLabel}</span>}
        </div>

        {view === "grid" ? (
          <MonthGrid
            locale={locale}
            days={days}
            month={month}
            items={items}
            today={today}
            weekStart={weekStart}
            selectedDay={selectedDay}
            onSelectDay={(day) => setSelectedDay((current) => (current === day ? null : day))}
          />
        ) : (
          <MonthList locale={locale} items={monthItems} monthFirst={monthFirst} monthLast={monthLast} today={today} timeZone={displayZone} />
        )}

        {monthItems.length === 0 && (
          <div className="mt-4 text-center text-sm text-[var(--mn-text-muted)]">
            <p>{t(locale, hasFilters ? "calendar.emptyFiltered" : "calendar.empty")}</p>
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="mn-focus mt-3 rounded-full border border-[var(--mn-border)] px-4 py-2 text-xs font-bold text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]">
                {t(locale, "calendar.resetFilters")}
              </button>
            )}
          </div>
        )}
      </div>

      {view === "grid" && selectedDay && (
        <DayPanel locale={locale} day={selectedDay} items={itemsOnDay(items, selectedDay)} timeZone={displayZone} onClose={() => setSelectedDay(null)} />
      )}
    </ServerScope>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="mn-focus mn-icon-button grid h-9 w-9 place-items-center border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)] hover:text-[var(--mn-accent-deep)]"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </button>
  );
}

function itemHref(item: CalendarItem, locale: AppLocale): string | null {
  return item.link ? localizePath(entityLinkPath(item.link), locale) : null;
}

function itemTitle(item: CalendarItem, locale: AppLocale): string {
  return item.kind === "birthday" ? t(locale, "calendar.birthdayOf", { name: item.title }) : item.title;
}

/** A bar tinted with its color (a theme variable or a character color), the text in the page's ink. */
function barStyle(item: CalendarItem): CSSProperties {
  return {
    background: `color-mix(in srgb, ${item.color} 28%, var(--mn-paper))`,
    borderLeft: `3px solid ${item.color}`,
  };
}

function MonthGrid({ locale, days, month, items, today, weekStart, selectedDay, onSelectDay }: {
  locale: AppLocale;
  days: CalendarDate[];
  month: CalendarMonth;
  items: CalendarItem[];
  today: CalendarDate | null;
  weekStart: number;
  selectedDay: CalendarDate | null;
  onSelectDay: (day: CalendarDate) => void;
}) {
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2023-01-01 was a Sunday.
  const weekdayNames = weekdayOrder(weekStart).map((weekday) => weekdayFormat.format(Date.UTC(2023, 0, 1 + weekday)));
  const weeks = chunkWeeks(days);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--mn-glass-border)]" role="grid" aria-readonly="true">
      <div className="grid grid-cols-7 border-b border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)]" role="row">
        {weekdayNames.map((name, index) => (
          <div key={index} role="columnheader" className="px-1 py-1.5 text-center text-[11px] font-black text-[var(--mn-text-muted)]">{name}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <WeekRow key={week[0]} locale={locale} week={week} month={month} items={items} today={today} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      ))}
    </div>
  );
}

function WeekRow({ locale, week, month, items, today, selectedDay, onSelectDay }: {
  locale: AppLocale;
  week: CalendarDate[];
  month: CalendarMonth;
  items: CalendarItem[];
  today: CalendarDate | null;
  selectedDay: CalendarDate | null;
  onSelectDay: (day: CalendarDate) => void;
}) {
  const layout = useMemo(() => layoutWeekLimited(items, week, MAX_LANES), [items, week]);
  const perDay = useMemo(() => week.map((day) => itemsOnDay(items, day)), [items, week]);
  return (
    <div className="relative grid grid-cols-7 border-b border-[var(--mn-glass-border)] last:border-b-0" role="row">
      {week.map((day, column) => {
        const parts = parseCalendarDate(day)!;
        const inMonth = parts.month === month.month;
        const isToday = day === today;
        const dayItems = perDay[column]!;
        const hidden = layout.hiddenByColumn[column]!;
        return (
          <button
            key={day}
            type="button"
            role="gridcell"
            onClick={() => onSelectDay(day)}
            aria-pressed={selectedDay === day}
            aria-label={t(locale, "calendar.dayItems", { date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(Date.UTC(parts.year, parts.month - 1, parts.day)), count: dayItems.length })}
            className={`mn-focus flex min-h-[4.5rem] min-w-0 flex-col items-stretch border-r border-[var(--mn-glass-border)] p-1 text-left align-top last:border-r-0 sm:min-h-[8.5rem] ${inMonth ? "bg-[var(--mn-paper)]" : "bg-[var(--mn-cream-deep)]/50"} ${selectedDay === day ? "outline outline-2 -outline-offset-2 outline-[var(--mn-accent)]" : ""}`}
          >
            <span className={`grid h-6 w-6 place-items-center self-start rounded-full text-xs font-bold tabular-nums ${isToday ? "bg-[var(--mn-accent-deep)] text-[var(--mn-paper)]" : inMonth ? "text-[var(--mn-text)]" : "text-[var(--mn-text-muted)]"}`}>
              {parts.day}
            </span>
            {/* Narrow screens: a dot per item (up to four) instead of bars. */}
            {dayItems.length > 0 && (
              <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                {dayItems.slice(0, 4).map((item) => <span key={item.id} className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />)}
                {dayItems.length > 4 && <span className="text-[9px] font-bold leading-none text-[var(--mn-text-muted)]">+</span>}
              </span>
            )}
            {hidden > 0 && (
              // In the last bar row, which a day with more items than rows leaves free (layoutWeekLimited).
              <span className="absolute hidden truncate px-1.5 text-[10px] font-bold leading-5 text-[var(--mn-text-muted)] sm:block" style={{ top: `calc(2rem + ${MAX_LANES - 1} * 1.375rem)`, left: `calc(${column} * 100% / 7)`, width: "calc(100% / 7)" }}>
                {t(locale, "calendar.more", { count: hidden })}
              </span>
            )}
          </button>
        );
      })}
      {/* Wide screens: bars over the day cells, one row per lane. */}
      <div className="pointer-events-none absolute inset-x-0 top-8 hidden grid-cols-7 gap-y-0.5 sm:grid" style={{ gridAutoRows: "1.25rem" }}>
        {layout.visible.map((segment) => {
          const item = segment.item;
          const href = itemHref(item, locale);
          const title = itemTitle(item, locale);
          const radius = `${segment.continuesBefore ? "0" : "0.5rem"} ${segment.continuesAfter ? "0" : "0.5rem"} ${segment.continuesAfter ? "0" : "0.5rem"} ${segment.continuesBefore ? "0" : "0.5rem"}`;
          const style: CSSProperties = { ...barStyle(item), gridColumn: `${segment.column + 1} / span ${segment.span}`, gridRow: segment.lane + 1, borderRadius: radius, ...(segment.continuesBefore ? { borderLeftWidth: 0 } : {}) };
          const className = "pointer-events-auto mx-0.5 flex min-w-0 items-center gap-1 overflow-hidden px-1.5 text-[11px] font-bold leading-5 text-[var(--mn-text)] hover:brightness-95";
          const content = <span className="truncate">{title}</span>;
          return href ? (
            <a key={`${item.id}-${segment.column}`} href={href} className={`mn-focus ${className}`} style={style} title={title}>{content}</a>
          ) : (
            <span key={`${item.id}-${segment.column}`} className={className} style={style} title={title}>{content}</span>
          );
        })}
      </div>
    </div>
  );
}

function ItemRow({ locale, item, timeZone }: { locale: AppLocale; item: CalendarItem; timeZone: string | null }) {
  const assetUrl = useAssetUrl();
  const href = itemHref(item, locale);
  const title = itemTitle(item, locale);
  const range = item.kind === "birthday" ? t(locale, "calendar.allDay") : item.openEnded ? `${formatScheduleRange(item.startAt, "", locale, timeZone)} · ${t(locale, "calendar.openEnded")}` : formatScheduleRange(item.startAt, item.endAt, locale, timeZone);
  const body = (
    <>
      {item.kind === "birthday" ? (
        <img src={assetUrl(getCharacterFaceIconUrl(item.characterIds[0] ?? 0))} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full border-2 bg-[var(--mn-cream-deep)] object-cover" style={{ borderColor: item.color }} />
      ) : (
        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-[var(--mn-accent-deep)]">{t(locale, `calendar.kinds.${item.kind}`)}</span>
        <span className="block truncate text-sm font-bold text-[var(--mn-text)]">{title}</span>
        {range && <span className="block truncate text-xs tabular-nums text-[var(--mn-text-muted)]">{range}</span>}
      </span>
    </>
  );
  return (
    <li className="min-w-0">
      {href ? (
        <a href={href} className="mn-focus flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--mn-accent-soft)]">{body}</a>
      ) : (
        <div className="flex min-w-0 items-center gap-3 px-2 py-2">{body}</div>
      )}
    </li>
  );
}

function DayPanel({ locale, day, items, timeZone, onClose }: { locale: AppLocale; day: CalendarDate; items: CalendarItem[]; timeZone: string | null; onClose: () => void }) {
  const parts = parseCalendarDate(day)!;
  const label = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    <section className="mn-paper mt-4 p-3 sm:p-4" aria-label={label}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-[var(--mn-font-display)] text-base text-[var(--mn-text)]">{label}</h3>
        <button type="button" onClick={onClose} className="mn-focus rounded-full px-3 py-1 text-xs font-bold text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]">{t(locale, "calendar.closeDay")}</button>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--mn-text-muted)]">{t(locale, "calendar.empty")}</p>
      ) : (
        <ul className="divide-y divide-[var(--mn-glass-border)]">{items.map((item) => <ItemRow key={item.id} locale={locale} item={item} timeZone={timeZone} />)}</ul>
      )}
    </section>
  );
}

/** The month as a list, grouped by the day each item starts (items running into the month from before open it). */
function MonthList({ locale, items, monthFirst, monthLast, today, timeZone }: { locale: AppLocale; items: CalendarItem[]; monthFirst: CalendarDate; monthLast: CalendarDate; today: CalendarDate | null; timeZone: string | null }) {
  const groups = useMemo(() => {
    const byDay = new Map<CalendarDate, CalendarItem[]>();
    for (const item of items) {
      const day = item.start < monthFirst ? monthFirst : item.start;
      if (day > monthLast) continue;
      const list = byDay.get(day) ?? [];
      list.push(item);
      byDay.set(day, list);
    }
    return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [items, monthFirst, monthLast]);
  return (
    <div className="space-y-3">
      {groups.map(([day, list]) => {
        const parts = parseCalendarDate(day)!;
        const label = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(Date.UTC(parts.year, parts.month - 1, parts.day));
        return (
          <section key={day} className="rounded-2xl border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] p-2">
            <h3 className={`px-2 pb-1 text-xs font-black ${day === today ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)]"}`}>
              {label}{day === today ? ` · ${t(locale, "calendar.today")}` : ""}
            </h3>
            <ul className="divide-y divide-[var(--mn-glass-border)]">{list.map((item) => <ItemRow key={item.id} locale={locale} item={item} timeZone={timeZone} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
