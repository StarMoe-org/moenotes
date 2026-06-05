export interface SiteConfig {
  name: string;
  shortName: string;
  titleTemplate: string;
  description: string;
  baseUrl: string;
  author: string;
  ogImage: string;
  repository?: string;
}

export const siteConfig: SiteConfig = {
  name: "Moenotes",
  shortName: "Moenotes",
  titleTemplate: "%s | Moenotes",
  description: "BanG Dream! Our Notes viewer by MoeSekai.",
  baseUrl: "https://notes.moesekai.dev",
  author: "MoeSekai",
  ogImage: "/og-default.png",
};
