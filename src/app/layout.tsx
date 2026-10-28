import "@fontsource-variable/roboto-flex/wght.css";
import "@/styles/global.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import NextMd3Registry from "@/components/md3/NextMd3Registry";
import AppShell from "@/components/shell/AppShell";
import { analyticsConfig, googleAnalyticsScriptSrc, isGoogleAnalyticsEnabled } from "@/config/analytics";
import { DEFAULT_LOCALE, HTML_LANG, isAppLocale, type AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { getLocaleFromPathname, stripLocaleFromPathname } from "@/i18n/routing";
import { buildAccountBootstrapScript } from "@/lib/account/bootstrap";
import { buildMediaQueryCompatScript } from "@/lib/browser/media-query-compat";
import { buildFilterBootstrapScript } from "@/lib/filter/bootstrap";
import { resolveRequestMasterDataManifest } from "@/lib/masterdata/request-refresh";
import { md3ThemeVariablesCss } from "@/lib/md3/theme-vars";
import { findRouteMatch, getNavigationGroupId } from "@/lib/route/registry";
import { buildNavGroupBootstrapScript, buildThemeBootstrapScript } from "@/lib/settings/apply-theme";
import { SPOILER_REFERENCE_NOW } from "@/lib/settings/spoiler-reference";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.baseUrl),
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const reqHeaders = await headers();
  const rawPathname = reqHeaders.get("x-moenotes-pathname") || "/";
  const rawLocale = reqHeaders.get("x-moenotes-locale");
  const locale: AppLocale =
    rawLocale && isAppLocale(rawLocale) ? rawLocale : getLocaleFromPathname(rawPathname) || DEFAULT_LOCALE;
  const canonicalPath = (reqHeaders.get("x-moenotes-canonical-path") || stripLocaleFromPathname(rawPathname)) as `/${string}`;
  const manifest = await resolveRequestMasterDataManifest();
  const regionVersionMap: Record<string, string> = {};
  for (const [region, info] of Object.entries(manifest?.regions ?? {})) {
    if (info?.version) regionVersionMap[region] = info.version;
  }
  const serializedRegions = Object.keys(regionVersionMap).length > 0 ? JSON.stringify(regionVersionMap) : undefined;

  const mediaQueryCompatScript = buildMediaQueryCompatScript();
  const themeScript = buildThemeBootstrapScript();
  const navGroupScript = buildNavGroupBootstrapScript(getNavigationGroupId(canonicalPath));
  const accountScript = buildAccountBootstrapScript();
  const filterScript = buildFilterBootstrapScript(Boolean(findRouteMatch(canonicalPath)?.item.filterTitleKey));
  const themeVarsCss = `@layer mui{${md3ThemeVariablesCss()}}`;

  const gaMeasurementId = analyticsConfig.googleAnalytics.measurementId;
  const googleAnalyticsBootstrapScript = isGoogleAnalyticsEnabled
    ? `window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${gaMeasurementId}');`
    : "";

  return (
    <html
      lang={HTML_LANG[locale]}
      data-locale={locale}
      data-spoiler-now={SPOILER_REFERENCE_NOW}
      data-masterdata-version={manifest?.dataVersion || undefined}
      data-masterdata-regions={serializedRegions}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: "@layer theme, base, mui, components, utilities;" }} />
        <style data-md3-theme-vars="" dangerouslySetInnerHTML={{ __html: themeVarsCss }} />
        <meta name="color-scheme" content="light dark" />
        <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: mediaQueryCompatScript }} />
        <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: navGroupScript }} />
        <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: accountScript }} />
        {filterScript && <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: filterScript }} />}
        <meta name="theme-color" content="#FBF8FD" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content={siteConfig.shortName} />
        <link rel="manifest" href="/site.webmanifest" />
        {isGoogleAnalyticsEnabled && (
          <>
            <script async src={googleAnalyticsScriptSrc} />
            <script dangerouslySetInnerHTML={{ __html: googleAnalyticsBootstrapScript }} />
          </>
        )}
      </head>
      <body className="min-h-screen bg-surface text-on-surface antialiased selection:bg-primary/20 selection:text-on-surface">
        <NextMd3Registry>
          <AppShell locale={locale} pathname={canonicalPath}>
            {children}
          </AppShell>
        </NextMd3Registry>
      </body>
    </html>
  );
}
