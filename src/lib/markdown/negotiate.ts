import { DEFAULT_LOCALE, PATH_PREFIX_LOCALE, type AppLocale } from "@/config/locales";
import { getLocaleFromPathname, localizePath, normalizePathname, stripLocaleFromPathname } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/metadata";

/** Estimate LLM token count (~4 UTF-8 bytes per token for mixed Latin/CJK Markdown). */
export function estimateMarkdownTokens(markdown: string): number {
  return Math.max(1, Math.ceil(new TextEncoder().encode(markdown).byteLength / 4));
}

/**
 * Relative `.md` URL for a canonical route path and locale:
 * - `/` in default locale -> `/index.md`
 * - `/` in `ja-JP` -> `/ja/index.md`
 * - `/cards/1001` in `ja-JP` -> `/ja/cards/1001.md`
 */
export function markdownPathFor(pathname: string, locale: AppLocale): string {
  const localized = localizePath(pathname, locale);
  if (localized === "/") return "/index.md";
  const prefix = localized.slice(1);
  if (prefix in PATH_PREFIX_LOCALE) return `${localized}/index.md`;
  return `${localized}.md`;
}

export function markdownAbsoluteUrl(pathname: string, locale: AppLocale): string {
  return absoluteUrl(markdownPathFor(pathname, locale));
}

/** Whether an HTTP `Accept` header explicitly prefers `text/markdown` over `text/html`. */
export function prefersMarkdownAccept(acceptHeader: string | null | undefined): boolean {
  if (!acceptHeader) return false;
  let markdownQ = -1;
  let htmlQ = -1;
  for (const rawPart of acceptHeader.split(",")) {
    const [rawType = "", ...params] = rawPart.trim().toLowerCase().split(";");
    const mediaType = rawType.trim();
    if (!mediaType) continue;
    let q = 1;
    for (const param of params) {
      const trimmed = param.trim();
      if (trimmed.startsWith("q=")) {
        const parsed = Number.parseFloat(trimmed.slice(2));
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    if (q <= 0) continue;
    if (mediaType === "text/markdown" || mediaType === "text/x-markdown") {
      markdownQ = Math.max(markdownQ, q);
    } else if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
      htmlQ = Math.max(htmlQ, q);
    }
  }
  return markdownQ > 0 && markdownQ >= htmlQ;
}

/**
 * Parse either a `.md` URL (`/cards/1001.md`, `/ja/index.md`, `/ja.md`) or a canonical HTML URL (`/ja/cards/1001`)
 * into `{ locale, pathname }`.
 */
export function parseMarkdownTarget(rawPathname: string): { locale: AppLocale; pathname: `/${string}` } | null {
  const clean = (rawPathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const withoutMd = clean.endsWith(".md") ? clean.slice(0, -3) || "/" : clean;
  const segments = withoutMd.split("/").filter(Boolean);

  if (segments.length === 1 && segments[0] === "index") {
    return { locale: DEFAULT_LOCALE, pathname: "/" };
  }
  if (segments.length === 2 && segments[1] === "index" && PATH_PREFIX_LOCALE[segments[0] ?? ""]) {
    return { locale: PATH_PREFIX_LOCALE[segments[0]!]!, pathname: "/" };
  }

  const normalized = normalizePathname(withoutMd);
  const locale = getLocaleFromPathname(normalized);
  const pathname = stripLocaleFromPathname(normalized);
  return { locale, pathname };
}
