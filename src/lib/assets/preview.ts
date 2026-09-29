import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { releaseFileUrl, serverAssetUrl } from "./release";
import { getAssetUrl } from "./url";

const ADDRESSABLE_ROOT = "Assets/AddressableResources/";

/**
 * Direct preview URL for a file in the asset browser, built from its path; the asset service answers 404
 * for paths it has not exported. Audio previews the cue named after its sheet (BGM, SE and songs). The file comes from
 * the catalog of `server`, the browsed region's.
 */
export function getAssetBrowserPreview(
  filePath: string,
  locale: AppLocale,
  server: GameServer = PRIMARY_SERVER,
): { type: "image" | "audio"; url: string } | null {
  if (!filePath) return null;
  let relPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (relPath.startsWith(ADDRESSABLE_ROOT)) relPath = relPath.slice(ADDRESSABLE_ROOT.length);

  if (/\.(png|webp)$/i.test(relPath)) {
    const url = getAssetUrl({ path: relPath.replace(/\.(png|webp)$/i, ".png"), locale });
    return url ? { type: "image", url: serverAssetUrl(url, server) } : null;
  }

  const sound = relPath.match(/^(Cri\/Sound\/(?:[^/]+\/)*([^/]+))\.(?:acb|awb)$/i);
  if (sound) return { type: "audio", url: serverAssetUrl(releaseFileUrl(sound[1]!, `${sound[2]}.m4a`, locale), server) };

  return null;
}
