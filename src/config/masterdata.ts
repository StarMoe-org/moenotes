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
  masterPath: "/master",
} as const;
