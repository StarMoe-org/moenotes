import { buildEnvOrigin } from "./build-env";

export const masterdataConfig = {
  sources: {
    official: "https://metadata.bdon.moe",
    mirror: "https://metadata.bdon.moe",
  },
  /**
   * Build-time origin serving the same layout as `sources`, e.g. the metadata service's k3s Service address
   * (`MOENOTES_MASTERDATA_INTERNAL`). Build fetches of every source go through it; see docs/deployment.md.
   */
  internal: buildEnvOrigin("MOENOTES_MASTERDATA_INTERNAL"),
  versionPath: "/current_version.json",
  /** Per region: its path and the SHA-256 of each file, so identical tables of several servers load once. */
  indexPath: "/index.json",
  /**
   * The primary server's tables in an older single-directory checkout (`MOENOTES_MASTERDATA_DIR`). Over HTTP every
   * server has its own path (`masterdataPath` in src/config/servers.ts).
   */
  masterPath: "/master",
} as const;
