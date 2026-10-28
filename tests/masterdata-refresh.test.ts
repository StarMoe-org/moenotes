import { describe, expect, test } from "bun:test";
import { memo, state } from "@/lib/masterdata/build-core";
import {
  currentMasterDataEpochSync,
  getBuildManifest,
  isMasterDataManifestFresh,
  resetMasterDataSnapshotForTests,
} from "@/lib/masterdata/build-snapshot";

describe("Runtime MasterData TTL refresh & epoch invalidation", () => {
  test("memo caches selectors per epoch and invalidates when epoch advances", async () => {
    await getBuildManifest();
    expect(isMasterDataManifestFresh()).toBe(true);

    let runs = 0;
    const key = "test:masterdata-epoch-probe";
    state.selectors.delete(key);

    const first = await memo(key, async () => ++runs);
    const second = await memo(key, async () => ++runs);
    expect(first).toBe(1);
    expect(second).toBe(1);

    const beforeEpoch = currentMasterDataEpochSync();
    // Simulate a hot MasterData version bump by mutating state.epoch behind memo()
    state.epoch = beforeEpoch - 1;
    const third = await memo(key, async () => ++runs);
    expect(third).toBe(2);
    expect(state.epoch).toBe(beforeEpoch);

    state.selectors.delete(key);
    resetMasterDataSnapshotForTests();
    const manifestAfterReset = await getBuildManifest();
    expect(manifestAfterReset.dataVersion.length).toBeGreaterThan(0);
  });
});
