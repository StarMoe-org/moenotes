"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { HTML_LANG, type AppLocale } from "@/config/locales";
import { pruneAssetCache } from "@/lib/cache/asset-cache";
import { installFetchCache } from "@/lib/cache/cached-fetch";
import { registerImageCacheWorker } from "@/lib/cache/service-worker";
import { restoreScrollState, saveScrollState } from "@/lib/scroll/scroll-memory";

const BYPASS_PREFIXES = ["/api/", "/_next/", "/assets/", "/deck/", "/recognition/", "/haneoka-team-engine/", "/sitemaps/"];
const BYPASS_EXACT = new Set([
  "/api",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/search-index.json",
  "/band-item-upgrades.json",
  "/character-voices.json",
]);

function shouldBypassSpa(pathname: string): boolean {
  if (BYPASS_EXACT.has(pathname)) return true;
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (/\.(?:md|xml|json|txt|wasm|png|jpe?g|webp|svg|ico|pdf|mp3|ogg|wav)$/i.test(pathname)) return true;
  return false;
}

export default function ShellBootClient({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    installFetchCache();
    void pruneAssetCache();
    registerImageCacheWorker();
  }, []);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale] ?? locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    restoreScrollState(window.location.pathname, window.location.search);
  }, [pathname]);

  useEffect(() => {
    const save = () => {
      saveScrollState(window.location.pathname, window.location.search);
    };

    const handleClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      save();

      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (shouldBypassSpa(url.pathname)) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
        return;
      }

      event.preventDefault();
      router.push(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    document.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
      document.removeEventListener("click", handleClick);
    };
  }, [router]);

  return null;
}
