"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import ScrollToTop from "@/components/shared/ScrollToTop";
import AudioDock from "@/components/shell/AudioDock";
import CommandPalette from "@/components/shell/CommandPalette";
import Footer from "@/components/shell/Footer";
import KeyboardShortcutsHelp from "@/components/shell/KeyboardShortcutsHelp";
import OverlayHost from "@/components/shell/OverlayHost";
import PageUpdateNotice from "@/components/shell/PageUpdateNotice";
import SettingsDrawer from "@/components/shell/SettingsDrawer";
import ShellBootClient from "@/components/shell/ShellBootClient";
import Sidebar from "@/components/shell/Sidebar";
import TopAppBar from "@/components/shell/TopAppBar";
import FilterDrawerHost from "@/components/shell/filter-drawer/FilterDrawerHost";
import type { AppLocale } from "@/config/locales";
import { getLocaleFromPathname, localizePath, stripLocaleFromPathname } from "@/i18n/routing";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { getActiveBreadcrumb, subscribeActiveBreadcrumb } from "@/lib/route/breadcrumb-store";
import { buildHeaderCrumbs } from "@/lib/route/header-crumbs";
import type { BreadcrumbDetail } from "@/types/route";

interface AppShellClientProps {
  initialLocale: AppLocale;
  initialPathname: string;
  initialBreadcrumbDetail?: BreadcrumbDetail | undefined;
  sidebarScrollScript: string;
  themeBandsByLocale: Partial<Record<AppLocale, readonly ThemeBandColor[]>>;
  defaultThemeBands: readonly ThemeBandColor[];
  children: ReactNode;
}

const serverBreadcrumbSnapshot = { key: "", detail: undefined };

export default function AppShellClient({
  initialLocale,
  initialPathname,
  initialBreadcrumbDetail,
  sidebarScrollScript,
  themeBandsByLocale,
  defaultThemeBands,
  children,
}: AppShellClientProps) {
  const liveRawPathname = usePathname();
  const locale = liveRawPathname ? getLocaleFromPathname(liveRawPathname) : initialLocale;
  const pathname = liveRawPathname ? stripLocaleFromPathname(liveRawPathname) : initialPathname;
  const activeCrumb = useSyncExternalStore(
    subscribeActiveBreadcrumb,
    getActiveBreadcrumb,
    () => serverBreadcrumbSnapshot,
  );

  const key = `${locale}:${pathname}`;
  const breadcrumbDetail =
    activeCrumb.key === key
      ? activeCrumb.detail
      : locale === initialLocale && pathname === initialPathname
        ? initialBreadcrumbDetail
        : undefined;

  const crumbs = buildHeaderCrumbs(pathname, locale, breadcrumbDetail);
  const activePath = breadcrumbDetail?.ancestors?.at(-1)?.path;
  const themeBands = themeBandsByLocale[locale] ?? defaultThemeBands;

  return (
    <>
      <ShellBootClient locale={locale} />
      <PageUpdateNotice locale={locale} />
      <TopAppBar locale={locale} homeHref={localizePath("/", locale)} crumbs={crumbs} />
      <Sidebar locale={locale} pathname={pathname} activePath={activePath} />
      <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: sidebarScrollScript }} />
      <FilterDrawerHost locale={locale} pathname={pathname} />
      <main
        id="content"
        className="mn-shell-offset mx-auto min-h-screen max-w-[var(--mn-layout-max-width,120rem)] px-4 pb-16 pt-[calc(var(--md-app-bar-height,64px)+1rem)] transition-[padding] duration-300 ease-[var(--md-sys-motion-easing-emphasized)] md:pl-[calc(var(--mn-sidebar-offset,17rem)+var(--mn-filter-offset,0rem)+1.5rem)] md:pr-6 md:pt-[calc(var(--md-app-bar-height,64px)+1.5rem)]"
      >
        {children}
      </main>
      <Footer locale={locale} />
      <CommandPalette locale={locale} />
      <SettingsDrawer locale={locale} pathname={pathname} bands={[...themeBands]} />
      <KeyboardShortcutsHelp locale={locale} />
      <OverlayHost locale={locale} />
      <ScrollToTop locale={locale} />
      <AudioDock locale={locale} />
    </>
  );
}
