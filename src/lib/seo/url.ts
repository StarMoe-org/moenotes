import { siteConfig } from "@/config/site";

export function siteUrl(pathname: string): string {
  try {
    return new URL(pathname).toString();
  } catch {
    const base = new URL(siteConfig.baseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return new URL(pathname.replace(/^\//, ""), base).toString();
  }
}
