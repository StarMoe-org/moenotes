import { join } from "node:path";
import { parsePlayerPagePath, playerShellPath } from "../src/config/players";
import { errorMessage, log } from "./builds";
import { serveStatic, type SiteRoots } from "./static";

/**
 * Player pages with the player in their link preview. Crawlers that build previews (chat apps, social sites) do
 * not run the page's script, so for `/u/{server}/{profileId}` the shell's title and description tags get the
 * player's name and level, read from starmoe-api's public profile. Anything that goes wrong serves the plain
 * shell, as serveStatic would.
 */

const LOOKUP_TIMEOUT_MS = 1500;
/** How long a lookup is reused. starmoe-api stores profiles for 30 minutes anyway. */
const HIT_TTL_MS = 5 * 60 * 1000;
/** Private, unknown and failed lookups are retried sooner, so a page made public shows up quickly. */
const MISS_TTL_MS = 30 * 1000;
const CACHE_LIMIT = 2000;

interface PlayerMeta {
  name: string;
  level: number | null;
  profileId: string;
}

const cache = new Map<string, { meta: PlayerMeta | null; until: number }>();

export async function servePlayerPage(request: Request, roots: SiteRoots, apiOrigin: string | undefined): Promise<Response> {
  const url = new URL(request.url);
  const player = parsePlayerPagePath(url.pathname);
  const shell = playerShellPath(url.pathname);
  if (!player || !shell || !apiOrigin || !roots.current || request.method !== "GET") return serveStatic(request, roots);

  const meta = await lookup(apiOrigin, player.server, player.profileId);
  const file = Bun.file(join(roots.current, shell, "index.html"));
  if (!meta || !(await file.exists())) return serveStatic(request, roots);

  const summary = [meta.name, meta.level === null ? null : `Lv.${meta.level}`, `ID ${meta.profileId}`].filter(Boolean).join(" · ");
  const prefixContent = (prefix: string) => ({
    element(element: HTMLRewriterTypes.Element) {
      element.setAttribute("content", `${prefix}${element.getAttribute("content") ?? ""}`);
    },
  });
  const rewriter = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.prepend(`${meta.name} | `, { html: false });
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:image:alt"], meta[name="twitter:image:alt"]', prefixContent(`${meta.name} | `))
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', prefixContent(`${summary} — `))
    .on('meta[property="og:url"]', {
      element(element) {
        try {
          const canonical = new URL(element.getAttribute("content") ?? "");
          canonical.pathname = url.pathname;
          element.setAttribute("content", canonical.href);
        } catch {
          // Leave a malformed value alone.
        }
      },
    });

  // Built per request, so no ETag and no precompressed variant; the shell is small.
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" };
  return rewriter.transform(new Response(file, { headers }));
}

async function lookup(apiOrigin: string, server: string, profileId: string): Promise<PlayerMeta | null> {
  const key = `${server}/${profileId}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.until > now) return cached.meta;

  let meta: PlayerMeta | null = null;
  try {
    const response = await fetch(new URL(`/api/players/${server}/${profileId}`, apiOrigin), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as { profile?: { name?: unknown }; brief?: { level?: unknown } | null };
      const name = typeof body.profile?.name === "string" ? body.profile.name.trim() : "";
      const level = Number(body.brief?.level);
      if (name) meta = { name, level: Number.isFinite(level) && level > 0 ? level : null, profileId };
    }
  } catch (error) {
    log(`player meta: ${server} lookup failed: ${errorMessage(error)}`);
  }

  if (cache.size >= CACHE_LIMIT) {
    for (const [entry, value] of cache) if (value.until <= now) cache.delete(entry);
    if (cache.size >= CACHE_LIMIT) cache.clear();
  }
  cache.set(key, { meta, until: now + (meta ? HIT_TTL_MS : MISS_TTL_MS) });
  return meta;
}
