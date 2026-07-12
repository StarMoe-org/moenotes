import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { findRouteMatch } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, BreadcrumbItem } from "@/types/route";
import { siteUrl } from "@/lib/seo/url";

export function buildAbsoluteUrl(pathname: string): string {
  return siteUrl(pathname);
}

export function buildBreadcrumbs(pathname: string, locale: AppLocale = DEFAULT_LOCALE, detail?: BreadcrumbDetail): BreadcrumbItem[] {
  const match = findRouteMatch(pathname);
  const crumbs: BreadcrumbItem[] = [
    { id: "home", label: t(locale, "nav.home"), href: localizePath("/", locale) },
  ];

  if (!match) return markCurrentCrumb(crumbs);

  const isDynamic = match.item.kind === "dynamic";
  let trail = [...match.ancestors];
  if (detail?.ancestors) {
    trail = [...detail.ancestors];
  }
  if (!isDynamic && match.item.id !== "home") trail.push(match.item);

  for (const route of uniqueRoutes(trail)) {
    if (route.id === "home") continue;
    crumbs.push({ id: route.id, label: t(locale, route.labelKey), href: localizePath(route.path, locale) });
  }

  if (isDynamic || detail?.label) {
    const fallbackDetailLabel = match.params.id ?? t(locale, match.item.labelKey);
    const nextDetail = detail ?? { label: fallbackDetailLabel };
    crumbs.push({
      id: nextDetail.id ?? match.item.id,
      label: nextDetail.label,
      href: nextDetail.href ? localizePath(nextDetail.href, locale) : localizePath(pathname, locale),
    });
  }

  return markCurrentCrumb(crumbs);
}

function uniqueRoutes(routes: AppRoute[]): AppRoute[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    if (seen.has(route.id)) return false;
    seen.add(route.id);
    return true;
  });
}

function markCurrentCrumb(crumbs: BreadcrumbItem[]): BreadcrumbItem[] {
  return crumbs.map((crumb, index, all) => ({ ...crumb, current: index === all.length - 1 }));
}
