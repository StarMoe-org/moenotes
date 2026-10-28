import BrandLogo from "@/components/shared/BrandLogo";
import type { AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";

const exploreLinks = [
  { id: "home", labelKey: "nav.home" },
  { id: "characters", labelKey: "nav.items.characters" },
  { id: "music", labelKey: "nav.items.music" },
  { id: "items", labelKey: "nav.items.items" },
  { id: "asset-viewer", labelKey: "nav.items.assetViewer" },
] as const;

const legalLinks = [
  { id: "license", labelKey: "nav.items.license" },
  { id: "terms", labelKey: "nav.items.terms" },
  { id: "privacy", labelKey: "nav.items.privacy" },
] as const;

export default function Footer({ locale }: { locale: AppLocale }) {
  const version = process.env.PUBLIC_MOENOTES_VERSION || "0.2.0";
  const revision = process.env.PUBLIC_MOENOTES_REVISION || "";
  const versionTag = `v${version}`;
  const shortRevision = revision.slice(0, 7);
  const repository = siteConfig.repository;

  return (
    <footer className="mn-site-footer mn-shell-offset mx-auto max-w-[var(--mn-layout-max-width,120rem)] px-4 pb-20 text-on-surface transition-[padding] duration-300 ease-[var(--md-sys-motion-easing-emphasized)] md:pb-6 md:pl-[calc(var(--mn-sidebar-offset,17rem)+var(--mn-filter-offset,0rem)+1.5rem)] md:pr-6">
      <div className="md3-surface rounded-shape-xl px-6 py-10 sm:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <div className="flex flex-col gap-4">
            <a
              href={localizePath(getRoutePathById("home"), locale)}
              className="md3-state -ml-2 flex w-fit items-center rounded-full px-2 py-1 text-on-surface"
            >
              <BrandLogo className="mn-brand-shell" />
            </a>
            <p className="text-body-medium text-on-surface-variant">{t(locale, "footer.desc")}</p>
          </div>

          <div>
            <h3 className="mb-3 text-title-small text-on-surface">{t(locale, "footer.explore")}</h3>
            <ul className="flex flex-col gap-1">
              {exploreLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={localizePath(getRoutePathById(link.id), locale)}
                    className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                  >
                    <span>{t(locale, link.labelKey)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-title-small text-on-surface">{t(locale, "footer.sister")}</h3>
            <ul className="flex flex-col gap-1">
              {siteConfig.sisterSites.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                  >
                    <span>{link.label}</span>
                  </a>
                </li>
              ))}
            </ul>

            {siteConfig.friendlySites && siteConfig.friendlySites.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-title-small text-on-surface">{t(locale, "footer.friendly")}</h3>
                <ul className="flex flex-col gap-1">
                  {siteConfig.friendlySites.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                      >
                        <span>{link.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-title-small text-on-surface">{t(locale, "footer.contact")}</h3>
            <ul className="flex flex-col gap-1 text-body-medium text-on-surface-variant">
              <li>
                <a
                  href={siteConfig.contact.bugReportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                >
                  <svg className="h-[18px] w-[18px] shrink-0 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="14" x="8" y="5" rx="4" /><path d="M12 2v3M12 19v3M5 12h14M6 7l3 3M18 7l-3 3M6 17l3-3M18 17l-3-3" /></svg>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{t(locale, "footer.bugReport")}</span>
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.community.discord.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                >
                  <svg className="h-[18px] w-[18px] shrink-0 text-on-surface-variant" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.1.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.095 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.095 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" /></svg>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{t(locale, "footer.discord", { name: siteConfig.community.discord.name })}</span>
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.community.qq.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                >
                  <svg className="h-[18px] w-[18px] shrink-0 text-on-surface-variant" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.914 14.529a32 32 0 0 0-.676-1.886l-.91-2.246c.002-.026.013-.468.013-.696C18.34 5.86 16.508 2 12 2S5.66 5.86 5.66 9.7c0 .229.011.671.012.697l-.91 2.246a32 32 0 0 0-.675 1.886c-.86 2.737-.581 3.87-.369 3.895c.455.054 1.771-2.06 1.771-2.06c0 1.224.637 2.822 2.016 3.976c-.515.157-1.147.399-1.554.695c-.365.267-.319.54-.253.65c.289.481 4.955.307 6.303.157c1.347.15 6.014.324 6.302-.158c.066-.11.112-.382-.253-.649c-.407-.296-1.039-.538-1.555-.695c1.379-1.154 2.016-2.752 2.016-3.977c0 0 1.316 2.115 1.771 2.06c.212-.025.49-1.157-.37-3.894" /></svg>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{t(locale, "footer.qq", { name: siteConfig.community.qq.name, number: siteConfig.community.qq.number })}</span>
                </a>
              </li>
              {repository && (
                <li>
                  <a
                    href={repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-8 items-center gap-2 text-body-medium text-on-surface-variant transition-colors hover:text-primary hover:underline"
                  >
                    <svg className="h-[18px] w-[18px] shrink-0 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
                    <span>{t(locale, "footer.github")}</span>
                  </a>
                </li>
              )}
              <li className="flex min-h-8 items-center gap-2 select-all">
                <svg className="h-[18px] w-[18px] shrink-0 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                <span className="min-w-0 break-all font-[var(--md-ref-typeface-mono)] text-body-small">{siteConfig.contact.email}</span>
              </li>
              <li className="mt-2 text-body-small text-on-surface-variant">{t(locale, "footer.copyright")}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-outline-variant pt-6 text-center text-body-small text-on-surface-variant">
          <nav aria-label={t(locale, "footer.legal")} className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {legalLinks.map((link) => (
              <a key={link.id} href={localizePath(getRoutePathById(link.id), locale)} className="text-label-large hover:text-primary hover:underline">
                {t(locale, link.labelKey)}
              </a>
            ))}
            <a href={localizePath(getRoutePathById("open-platform"), locale)} className="text-label-large hover:text-primary hover:underline">
              {t(locale, "openPlatform.title")}
            </a>
          </nav>
          {t(locale, "footer.disclaimer")}
          <p className="mt-3 font-[var(--md-ref-typeface-mono)] text-label-small text-on-surface-variant">
            {t(locale, "footer.version")}{" "}
            {repository ? (
              <a href={`${repository}/releases/tag/${versionTag}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                {versionTag}
              </a>
            ) : (
              versionTag
            )}
            {shortRevision && (
              <>
                {" · "}
                {repository ? (
                  <a href={`${repository}/commit/${revision}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                    {shortRevision}
                  </a>
                ) : (
                  shortRevision
                )}
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
