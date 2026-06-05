import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, PATH_PREFIX_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";

export function normalizePathname(pathname: string): `/${string}` {
  const clean = pathname.split(/[?#]/)[0] || "/";
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  const trimmed = withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
  return trimmed as `/${string}`;
}

export function getLocaleFromPathname(pathname: string): AppLocale {
  const firstSegment = normalizePathname(pathname).split("/")[1];
  return PATH_PREFIX_LOCALE[firstSegment ?? ""] ?? DEFAULT_LOCALE;
}

export function stripLocaleFromPathname(pathname: string): `/${string}` {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/").filter(Boolean);
  const first = segments[0];
  if (first && PATH_PREFIX_LOCALE[first]) {
    const rest = segments.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }
  return normalized;
}

export function localizePath(pathname: string, locale: AppLocale): `/${string}` {
  const path = stripLocaleFromPathname(pathname);
  const prefix = LOCALE_PATH_PREFIX[locale];
  if (!prefix) return path;
  return path === "/" ? `/${prefix}` : `/${prefix}${path}`;
}

export function switchLocalePath(currentPathname: string, locale: AppLocale): `/${string}` {
  return localizePath(stripLocaleFromPathname(currentPathname), locale);
}

export function localeAlternates(pathname: string): Array<{ locale: AppLocale; href: `/${string}` }> {
  return SUPPORTED_LOCALES.map((locale) => ({ locale, href: localizePath(pathname, locale) }));
}
