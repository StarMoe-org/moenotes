import { siteConfig } from "@/config/site";

export function GET() {
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL("/sitemap.xml", siteConfig.baseUrl).toString()}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
