import type { AppLocale } from "@/config/locales";
import type { siteConfig } from "@/config/site";

/**
 * Detection behind the browser notice. It runs as an inline ES5 script, because the browsers it is
 * for (apps' built-in WebViews, engines older than Chrome 111 / Safari 16.2) may fail the site's
 * own bundles and Tailwind v4 styles.
 */

/** User-agent tokens of apps' built-in browsers. */
export const IN_APP_BROWSER_PATTERN = new RegExp([
  "MicroMessenger", // WeChat
  "\\bQQ\\/", // QQ; the standalone QQ Browser says MQQBrowser
  "Weibo",
  "AlipayClient",
  "DingTalk",
  "aweme", // Douyin
  "BytedanceWebview",
  "NewsArticle", // Toutiao
  "xhsdiscover", // Xiaohongshu
  "BiliApp",
  "baiduboxapp",
  "KAKAOTALK",
  "NAVER\\(inapp",
  "\\bLine\\/",
  "FBA[NV]", // Facebook
  "Instagram",
  "; wv\\)", // Any Android app's system WebView
].join("|"), "i");

const IOS_PATTERN = /iPhone|iPad|iPod/;
/** iPadOS asks for desktop sites with a Mac user agent; touch gives it away. */
const IPAD_DESKTOP_PATTERN = /Macintosh/;
const ANDROID_PATTERN = /Android/i;
/** Phones with no Lemur, Chrome or Edge to offer, e.g. HarmonyOS NEXT. */
const OTHER_MOBILE_PATTERN = /Mobile|OpenHarmony/i;

/** The site's CSS needs color-mix(), which arrived together with the rest of what Tailwind v4 relies on. */
export const MODERN_CSS_TEST = ["color", "color-mix(in srgb, red, blue)"] as const;

/**
 * iOS gets no download links: every browser there runs on the system's WebKit, so only an iOS update helps.
 * "other" gets no suggestion at all.
 */
export type NoticePlatform = "ios" | "android" | "desktop" | "other";

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER_PATTERN.test(userAgent);
}

export function noticePlatform(userAgent: string, maxTouchPoints: number): NoticePlatform {
  if (IOS_PATTERN.test(userAgent) || (IPAD_DESKTOP_PATTERN.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (ANDROID_PATTERN.test(userAgent)) return "android";
  return OTHER_MOBILE_PATTERN.test(userAgent) ? "other" : "desktop";
}

export type RecommendedBrowser = keyof typeof siteConfig.recommendedBrowsers;

/**
 * zh-CN readers are mostly in mainland China, and its copy names QQ and WeChat: Android gets Lemur,
 * since Chrome needs Google Play there, and desktop gets Edge alone, which downloads without a VPN.
 * Keep `browserNotice.android` / `.desktop` in each locale in step with these.
 */
export function recommendedBrowsers(locale: AppLocale): Record<"android" | "desktop", RecommendedBrowser[]> {
  return locale === "zh-CN"
    ? { android: ["lemur"], desktop: ["edge"] }
    : { android: ["chrome", "edge"], desktop: ["edge", "chrome"] };
}

export interface BrowserNoticeScriptOptions {
  templateId: string;
  storageKey: string;
}

/**
 * Inserts the notice from its <template> when the browser is an app's WebView or lacks modern CSS,
 * keeps the parts marked `data-browser-notice-only` that apply (`in-app`, `ios` for an outdated
 * iOS, or the platform), and remembers a dismissal. Keep this ES5.
 */
export function buildBrowserNoticeScript({ templateId, storageKey }: BrowserNoticeScriptOptions): string {
  return `
(function(){
  try {
    var template = document.getElementById(${JSON.stringify(templateId)});
    if (!template || !template.content) return;
    var key = ${JSON.stringify(storageKey)};
    try { if (localStorage.getItem(key)) return; } catch (e) {}
    var ua = navigator.userAgent || '';
    var inApp = new RegExp(${JSON.stringify(IN_APP_BROWSER_PATTERN.source)}, 'i').test(ua);
    var modern = false;
    try { modern = !!(window.CSS && CSS.supports && CSS.supports(${JSON.stringify(MODERN_CSS_TEST[0])}, ${JSON.stringify(MODERN_CSS_TEST[1])})); } catch (e) {}
    if (!inApp && modern) return;
    var ios = ${IOS_PATTERN}.test(ua) || (${IPAD_DESKTOP_PATTERN}.test(ua) && navigator.maxTouchPoints > 1);
    var platform = ios ? 'ios' : ${ANDROID_PATTERN}.test(ua) ? 'android' : ${OTHER_MOBILE_PATTERN}.test(ua) ? 'other' : 'desktop';
    var show = { 'in-app': inApp, 'ios': ios && !modern, 'android': platform === 'android', 'desktop': platform === 'desktop' };
    var fragment = document.importNode(template.content, true);
    var notice = fragment.querySelector('[data-browser-notice]');
    if (!notice) return;
    var parts = notice.querySelectorAll('[data-browser-notice-only]');
    for (var i = 0; i < parts.length; i++) {
      if (!show[parts[i].getAttribute('data-browser-notice-only')]) parts[i].parentNode.removeChild(parts[i]);
    }
    var close = notice.querySelector('[data-browser-notice-close]');
    if (close) close.addEventListener('click', function(){
      if (notice.parentNode) notice.parentNode.removeChild(notice);
      try { localStorage.setItem(key, '1'); } catch (e) {}
    });
    template.parentNode.insertBefore(fragment, template);
  } catch (e) {}
})();`;
}
