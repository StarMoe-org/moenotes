import { headers } from "next/headers";
import { cache } from "react";
import {
  getBuildManifest,
  resolveBypassMasterDataManifest,
  shouldBypassMasterDataCache,
} from "@/lib/masterdata/build-snapshot";
import type { VersionManifest } from "@/types/masterdata";

/**
 * Deduplicated per-RSC-request MasterData manifest resolver.
 * When the incoming request carries a force-bypass signal (`?refresh_masterdata=1`, `?__refresh=1`, `?nocache=1`,
 * or `x-moenotes-bypass-cache: 1`), `resolveBypassMasterDataManifest` runs once for the whole SSR render tree and
 * only purges in-memory tables when `MOENOTES_CACHE_PURGE_TOKEN` authorization is present.
 */
export const resolveRequestMasterDataManifest = cache(async (): Promise<VersionManifest | null> => {
  const reqHeaders = await headers();
  const bypass = shouldBypassMasterDataCache({ headers: reqHeaders });
  if (bypass) {
    return await resolveBypassMasterDataManifest(reqHeaders).catch(() => null);
  }
  return await getBuildManifest().catch(() => null);
});
