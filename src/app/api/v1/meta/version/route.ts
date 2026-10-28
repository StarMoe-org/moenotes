import { getBuildServers } from "@/lib/masterdata/build-servers";
import { getBuildManifest } from "@/lib/masterdata/build-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const [manifest, servers] = await Promise.all([getBuildManifest(), getBuildServers()]);
  return Response.json(
    {
      dataVersion: manifest.dataVersion || "unknown",
      generatedAt: manifest.generatedAt || null,
      servers,
      markdown: {
        enabled: true,
        negotiationHeader: "Accept: text/markdown",
        extension: ".md",
        llmsTxt: "/llms.txt",
        llmsFullTxt: "/llms-full.txt",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
