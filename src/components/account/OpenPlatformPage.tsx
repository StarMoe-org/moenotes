import OpenPlatformPanel from "@/components/account/OpenPlatformPanel";
import PageHeader from "@/components/shell/PageHeader";
import type { AppLocale } from "@/config/locales";
import { openPlatformDocsUrl } from "@/config/site";
import { t } from "@/i18n";

export default function OpenPlatformPage({ locale }: { locale: AppLocale }) {
  return (
    <PageHeader locale={locale} titleKey="openPlatform.title" descriptionKey="openPlatform.pageDescription">
      <section className="md3-surface mb-6 p-4 sm:p-6 md:p-8">
        <a className="mn-list-card md3-card-outlined relative flex items-center justify-between gap-4 p-5" href={openPlatformDocsUrl}>
          <span>
            <span className="block font-[var(--md-ref-typeface-brand)] text-title-large">{t(locale, "openPlatform.docs.title")}</span>
            <span className="mt-1 block text-body-medium text-on-surface-variant">{t(locale, "openPlatform.docs.description")}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-headline-small text-primary">→</span>
        </a>
      </section>
      <OpenPlatformPanel locale={locale} />
    </PageHeader>
  );
}
