import type { ReactNode } from "react";
import AppShellClient from "@/components/shell/AppShellClient";
import BackgroundPattern from "@/components/shell/BackgroundPattern";
import BrowserNotice from "@/components/shell/BrowserNotice";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { getBuildThemeBands } from "@/lib/masterdata/build-settings";
import { buildSidebarScrollBootstrapScript } from "@/lib/settings/apply-theme";
import type { BreadcrumbDetail } from "@/types/route";

interface AppShellProps {
  locale: AppLocale;
  pathname: string;
  breadcrumbDetail?: BreadcrumbDetail | undefined;
  children: ReactNode;
}

export default async function AppShell({ locale, pathname, breadcrumbDetail, children }: AppShellProps) {
  const sidebarScrollScript = buildSidebarScrollBootstrapScript();
  const [defaultThemeBands, ...entries] = await Promise.all([
    getBuildThemeBands(DEFAULT_LOCALE),
    ...SUPPORTED_LOCALES.map(async (code) => [code, await getBuildThemeBands(code)] as const),
  ]);
  const themeBandsByLocale = Object.fromEntries(entries);

  return (
    <>
      <BrowserNotice locale={locale} />
      <BackgroundPattern />
      <AppShellClient
        initialLocale={locale}
        initialPathname={pathname}
        initialBreadcrumbDetail={breadcrumbDetail}
        sidebarScrollSlot={
          <script data-cfasync="false" dangerouslySetInnerHTML={{ __html: sidebarScrollScript }} />
        }
        themeBandsByLocale={themeBandsByLocale}
        defaultThemeBands={defaultThemeBands}
      >
        {children}
      </AppShellClient>
    </>
  );
}
