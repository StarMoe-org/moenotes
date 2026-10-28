import AccountPanel from "@/components/account/AccountPanel";
import OpenPlatformDocsRedirect from "@/components/account/OpenPlatformDocsRedirect";
import OpenPlatformPage from "@/components/account/OpenPlatformPage";
import PlayerPageView from "@/components/account/PlayerPageView";
import PageHeader from "@/components/shell/PageHeader";
import type { AppLocale } from "@/config/locales";
import { openPlatformDocsUrl } from "@/config/site";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getAvatarBands } from "@/lib/account/avatar-options";
import { resolveDocsUrl } from "@/lib/account/docs-url";
import { getProfileCards } from "@/lib/account/profile-cards";
import { getRoutePathById } from "@/lib/route/registry";

export async function AccountServerPage({ locale }: { locale: AppLocale }) {
  const [bands, cards] = await Promise.all([getAvatarBands(locale), getProfileCards(locale)]);
  return (
    <PageHeader locale={locale} titleKey="account.title" descriptionKey="account.description">
      <a href={localizePath(getRoutePathById("card-box"), locale)} className="md3-button md3-button--outlined mb-5">
        {t(locale, "deckWorkspace.boxTitle")}
      </a>
      <AccountPanel locale={locale} bands={bands} cards={cards} />
    </PageHeader>
  );
}

export function OpenPlatformServerPage({ locale }: { locale: AppLocale }) {
  return <OpenPlatformPage locale={locale} />;
}

export function OpenPlatformDocsServerPage({ locale }: { locale: AppLocale }) {
  const target = resolveDocsUrl(openPlatformDocsUrl, locale);
  const consolePath = localizePath(getRoutePathById("open-platform"), locale);
  return (
    <PageHeader locale={locale} titleKey="openPlatform.docs.title" descriptionKey="openPlatform.docs.description">
      <section
        className="md3-surface max-w-3xl space-y-5 p-6 sm:p-8"
        data-docs-migration=""
        data-docs-base={target ? openPlatformDocsUrl : undefined}
        data-docs-locale={locale}
      >
        <p className="text-body-medium leading-7">{t(locale, target ? "openPlatform.docsMoved" : "openPlatform.docsPending")}</p>
        {target && (
          <a data-docs-target="" className="md3-button md3-button--tonal" href={target}>
            {t(locale, "openPlatform.docs.title")}
          </a>
        )}
        <p>
          <a className="text-label-large underline" href={consolePath}>
            {t(locale, "openPlatform.developer")}
          </a>
        </p>
      </section>
      <OpenPlatformDocsRedirect base={target ? openPlatformDocsUrl : undefined} locale={locale} />
    </PageHeader>
  );
}

export async function PlayerServerPage({ locale }: { locale: AppLocale }) {
  const cards = await getProfileCards(locale);
  return (
    <PageHeader locale={locale} titleKey="player.title" descriptionKey="player.description">
      <PlayerPageView locale={locale} cards={cards} />
    </PageHeader>
  );
}
