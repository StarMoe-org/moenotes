import { NextResponse, type NextRequest } from "next/server";
import { getLocaleFromPathname, stripLocaleFromPathname } from "@/i18n/routing";
import { prefersMarkdownAccept } from "@/lib/markdown/negotiate";

const PASSTHROUGH_PREFIXES = [
  "/_next/",
  "/_moenotes/",
  "/api/",
  "/assets/",
  "/runtime/",
  "/sitemaps/",
  "/favicon",
];

const PASSTHROUGH_EXACT = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/search-index.json",
  "/band-item-upgrades.json",
  "/character-voices.json",
  "/internal-healthz",
  "/site.webmanifest",
]);

function isTruthyFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function hasForceBypassSignal(request: NextRequest): boolean {
  if (
    isTruthyFlag(request.headers.get("x-moenotes-bypass-cache")) ||
    isTruthyFlag(request.headers.get("x-moenotes-refresh-masterdata"))
  ) {
    return true;
  }
  const sp = request.nextUrl.searchParams;
  return ["refresh_masterdata", "__refresh", "nocache", "refresh"].some((key) => isTruthyFlag(sp.get(key)));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forceBypass = hasForceBypassSignal(request);

  if (PASSTHROUGH_EXACT.has(pathname) || PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    if (!forceBypass) return NextResponse.next();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-moenotes-bypass-cache", "1");
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Moenotes-Cache-Bypass", "1");
    return response;
  }

  // Static files in /public (.svg, .png, .ico, .wasm, .js, .css, .woff2, etc.) except .md
  if (/\.[a-z0-9]{2,8}$/i.test(pathname) && !pathname.endsWith(".md")) {
    return NextResponse.next();
  }

  // Dedicated .md routes & Accept: text/markdown content negotiation
  if (pathname.endsWith(".md") || prefersMarkdownAccept(request.headers.get("accept"))) {
    const rewriteHeaders = new Headers(request.headers);
    rewriteHeaders.set("x-moenotes-markdown-path", pathname);
    if (forceBypass) rewriteHeaders.set("x-moenotes-bypass-cache", "1");
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/api/v1/markdown";
    rewriteUrl.searchParams.set("path", pathname);
    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: rewriteHeaders,
      },
    });
    if (forceBypass) {
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Moenotes-Cache-Bypass", "1");
    }
    return response;
  }

  const locale = getLocaleFromPathname(pathname);
  const canonicalPath = stripLocaleFromPathname(pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-moenotes-pathname", pathname);
  requestHeaders.set("x-moenotes-canonical-path", canonicalPath);
  requestHeaders.set("x-moenotes-locale", locale);
  if (forceBypass) requestHeaders.set("x-moenotes-bypass-cache", "1");

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Vary", "Accept");
  if (forceBypass) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Moenotes-Cache-Bypass", "1");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
