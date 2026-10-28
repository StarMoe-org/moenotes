import type { AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { storageKeys } from "@/config/storage";
import { t } from "@/i18n";
import { buildBrowserNoticeScript, recommendedBrowsers } from "@/lib/browser/browser-notice";

interface BrowserNoticeProps {
  locale: AppLocale;
}

export default function BrowserNotice({ locale }: BrowserNoticeProps) {
  const templateId = "mn-browser-notice";
  const titleId = `${templateId}-title`;
  const recommended = recommendedBrowsers(locale);
  const platforms = [
    { platform: "android", text: t(locale, "browserNotice.android"), browsers: recommended.android },
    { platform: "desktop", text: t(locale, "browserNotice.desktop"), browsers: recommended.desktop },
  ] as const;
  const script = buildBrowserNoticeScript({ templateId, storageKey: storageKeys.browserNoticeDismissed });

  const innerHtml = [
    `<aside class="mn-browser-notice" data-browser-notice aria-labelledby="${titleId}">`,
    `<p id="${titleId}" class="mn-browser-notice-title">${escapeHtml(t(locale, "browserNotice.title"))}</p>`,
    `<p>${escapeHtml(t(locale, "browserNotice.description"))}</p>`,
    `<p class="mn-browser-notice-hint" data-browser-notice-only="in-app">${escapeHtml(t(locale, "browserNotice.inAppHint"))}</p>`,
    `<p class="mn-browser-notice-hint" data-browser-notice-only="ios">${escapeHtml(t(locale, "browserNotice.ios"))}</p>`,
    ...platforms.map(({ platform, text, browsers }) => {
      const links = browsers
        .map((id) => {
          const browser = siteConfig.recommendedBrowsers[id];
          return `<a href="${escapeHtml(browser.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(locale, "browserNotice.download", { name: browser.name }))}</a>`;
        })
        .join("");
      return `<div data-browser-notice-only="${platform}"><p class="mn-browser-notice-hint">${escapeHtml(text)}</p><p class="mn-browser-notice-links">${links}</p></div>`;
    }),
    `<button type="button" class="mn-browser-notice-close" data-browser-notice-close aria-label="${escapeHtml(t(locale, "browserNotice.dismiss"))}" title="${escapeHtml(t(locale, "browserNotice.dismiss"))}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>`,
    `</aside>`,
  ].join("");

  return (
    <>
      <template id={templateId} dangerouslySetInnerHTML={{ __html: innerHtml }} />
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
