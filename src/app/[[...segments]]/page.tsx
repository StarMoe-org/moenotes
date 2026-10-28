import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BreadcrumbSync from "@/components/shell/BreadcrumbSync";
import { DEFAULT_LOCALE, OG_LOCALE, PATH_PREFIX_LOCALE, type AppLocale } from "@/config/locales";
import { parsePlayerPagePath } from "@/config/players";
import { siteConfig } from "@/config/site";
import { t } from "@/i18n";
import { getLocaleFromPathname, localizePath, normalizePathname, stripLocaleFromPathname } from "@/i18n/routing";
import { markdownAbsoluteUrl } from "@/lib/markdown/negotiate";
import { resolveRequestMasterDataManifest } from "@/lib/masterdata/request-refresh";
import { findRouteMatch, isDynamicRoute } from "@/lib/route/registry";
import { getDetailBreadcrumb } from "@/lib/route/static-paths";
import { resolveEntitySeo } from "@/lib/seo/entity-seo";
import { breadcrumbJsonLd, serializeJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { absolutePageUrl, buildHreflang, buildPageMetadata } from "@/lib/seo/metadata";
import { PlayerServerPage } from "@/server-pages/AccountServerPages";
import RouteDispatcher from "@/server-pages/RouteDispatcher";

export const dynamic = "force-dynamic";

interface CatchAllPageProps {
  params: Promise<{ segments?: string[] }>;
}

const ENTITY_DETAIL_COMPONENTS = new Set([
  "card-detail",
  "support-card-detail",
  "song-detail",
  "event-detail",
  "gacha-detail",
  "character-detail",
  "story-detail",
  "item-detail",
  "exchange-detail",
  "shop-detail",
  "reward-detail",
  "help-detail",
]);

function resolvePathsFromSegments(segments?: string[]): {
  rawPathname: `/${string}`;
  locale: AppLocale;
  canonicalPathname: `/${string}`;
} {
  const joined = segments && segments.length > 0 ? `/${segments.map((s) => decodeURIComponent(s)).join("/")}` : "/";
  const rawPathname = normalizePathname(joined);
  const locale = getLocaleFromPathname(rawPathname);
  const canonicalPathname = stripLocaleFromPathname(rawPathname);
  return { rawPathname, locale, canonicalPathname };
}

function robotsDirective(indexable: boolean): string {
  return indexable
    ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : "noindex,follow";
}

export async function generateMetadata({ params }: CatchAllPageProps): Promise<Metadata> {
  await resolveRequestMasterDataManifest();
  const { segments } = await params;
  const { rawPathname, locale, canonicalPathname } = resolvePathsFromSegments(segments);

  const playerMatch = parsePlayerPagePath(rawPathname);
  if (playerMatch) {
    const playerLocale: AppLocale = playerMatch.prefix ? (PATH_PREFIX_LOCALE[playerMatch.prefix] ?? DEFAULT_LOCALE) : DEFAULT_LOCALE;
    const title = `${t(playerLocale, "player.title")} · ${playerMatch.server.toUpperCase()} #${playerMatch.profileId}`;
    const meta = buildPageMetadata(canonicalPathname, playerLocale, {
      title,
      description: t(playerLocale, "player.description"),
      indexable: false,
    });
    return {
      title: meta.fullTitle,
      description: meta.description,
      robots: robotsDirective(false),
    };
  }

  const match = findRouteMatch(canonicalPathname);
  if (!match) {
    return {
      title: `${t(locale, "notFound.title")} | ${siteConfig.name}`,
      robots: "noindex,nofollow",
    };
  }

  const component = match.item.component ?? "page";
  const entitySeo = isDynamicRoute(match.item)
    ? await resolveEntitySeo(component, match.params.id, locale, canonicalPathname)
    : null;

  if (ENTITY_DETAIL_COMPONENTS.has(component) && !entitySeo) {
    return {
      title: `${t(locale, "notFound.title")} | ${siteConfig.name}`,
      robots: "noindex,nofollow",
    };
  }

  const meta = buildPageMetadata(canonicalPathname, locale, entitySeo?.meta);
  const languages: Record<string, string> = {};
  for (const alt of meta.alternates) {
    languages[buildHreflang(alt.locale)] = alt.href;
  }
  languages["x-default"] = absolutePageUrl(localizePath(canonicalPathname, DEFAULT_LOCALE));

  return {
    title: meta.fullTitle,
    description: meta.description,
    keywords: meta.keywords,
    robots: robotsDirective(meta.indexable),
    alternates: {
      canonical: meta.canonical,
      languages,
      types: {
        "text/markdown": markdownAbsoluteUrl(canonicalPathname, locale),
      },
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: meta.fullTitle,
      description: meta.description,
      url: meta.canonical,
      locale: OG_LOCALE[locale],
      images: [{ url: meta.image, alt: meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.fullTitle,
      description: meta.description,
      images: [meta.image],
    },
  };
}

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  await resolveRequestMasterDataManifest();
  const { segments } = await params;
  const { rawPathname, locale, canonicalPathname } = resolvePathsFromSegments(segments);

  const playerMatch = parsePlayerPagePath(rawPathname);
  if (playerMatch) {
    const playerLocale: AppLocale = playerMatch.prefix ? (PATH_PREFIX_LOCALE[playerMatch.prefix] ?? DEFAULT_LOCALE) : DEFAULT_LOCALE;
    return (
      <>
        <BreadcrumbSync locale={playerLocale} pathname={canonicalPathname} />
        <PlayerServerPage locale={playerLocale} />
      </>
    );
  }

  const match = findRouteMatch(canonicalPathname);
  if (!match) {
    notFound();
  }

  const component = match.item.component ?? "page";
  const entitySeo = isDynamicRoute(match.item)
    ? await resolveEntitySeo(component, match.params.id, locale, canonicalPathname)
    : null;

  if (ENTITY_DETAIL_COMPONENTS.has(component) && !entitySeo) {
    notFound();
  }

  const breadcrumbDetail = isDynamicRoute(match.item) && match.params.id
    ? await getDetailBreadcrumb(component, match.params.id, locale)
    : undefined;
  const websiteLd = websiteJsonLd(locale);
  const breadcrumbLd = breadcrumbJsonLd(canonicalPathname, locale, breadcrumbDetail);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteLd) }}
      />
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
        />
      )}
      <RouteDispatcher
        locale={locale}
        pathname={canonicalPathname}
        match={match}
        semantic={entitySeo?.semantic ?? undefined}
      />
    </>
  );
}
