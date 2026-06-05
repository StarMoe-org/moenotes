import { siteConfig } from "@/config/site";
import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { findRouteMatch } from "@/lib/route/registry";
import type { BreadcrumbItem } from "@/types/route";

export function buildAbsoluteUrl(pathname: string): string {
  return new URL(pathname, siteConfig.baseUrl).toString();
}

export function buildBreadcrumbs(pathname: string, locale: AppLocale = DEFAULT_LOCALE, detail?: { id?: string; label: string; href?: string }): BreadcrumbItem[] {
  const match = findRouteMatch(pathname);
  const crumbs: BreadcrumbItem[] = [
    { id: "home", label: t(locale, "nav.home"), href: localizePath("/", locale) },
  ];

  if (!match) return crumbs.map((crumb, index, all) => ({ ...crumb, current: index === all.length - 1 }));

  if (match.group) {
    crumbs.push({ id: match.group.id, label: t(locale, match.group.labelKey), href: localizePath(match.group.path, locale) });
  }

  if (match.item.id !== "home") {
    crumbs.push({ id: match.item.id, label: t(locale, match.item.labelKey), href: localizePath(match.item.path, locale) });
  }

  if (detail?.label) {
    crumbs.push({ id: detail.id ?? "detail", label: detail.label, href: detail.href ? localizePath(detail.href, locale) : localizePath(pathname, locale) });
  }

  return crumbs.map((crumb, index, all) => ({ ...crumb, current: index === all.length - 1 }));
}
