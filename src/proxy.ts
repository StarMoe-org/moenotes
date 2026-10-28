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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PASSTHROUGH_EXACT.has(pathname) || PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Static files in /public (.svg, .png, .ico, .wasm, .js, .css, .woff2, etc.) except .md
  if (/\.[a-z0-9]{2,8}$/i.test(pathname) && !pathname.endsWith(".md")) {
    return NextResponse.next();
  }

  // Dedicated .md routes & Accept: text/markdown content negotiation
  if (pathname.endsWith(".md") || prefersMarkdownAccept(request.headers.get("accept"))) {
    const rewriteHeaders = new Headers(request.headers);
    rewriteHeaders.set("x-moenotes-markdown-path", pathname);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/api/v1/markdown";
    rewriteUrl.searchParams.set("path", pathname);
    return NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: rewriteHeaders,
      },
    });
  }

  const locale = getLocaleFromPathname(pathname);
  const canonicalPath = stripLocaleFromPathname(pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-moenotes-pathname", pathname);
  requestHeaders.set("x-moenotes-canonical-path", canonicalPath);
  requestHeaders.set("x-moenotes-locale", locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Vary", "Accept");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
