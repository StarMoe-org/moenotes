import { siteUrl } from "@/lib/seo/url";

export function GET() {
  const body = `User-agent: *
Allow: /

Sitemap: ${siteUrl("/sitemap.xml")}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
