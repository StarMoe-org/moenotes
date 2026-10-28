import { siteUrl } from "@/lib/seo/url";

export function GET() {
  const body = `User-agent: *
Allow: /
Content-Signal: ai-train=yes, search=yes, ai-input=yes

Sitemap: ${siteUrl("/sitemap.xml")}
# LLM / Markdown Index: ${siteUrl("/llms.txt")}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
