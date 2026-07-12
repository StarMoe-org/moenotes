export interface SiteConfig {
  name: string;
  shortName: string;
  titleTemplate: string;
  description: string;
  baseUrl: string;
  author: string;
  ogImage: string;
  repository?: string;
  xmlNamespaces: {
    xhtml: string;
  };
  sisterSites: Array<{ label: string; url: string }>;
  contact: {
    email: string;
    feedbackUrl: string;
    bugReportUrl: string;
  };
}

export const siteConfig: SiteConfig = {
  name: "Moenotes",
  shortName: "Moenotes",
  titleTemplate: "%s | Moenotes",
  description: "BanG Dream! Our Notes viewer by MoeSekai.",
  baseUrl: "https://notes.moesekai.dev",
  author: "MoeSekai",
  ogImage: "/og-default.png",
  xmlNamespaces: {
    xhtml: "http://www.w3.org/1999/xhtml",
  },
  sisterSites: [
    { label: "pjsk.moe (MoeSekai)", url: "https://pjsk.moe" },
  ],
  contact: {
    email: "mail@exmeaning.com",
    feedbackUrl: "https://github.com/moe-sekai/moenotes/issues",
    bugReportUrl: "https://github.com/moe-sekai/moenotes/issues",
  },
};

export const LICENSE_URLS = {
  cc: "https://creativecommons.org/licenses/by-nc/4.0/",
};

