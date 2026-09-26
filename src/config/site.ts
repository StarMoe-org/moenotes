export interface SiteConfig {
  name: string;
  shortName: string;
  titleTemplate: string;
  description: string;
  baseUrl: string;
  author: string;
  developerUrl: string;
  ogImage: string;
  repository?: string;
  xmlNamespaces: {
    xhtml: string;
  };
  sisterSites: Array<{ label: string; url: string }>;
  community: {
    discord: { name: string; url: string };
    qq: { name: string; number: string; url: string };
  };
  contact: {
    email: string;
    feedbackUrl: string;
    bugReportUrl: string;
  };
  /** Download links in the notice for in-app browsers and outdated engines; `recommendedBrowsers()` picks them per locale. */
  recommendedBrowsers: {
    chrome: { name: string; url: string };
    edge: { name: string; url: string };
    /** Chromium-based and in mainland Android app stores; the site redirects to its zh or en page. */
    lemur: { name: string; url: string };
  };
}

export const siteConfig: SiteConfig = {
  name: "Moenotes",
  shortName: "Moenotes",
  titleTemplate: "%s | Moenotes",
  description: "Moenotes is a multilingual BanG Dream! Our Notes database by StarMoe for exploring characters, cards, songs, stories, and game assets.",
  baseUrl: "https://bdon.moe",
  author: "StarMoe",
  developerUrl: "https://star.moe",
  ogImage: "/og-default.png",
  repository: "https://github.com/StarMoe-org/moenotes",
  xmlNamespaces: {
    xhtml: "http://www.w3.org/1999/xhtml",
  },
  sisterSites: [
    { label: "pjsk.moe (MoeSekai)", url: "https://pjsk.moe" },
  ],
  community: {
    discord: { name: "StarMoe", url: "https://discord.gg/6JQMVQ2Mku" },
    qq: { name: "Moenotes", number: "754989697", url: "https://qm.qq.com/q/tIoZSO7vl6" },
  },
  contact: {
    email: "mail@exmeaning.com",
    feedbackUrl: "https://github.com/StarMoe-org/moenotes/issues",
    bugReportUrl: "https://github.com/StarMoe-org/moenotes/issues",
  },
  recommendedBrowsers: {
    chrome: { name: "Chrome", url: "https://www.google.com/chrome/" },
    edge: { name: "Edge", url: "https://www.microsoft.com/edge/download" },
    lemur: { name: "Lemur", url: "https://www.lemurbrowser.com/" },
  },
};

export const LICENSE_URLS = {
  cc: "https://creativecommons.org/licenses/by-nc/4.0/",
};
