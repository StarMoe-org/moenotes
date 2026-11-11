import type { NextRequest } from "next/server";
import { buildFetch } from "@/lib/build/fetch";
import { getStorySites } from "@/lib/story/player-data";
import {
  getApprovedStoryResourcePath,
  getGatedStoryBundle,
  isStorySiteRegion,
} from "@/lib/story/site-access";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ server: string; path: string[] }>;
}

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const NOT_FOUND = () => Response.json({ error: "Story resource not found" }, { status: 404, headers: PRIVATE_NO_STORE });

/**
 * Proxy a story manifest or one of the assets it names. The episode's regional MasterData release date is checked
 * before every request, and file requests must be listed by that released episode's story/model manifests.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { server, path } = await params;
  if (!isStorySiteRegion(server) || !Array.isArray(path)) return NOT_FOUND();

  const manifestMatch = path.length === 2 && path[0] === "stories"
    ? /^([1-9]\d*)\.json$/.exec(path[1] ?? "")
    : null;
  if (manifestMatch) {
    const advId = Number(manifestMatch[1]);
    const bundle = await getGatedStoryBundle(server, advId).catch((error: unknown) => {
      console.error("[story-player] failed to verify a story manifest:", error);
      return null;
    });
    return bundle
      ? Response.json(bundle.manifest, { headers: PRIVATE_NO_STORE })
      : NOT_FOUND();
  }

  const resourceMatch = path.length >= 4 && path[0] === "stories"
    ? /^([1-9]\d*)$/.exec(path[1] ?? "")
    : null;
  if (!resourceMatch) return NOT_FOUND();

  const advId = Number(resourceMatch[1]);
  const resourcePath = getApprovedStoryResourcePath(path.slice(2).join("/"));
  if (!resourcePath) return NOT_FOUND();

  const bundle = await getGatedStoryBundle(server, advId).catch((error: unknown) => {
    console.error("[story-player] failed to verify a story resource:", error);
    return null;
  });
  if (!bundle) return NOT_FOUND();

  const modelManifest = bundle.modelManifests.get(resourcePath);
  if (modelManifest) {
    return Response.json(modelManifest, { headers: PRIVATE_NO_STORE });
  }
  if (!bundle.assetPaths.has(resourcePath)) return NOT_FOUND();

  const site = getStorySites().find((candidate) => candidate.server === server);
  if (!site) return NOT_FOUND();
  const upstreamUrl = new URL(resourcePath, `${site.root.replace(/\/+$/, "")}/`);
  let upstream: Response;
  try {
    upstream = await buildFetch(upstreamUrl, { cache: "no-store", redirect: "error" });
  } catch (error) {
    console.error("[story-player] failed to fetch a verified story asset:", error);
    return Response.json({ error: "Story resource is temporarily unavailable" }, { status: 502, headers: PRIVATE_NO_STORE });
  }
  if (!upstream.ok || !upstream.body) return NOT_FOUND();

  const headers = new Headers(PRIVATE_NO_STORE);
  const contentType = upstream.headers.get("content-type");
  const contentEncoding = upstream.headers.get("content-encoding");
  if (contentType) headers.set("Content-Type", contentType);
  if (contentEncoding) headers.set("Content-Encoding", contentEncoding);
  return new Response(upstream.body, { status: 200, headers });
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
