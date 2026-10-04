/** Documentation links are independent of the main site's route registry. */
const localePrefixes: Record<string, string> = {
  "zh-CN": "", "zh-TW": "zh-tw/", "ja-JP": "ja/", "en-US": "en/", "ko-KR": "ko/",
};

/** Preserve legacy section bookmarks when moving from the former single-page reference. */
export const docsSectionPages: Record<string, string> = {
  overview: "", stepsTitle: "quickstart.html", scopesTitle: "guides/auth.html",
  archiveTitle: "guides/saves.html", securityTitle: "guides/limits.html", errorsTitle: "guides/errors.html",
  profiles: "api/profiles.html", profileImages: "api/profile-images.html",
  rankings: "api/rankings.html", decks: "api/decks.html", circles: "api/circles.html",
  gacha: "api/gacha.html", announcements: "api/announcements.html",
};

/** Invalid/unconfigured deployments never produce a fake link or an unsafe URL scheme. */
export function resolveDocsUrl(base: string, locale: string, hash = ""): string | null {
  if (!base.trim()) return null;
  try {
    const url = new URL(base.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    const key = hash.replace(/^#/, "");
    const page = Object.hasOwn(docsSectionPages, key) ? docsSectionPages[key] : "";
    return new URL(`${localePrefixes[locale] ?? "en/"}${page}`, url).href;
  } catch {
    return null;
  }
}
