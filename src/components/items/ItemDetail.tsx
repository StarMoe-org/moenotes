import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import EntityPager from "@/components/shared/EntityPager";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { entityLinkPath } from "@/lib/route/entity-link";
import type { DetailNeighbors } from "@/lib/route/detail-neighbors";
import { getItemIconUrl } from "@/lib/items/assets";
import type { ItemSourceEntry, ItemUsageEntry } from "@/lib/items/sources";
import type { ItemDetailViewModel } from "@/lib/masterdata/build-item-sources";
import { formatScheduleRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";

interface Props {
  locale: AppLocale;
  detail: ServerFacetedValue<ItemDetailViewModel> | null;
  neighbors: DetailNeighbors;
  servers: GameServer[];
}

const panelHeader = "border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";
// Unlimited stacks carry int32 max; anything that large reads as "no cap".
const UNCAPPED = 2_000_000_000;
/** Targets listed per usage before the rest fold behind a toggle. */
const TARGET_PREVIEW = 8;

/** One item as the page's server has it: its fields, where it comes from and what it is spent on. */
export default function ItemDetail({ locale, detail, neighbors, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const value = useMemo(() => detail && moveReleaseUrls(valueForServer(detail, server), entityServer(detail, server)), [detail, server]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={detail?.servers ?? []}>
      <div className="w-full space-y-8">
        {value ? <ItemDetailView locale={locale} detail={value} /> : <NotFound locale={locale} />}
        <EntityPager locale={locale} listRouteId="items" {...neighbors} />
      </div>
    </ServerScope>
  );
}

function ItemDetailView({ locale, detail }: { locale: AppLocale; detail: ItemDetailViewModel }) {
  const { item } = detail;
  const timeZone = useDisplayTimeZone();
  const period = formatScheduleRange(detail.startAt, detail.endAt, locale, timeZone);
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "items.detail.group"), t(locale, `items.groups.${item.group}`) || String(item.group)],
    [t(locale, "items.detail.type"), `#${item.type}`],
    [t(locale, "items.detail.max"), detail.max > 0 && detail.max < UNCAPPED ? detail.max.toLocaleString(locale) : t(locale, "items.detail.noMax")],
    [t(locale, "items.detail.id"), `#${item.id}`],
  ];
  if (period) facts.push([t(locale, "items.detail.period"), <span className="tabular-nums">{period}</span>]);

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:items-start">
      <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
        <div className="mn-paper overflow-hidden">
          <div className="flex flex-col items-center gap-4 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6 text-center">
            <ItemIcon locale={locale} imagePath={item.imagePath} name={item.name} className="h-28 w-28" />
            <div className="min-w-0">
              <h2 className="font-[var(--mn-font-display)] text-2xl leading-tight text-[var(--mn-text)] sm:text-3xl">{item.name}</h2>
              {detail.reading && <p className="mt-1 text-xs font-semibold text-[var(--mn-text-muted)]">{detail.reading}</p>}
            </div>
          </div>
          {item.desc && <p className="whitespace-pre-line px-6 pt-5 text-sm font-medium leading-7 text-[var(--mn-text)]">{item.desc}</p>}
          <dl className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-6 py-2">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                <dt className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{label}</dt>
                <dd className="min-w-0 text-right font-semibold text-[var(--mn-text)]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-6">
        <SourcesPanel locale={locale} sources={detail.sources} />
        <UsagesPanel locale={locale} usages={detail.usages} />
        <div className="flex justify-start">
          <a href={localizePath(getRoutePathById("items"), locale)} className="mn-focus mn-stamp-press inline-flex rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "items.detail.backToList")}
          </a>
        </div>
      </section>
    </div>
  );
}

function ItemIcon({ locale, imagePath, name, className }: { locale: AppLocale; imagePath: string; name: string; className: string }) {
  const src = useAssetUrl()(getItemIconUrl(imagePath, locale));
  const [failed, setFailed] = useState(false);
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] p-3 shadow-inner ${className}`}>
      {src && !failed
        ? <img className="h-full w-full object-contain" src={src} alt={name} onError={() => setFailed(true)} />
        : <span className="text-xs font-semibold text-[var(--mn-text-muted)]">{name}</span>}
    </span>
  );
}

function sourceName(locale: AppLocale, source: ItemSourceEntry): string {
  if (source.name) return source.name;
  if (source.kind === "story") return t(locale, `story.categories.${source.key === "live-result" ? "liveResult" : source.key}`);
  if (source.kind === "characterRank" || source.kind === "friendshipRank" || source.kind === "characterMission") return t(locale, "items.sources.everyCharacter");
  return t(locale, `items.sources.kinds.${source.kind}`);
}

function SourcesPanel({ locale, sources }: { locale: AppLocale; sources: ItemSourceEntry[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, ItemSourceEntry[]>();
    for (const source of sources) {
      const list = map.get(source.kind);
      if (list) list.push(source);
      else map.set(source.kind, [source]);
    }
    return [...map];
  }, [sources]);
  return (
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}>
        <h3 className={panelTitle}>{t(locale, "items.sources.title")}</h3>
        <p className="mt-1 text-xs font-medium text-[var(--mn-text-muted)]">{t(locale, "items.sources.description")}</p>
      </div>
      {groups.length === 0 ? (
        <p className="px-6 py-6 text-sm font-medium text-[var(--mn-text-muted)] sm:px-8">{t(locale, "items.sources.empty")}</p>
      ) : (
        <div className="space-y-5 px-4 py-5 sm:px-6">
          {groups.map(([kind, entries]) => (
            <CollapsibleGroup key={kind} locale={locale} title={t(locale, `items.sources.kinds.${kind}`)} count={entries.length} limit={6}>
              {(visible) => (
                <ul className="divide-y divide-dashed divide-[var(--mn-border)]/60">
                  {entries.slice(0, visible).map((source) => {
                    const name = sourceName(locale, source);
                    return (
                      <li key={`${source.kind}:${source.key}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                        <span className="min-w-0">
                          {source.link
                            ? <a href={localizePath(entityLinkPath(source.link), locale)} className="mn-focus font-semibold text-[var(--mn-text)] underline decoration-dotted underline-offset-4 hover:text-[var(--mn-accent-deep)]">{name}</a>
                            : <span className="font-semibold text-[var(--mn-text)]">{name}</span>}
                          <span className="ml-2 text-xs font-medium text-[var(--mn-text-muted)]">
                            {source.details.map((detail) => t(locale, `items.sources.details.${detail}`)).join(" · ")}
                          </span>
                        </span>
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--mn-accent-deep)]">
                          {t(locale, "items.sources.total", { count: source.total.toLocaleString(locale) })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CollapsibleGroup>
          ))}
        </div>
      )}
    </div>
  );
}

function UsagesPanel({ locale, usages }: { locale: AppLocale; usages: ItemUsageEntry[] }) {
  return (
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}>
        <h3 className={panelTitle}>{t(locale, "items.usages.title")}</h3>
        <p className="mt-1 text-xs font-medium text-[var(--mn-text-muted)]">{t(locale, "items.usages.description")}</p>
      </div>
      {usages.length === 0 ? (
        <p className="px-6 py-6 text-sm font-medium text-[var(--mn-text-muted)] sm:px-8">{t(locale, "items.usages.empty")}</p>
      ) : (
        <div className="space-y-5 px-4 py-5 sm:px-6">
          {usages.map((usage) => (
            <CollapsibleGroup
              key={`${usage.kind}:${usage.perTarget}:${usage.alternative ? 1 : 0}`}
              locale={locale}
              title={t(locale, `items.usages.kinds.${usage.kind}`)}
              aside={t(locale, usage.alternative ? "items.usages.perTargetAlternative" : "items.usages.perTarget", { count: usage.perTarget.toLocaleString(locale) })}
              count={usage.targets.length}
              limit={TARGET_PREVIEW}
            >
              {(visible) => (
                <ul className="flex flex-wrap gap-2">
                  {usage.targets.slice(0, visible).map((target) => (
                    <li key={target.id}>
                      <a href={localizePath(entityLinkPath(target.link), locale)} className="mn-focus inline-flex rounded-lg border border-[var(--mn-border)]/60 bg-[var(--mn-cream-deep)]/40 px-2.5 py-1 text-xs font-semibold text-[var(--mn-text)] transition hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]">
                        {target.name || `#${target.id}`}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleGroup>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleGroup({ locale, title, aside, count, limit, children }: { locale: AppLocale; title: string; aside?: string; count: number; limit: number; children: (visible: number) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const foldable = count > limit;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-black text-[var(--mn-text)]">
          {title}
          <span className="ml-2 text-xs font-semibold text-[var(--mn-text-muted)]">{count.toLocaleString(locale)}</span>
        </h4>
        {aside && <span className="text-xs font-bold text-[var(--mn-accent-deep)]">{aside}</span>}
      </div>
      {children(foldable && !expanded ? limit : count)}
      {foldable && (
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mn-focus mt-2 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-1 text-xs font-bold text-[var(--mn-text-muted)] transition hover:text-[var(--mn-text)]">
          {expanded ? t(locale, "items.detail.showLess") : t(locale, "items.detail.showAll", { count })}
        </button>
      )}
    </section>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "items.detail.notFoundTitle")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "items.detail.notFoundDescription")}</p>
    </div>
  );
}
