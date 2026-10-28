"use client";

import { useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import EntityPager from "@/components/shared/EntityPager";
import { HelpCarousels, HelpRichText } from "@/components/help/HelpParts";
import { helpTopicPath } from "@/lib/help/paths";
import type { HelpTopicDetail } from "@/lib/masterdata/build-help";
import { getRoutePathById } from "@/lib/route/registry";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useContentServer } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  servers: GameServer[];
  detail: ServerFacetedValue<HelpTopicDetail> | null;
}

/** One manual topic: its category, text and the category's carousel guides, with previous / next within the category. */
export default function HelpDetail({ locale, servers, detail }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const shown = useMemo(() => (detail ? valueForServer(detail, server) : null), [detail, server]);
  if (!detail || !shown) {
    return (
      <div className="space-y-6">
        <DetailHero title={t(locale, "seo.helpDetail.title")} />
        <div className="rounded-shape-lg border border-dashed border-outline-variant bg-surface-container-low p-10 text-center font-bold text-on-surface-variant">{t(locale, "help.empty")}</div>
      </div>
    );
  }
  const { topic, category, siblings } = shown;
  const index = siblings.findIndex((entry) => entry.id === topic.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;
  const categoryHref = `${localizePath(getRoutePathById("help"), locale)}?category=${topic.categoryId}`;

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={detail.servers} hideSwitch>
      <article className="mx-auto max-w-3xl space-y-6">
        <DetailHero
          title={topic.title}
          eyebrow={<a href={categoryHref} className="text-primary hover:underline">{topic.categoryTitle}</a>}
          aside={<HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={detail.servers} />}
        />
        <HelpRichText value={topic.body} className="md3-surface p-6 text-body-large leading-8 text-on-surface sm:px-8" />
        {category && category.carousels.length > 0 ? (
          <section>
            <h3 className="mb-3 text-label-large text-on-surface-variant">{t(locale, "help.guides")}</h3>
            <HelpCarousels locale={locale} carousels={category.carousels} />
          </section>
        ) : null}
        <EntityPager
          locale={locale}
          listRouteId="help"
          {...(previous ? { previous: { href: helpTopicPath(previous.id), title: previous.title } } : {})}
          {...(next ? { next: { href: helpTopicPath(next.id), title: next.title } } : {})}
        />
      </article>
    </ServerScope>
  );
}
