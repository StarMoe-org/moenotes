import { headers } from "next/headers";
import BreadcrumbSync from "@/components/shell/BreadcrumbSync";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getLocaleFromPathname, localizePath, stripLocaleFromPathname } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";

export default async function NotFound() {
  const reqHeaders = await headers();
  const rawLocale = reqHeaders.get("x-moenotes-locale");
  const rawPathname = reqHeaders.get("x-moenotes-pathname") || "/";
  const locale: AppLocale =
    rawLocale && isAppLocale(rawLocale) ? rawLocale : getLocaleFromPathname(rawPathname) || DEFAULT_LOCALE;
  const canonicalPath = stripLocaleFromPathname(rawPathname);

  return (
    <>
      <BreadcrumbSync locale={locale} pathname={canonicalPath} />
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="font-[var(--md-ref-typeface-brand)] text-display-small text-primary">404</div>
        <h1 className="mt-4 font-[var(--md-ref-typeface-brand)] text-headline-medium text-on-surface">
          {t(locale, "notFound.heading")}
        </h1>
        <p className="mt-3 text-body-medium leading-7 text-on-surface-variant">{t(locale, "notFound.body")}</p>
        <div className="mt-8">
          <a href={localizePath(getRoutePathById("home"), locale)} className="md3-button md3-button--filled">
            {t(locale, "notFound.backHome")}
          </a>
        </div>
      </div>
    </>
  );
}
