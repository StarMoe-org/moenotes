"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import { DetailRow } from "@/components/shared/DetailRows";
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

const panelHeader = "border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";
// Unlimited stacks carry int32 max; anything that large reads as "no cap".
const UNCAPPED = 2_000_000_000;
/** Targets listed per usage before the rest fold behind a toggle. */
const TARGET_PREVIEW = 8;

/** One item as the page's server has it: its fields, where it comes from and what it is spent on. */
export default function ItemDetail({ locale, detail, neighbors, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const value = useMemo(() => detail && moveReleaseUrls(valueForServer(detail, server), entityServer(detail, server)), [detail, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={detail?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={detail?.servers ?? []} hideSwitch>
      <div className="w-full space-y-8">
        {value ? <ItemDetailView locale={locale} detail={value} serverSwitch={serverSwitch} /> : <NotFound locale={locale} />}
        <EntityPager locale={locale} listRouteId="items" {...neighbors} />
      </div>
    </ServerScope>
  );
}

function ItemDetailView({ locale, detail, serverSwitch }: { locale: AppLocale; detail: ItemDetailViewModel; serverSwitch: ReactNode }) {
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
    <>
      <DetailHero
        title={item.name}
        subtitle={detail.reading || undefined}
        media={<ItemIcon locale={locale} imagePath={item.imagePath} name={item.name} className="h-20 w-20 shrink-0 sm:h-24 sm:w-24" />}
        aside={serverSwitch}
      >
        {item.desc && <p className="mt-1 max-w-[60ch] whitespace-pre-line text-body-large text-on-surface-variant">{item.desc}</p>}
      </DetailHero>
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <dl className="md3-surface divide-y divide-outline-variant px-6">
            {facts.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
          </dl>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <SourcesPanel locale={locale} sources={detail.sources} />
          <UsagesPanel locale={locale} usages={detail.usages} />
          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("items"), locale)} className="md3-button md3-button--tonal">
              {t(locale, "items.detail.backToList")}
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

function ItemIcon({ locale, imagePath, name, className }: { locale: AppLocale; imagePath: string; name: string; className: string }) {
  const src = useAssetUrl()(getItemIconUrl(imagePath, locale));
  const [failed, setFailed] = useState(false);
  return (
    <span className={`grid shrink-0 place-items-center rounded-shape-lg border border-outline-variant bg-surface-container-highest p-3 shadow-inner ${className}`}>
      {src && !failed
        ? <img className="h-full w-full object-contain" src={src} alt={name} onError={() => setFailed(true)} />
        : <span className="text-label-medium text-on-surface-variant">{name}</span>}
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
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}>
        <h3 className={panelTitle}>{t(locale, "items.sources.title")}</h3>
        <p className="mt-1 text-body-small text-on-surface-variant">{t(locale, "items.sources.description")}</p>
      </div>
      {groups.length === 0 ? (
        <p className="px-6 py-6 text-body-medium text-on-surface-variant sm:px-8">{t(locale, "items.sources.empty")}</p>
      ) : (
        <div className="space-y-5 px-4 py-5 sm:px-6">
          {groups.map(([kind, entries]) => (
            <CollapsibleGroup key={kind} locale={locale} title={t(locale, `items.sources.kinds.${kind}`)} count={entries.length} limit={6}>
              {(visible) => (
                <ul className="divide-y divide-dashed divide-outline-variant/60">
                  {entries.slice(0, visible).map((source) => {
                    const name = sourceName(locale, source);
                    return (
                      <li key={`${source.kind}:${source.key}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-body-medium">
                        <span className="min-w-0">
                          {source.link
                            ? <a href={localizePath(entityLinkPath(source.link), locale)} className="font-semibold text-on-surface underline decoration-dotted underline-offset-4 hover:text-primary">{name}</a>
                            : <span className="font-semibold text-on-surface">{name}</span>}
                          <span className="ml-2 text-body-small text-on-surface-variant">
                            {source.details.map((detail) => t(locale, `items.sources.details.${detail}`)).join(" · ")}
                          </span>
                        </span>
                        <span className="font-mono text-label-medium tabular-nums text-primary">
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
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}>
        <h3 className={panelTitle}>{t(locale, "items.usages.title")}</h3>
        <p className="mt-1 text-body-small text-on-surface-variant">{t(locale, "items.usages.description")}</p>
      </div>
      {usages.length === 0 ? (
        <p className="px-6 py-6 text-body-medium text-on-surface-variant sm:px-8">{t(locale, "items.usages.empty")}</p>
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
                      <a href={localizePath(entityLinkPath(target.link), locale)} className="inline-flex rounded-shape-sm border border-outline-variant/60 bg-surface-container-highest/40 px-2.5 py-1 text-label-medium text-on-surface transition hover:border-primary hover:bg-secondary-container">
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
        <h4 className="text-label-large text-on-surface">
          {title}
          <span className="ml-2 text-label-medium text-on-surface-variant">{count.toLocaleString(locale)}</span>
        </h4>
        {aside && <span className="text-label-medium text-primary">{aside}</span>}
      </div>
      {children(foldable && !expanded ? limit : count)}
      {foldable && (
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="md3-button md3-button--outlined md3-button--small mt-2">
          {expanded ? t(locale, "items.detail.showLess") : t(locale, "items.detail.showAll", { count })}
        </button>
      )}
    </section>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="md3-surface p-8 text-center sm:p-12">
      <h1 className="text-headline-small text-on-surface">{t(locale, "items.detail.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "items.detail.notFoundDescription")}</p>
    </div>
  );
}
