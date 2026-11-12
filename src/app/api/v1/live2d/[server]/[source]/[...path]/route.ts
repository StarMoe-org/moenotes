import type { NextRequest } from "next/server";
import { buildFetch } from "@/lib/build/fetch";
import { getGatedLive2DBundle, getApprovedLive2DResourcePath, isLive2DSource } from "@/lib/live2d/site-access";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ server: string; source: string; path: string[] }>;
}

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const NOT_FOUND = () => Response.json({ error: "Live2D resource not found" }, { status: 404, headers: NO_STORE });

/**
 * Proxy model manifests and assets only for models the requested server's MasterData lets through: a dated equippable
 * costume must be released, while a story-only outfit (which MasterData does not date) is served as before.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { server, source, path } = await params;
  if (!Array.isArray(path) || !isLive2DSource(source)) return NOT_FOUND();

  const manifestMatch = path.length === 2 && path[0] === "models"
    ? /^([a-z0-9_]+)\.json$/.exec(path[1] ?? "")
    : null;
  const isModelAssetPath = path.length === 4 && path[0] === "models" && path[2] === "assets";
  const modelId = manifestMatch?.[1] ?? (isModelAssetPath ? path[1] : undefined);
  if (!modelId || !/^[a-z0-9_]+$/.test(modelId)) return NOT_FOUND();

  const resourcePath = isModelAssetPath
    ? getApprovedLive2DResourcePath(path.slice(2).join("/"))
    : null;
  if (!manifestMatch && (!isModelAssetPath || !resourcePath)) return NOT_FOUND();

  const bundle = await getGatedLive2DBundle(server, source, modelId).catch((error: unknown) => {
    console.error("[live2d] failed to verify a model bundle:", error);
    return null;
  });
  if (!bundle) return NOT_FOUND();

  if (manifestMatch) return Response.json(bundle.manifest, { headers: NO_STORE });
  if (!resourcePath || !bundle.assetPaths.has(resourcePath)) return NOT_FOUND();

  const upstreamUrl = new URL(resourcePath, `${bundle.root.replace(/\/+$/, "")}/`);
  let upstream: Response;
  try {
    upstream = await buildFetch(upstreamUrl, { cache: "no-store", redirect: "error" });
  } catch (error) {
    console.error("[live2d] failed to fetch a verified model asset:", error);
    return Response.json({ error: "Model resource is temporarily unavailable" }, { status: 502, headers: NO_STORE });
  }
  if (!upstream.ok || !upstream.body) return NOT_FOUND();

  const headers = new Headers(NO_STORE);
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
