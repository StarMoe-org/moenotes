export interface SiteConfig {
  name: string;
  shortName: string;
  titleTemplate: string;
  description: string;
  baseUrl: string;
  author: string;
  ogImage: string;
  repository?: string;
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
  sisterSites: [
    { label: "pjsk.moe (MoeSekai)", url: "https://pjsk.moe" },
    { label: "sekai.best", url: "https://sekai.best" },
    { label: "bestdori.com", url: "https://bestdori.com" },
  ],
  contact: {
    email: "admin@moenotes.moe",
    feedbackUrl: "https://github.com/MoeSekai/moenotes/issues",
    bugReportUrl: "https://github.com/MoeSekai/moenotes/issues",
  },
};
