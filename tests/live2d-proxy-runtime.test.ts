import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { GET as getLive2DIndex } from "../src/app/api/v1/live2d/index/route";
import { GET as getLive2DResource } from "../src/app/api/v1/live2d/[server]/[source]/[...path]/route";
import { assetConfig } from "../src/config/assets";
import { findRequestedLive2DModel, type Live2DModel } from "../src/lib/live2d/models";
import { getLive2DModelAssetBase } from "../src/lib/live2d/client";
import { resetLive2DSiteAccessCachesForTests } from "../src/lib/live2d/site-access";
import { resetMasterDataSnapshotForTests } from "../src/lib/masterdata/build-snapshot";
import { getApprovedStoryResourcePath } from "../src/lib/story/site-access";

const originalMasterDataDir = process.env.MOENOTES_MASTERDATA_DIR;
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  resetLive2DSiteAccessCachesForTests();
  resetMasterDataSnapshotForTests();
});

function createReleasedAndFutureCostumes(): string {
  const root = mkdtempSync(join(tmpdir(), "moenotes-live2d-proxy-test-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  process.env.MOENOTES_MASTERDATA_DIR = root;
  cleanups.push(() => {
    if (originalMasterDataDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
    else process.env.MOENOTES_MASTERDATA_DIR = originalMasterDataDir;
  });

  mkdirSync(join(root, "jp"), { recursive: true });
  writeFileSync(join(root, "current_version.json"), JSON.stringify({
    dataVersion: "live2d-proxy-test-v1",
    regions: { jp: { version: "1.0.0/jp-test", assetVersion: "1.0.0", requiredTables: 2, availableTables: 2 } },
  }));
  writeFileSync(join(root, "jp", "MasterCharacterCostume.json"), JSON.stringify([
    { _id: 1001, _characterID: 1, _groupID: 101, _costumeType: 2, _costumeId: 1, _isDefault: true, _live2dPath: "001_live/live2d_tomori_001_live_01" },
    { _id: 1002, _characterID: 1, _groupID: 102, _costumeType: 2, _costumeId: 2, _isDefault: false, _live2dPath: "001_live/live2d_tomori_001_live_future" },
  ]));
  writeFileSync(join(root, "jp", "MasterCharacterCostumeGroup.json"), JSON.stringify([
    { _id: 101, _characterID: 1, _costumeNameTextId: "", _iconPath: "", _isInitial: true, _isChangeable: false, _specialConditionMemberCardId: 0, _startAt: "" },
    { _id: 102, _characterID: 1, _costumeNameTextId: "", _iconPath: "", _isInitial: false, _isChangeable: true, _specialConditionMemberCardId: 0, _startAt: "2999/01/01 00:00:00" },
  ]));
  resetMasterDataSnapshotForTests();
  resetLive2DSiteAccessCachesForTests();
  return root;
}

function live2DResourceRequest(path: string[], query = ""): NextRequest {
  const suffix = path.map((part) => encodeURIComponent(part)).join("/");
  return new NextRequest(`https://moenotes.test/api/v1/live2d/jp/chart/${suffix}${query}`);
}

function live2DResourceContext(path: string[]) {
  return { params: Promise.resolve({ server: "jp", source: "chart", path }) };
}

describe("ournotes-player 0.1.8 Live2D proxy runtime", () => {
  test("the real AssetStore resolves listed files under the model-scoped proxy directory", async () => {
    const modelId = "adv_live2d_anon_002_casual_spring_01";
    const hash = "a".repeat(64);
    const manifestUrl = `https://moenotes.test/api/v1/live2d/jp/chart/models/${modelId}.json`;
    const expectedAssetUrl = `https://moenotes.test/api/v1/live2d/jp/chart/models/${modelId}/assets/${hash}.moc3`;
    const base = getLive2DModelAssetBase(manifestUrl, "https://moenotes.test/tools/live2d");
    const calls: string[] = [];
    const { AssetStore } = await import("ournotes-player/live2d");
    const store = await AssetStore.fromManifest(manifestUrl, {
      base,
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url === manifestUrl) {
          return Response.json({
            format: 3,
            id: modelId,
            root: "../",
            files: { "model.moc3": { asset: `assets/${hash}.moc3`, size: 3 } },
          });
        }
        if (url === expectedAssetUrl) return new Response(new Uint8Array([1, 2, 3]));
        return new Response("not found", { status: 404 });
      },
    });

    expect(base).toBe(`https://moenotes.test/api/v1/live2d/jp/chart/models/${modelId}/`);
    expect(calls).toEqual([manifestUrl, expectedAssetUrl]);
    expect(store.has("model.moc3")).toBe(true);
  });

  test("the same Next route releases listed assets only, and denies direct unknown, malformed and unreleased ids", async () => {
    createReleasedAndFutureCostumes();
    const releasedId = "live2d_tomori_001_live_01";
    const futureId = "live2d_tomori_001_live_future";
    // A story-only outfit: no MasterCharacterCostume row and no release date anywhere in MasterData.
    const storyOnlyId = "adv_live2d_tomori_001_school_winter_hs_1st";
    const listedHash = "b".repeat(64);
    const storyHash = "d".repeat(64);
    const unlistedHash = "c".repeat(64);
    const assetBytes = new Uint8Array([7, 8, 9]);
    const calls: string[] = [];
    const fetcher = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === `${assetConfig.chartSite}/models.json`) {
        return Response.json({ models: [
          { id: releasedId, manifest: `models/${releasedId}.json`, group: "001_live", character: 1 },
          { id: futureId, manifest: `models/${futureId}.json`, group: "001_live", character: 1 },
          { id: storyOnlyId, manifest: `models/${storyOnlyId}.json`, group: "001_adv", character: 1 },
        ] });
      }
      if (url === `${assetConfig.storySiteJp}/models.json`) return new Response("not found", { status: 404 });
      if (url === `${assetConfig.chartSite}/models/${releasedId}.json`) {
        return Response.json({
          format: 3,
          id: releasedId,
          files: { "model.moc3": { asset: `assets/${listedHash}.moc3`, size: assetBytes.length } },
        });
      }
      if (url === `${assetConfig.chartSite}/models/${storyOnlyId}.json`) {
        return Response.json({
          format: 3,
          id: storyOnlyId,
          files: { "model.moc3": { asset: `assets/${storyHash}.moc3`, size: assetBytes.length } },
        });
      }
      if (url === `${assetConfig.chartSite}/assets/${listedHash}.moc3`) return new Response(assetBytes);
      if (url === `${assetConfig.chartSite}/assets/${storyHash}.moc3`) return new Response(assetBytes);
      return new Response("not found", { status: 404 });
    });
    cleanups.push(() => fetcher.mockRestore());

    const indexResponse = await getLive2DIndex(new NextRequest("https://moenotes.test/api/v1/live2d/index?server=jp"));
    expect(indexResponse.status).toBe(200);
    const index = await indexResponse.json() as { models: Live2DModel[] };
    expect(index.models.map((model) => model.id)).toEqual([releasedId, storyOnlyId]);
    expect(findRequestedLive2DModel(`?model=${releasedId}`, index.models)?.id).toBe(releasedId);
    expect(findRequestedLive2DModel(`?model=${storyOnlyId}`, index.models)?.id).toBe(storyOnlyId);
    expect(findRequestedLive2DModel(`?model=${futureId}`, index.models)).toBeNull();
    expect(findRequestedLive2DModel("?model=unknown_model", index.models)).toBeNull();
    expect(findRequestedLive2DModel("?model=../unreleased", index.models)).toBeNull();

    const manifestResponse = await getLive2DResource(
      live2DResourceRequest(["models", `${releasedId}.json`]),
      live2DResourceContext(["models", `${releasedId}.json`]),
    );
    expect(manifestResponse.status).toBe(200);

    const listedResponse = await getLive2DResource(
      live2DResourceRequest(["models", releasedId, "assets", `${listedHash}.moc3`]),
      live2DResourceContext(["models", releasedId, "assets", `${listedHash}.moc3`]),
    );
    expect(listedResponse.status).toBe(200);
    expect([...new Uint8Array(await listedResponse.arrayBuffer())]).toEqual([...assetBytes]);

    const storyManifestResponse = await getLive2DResource(
      live2DResourceRequest(["models", `${storyOnlyId}.json`]),
      live2DResourceContext(["models", `${storyOnlyId}.json`]),
    );
    expect(storyManifestResponse.status).toBe(200);
    const storyAssetResponse = await getLive2DResource(
      live2DResourceRequest(["models", storyOnlyId, "assets", `${storyHash}.moc3`]),
      live2DResourceContext(["models", storyOnlyId, "assets", `${storyHash}.moc3`]),
    );
    expect(storyAssetResponse.status).toBe(200);

    const deniedPaths = [
      ["assets", `${listedHash}.moc3`],
      ["models", "unknown_model.json"],
      ["models", "unknown_model", "assets", `${listedHash}.moc3`],
      ["models", releasedId, "assets", `${unlistedHash}.moc3`],
      ["models", futureId, "assets", `${listedHash}.moc3`],
      ["models", `${futureId}.json`],
      ["models", "../release.json"],
      ["models", releasedId, "assets", "nested", `${listedHash}.moc3`],
    ];
    for (const path of deniedPaths) {
      const response = await getLive2DResource(live2DResourceRequest(path), live2DResourceContext(path));
      expect(response.status).toBe(404);
    }

    expect(calls).not.toContain(`${assetConfig.chartSite}/assets/${unlistedHash}.moc3`);
    expect(calls).not.toContain(`${assetConfig.chartSite}/models/${futureId}.json`);
  });

  test("rejects a foreign or non-proxy model manifest before AssetStore can fetch assets", () => {
    expect(() => getLive2DModelAssetBase("https://evil.example/api/v1/live2d/jp/chart/models/model_a.json", "https://moenotes.test/tools/live2d"))
      .toThrow(/same-origin/);
    expect(() => getLive2DModelAssetBase("https://moenotes.test/chart-site/models/model_a.json", "https://moenotes.test/tools/live2d"))
      .toThrow(/release-gated/);
    expect(() => getLive2DModelAssetBase("https://moenotes.test/api/v1/live2d/jp/chart/models/model_a.json?x=1", "https://moenotes.test/tools/live2d"))
      .toThrow(/query or fragment/);
  });
});

describe("ournotes-player 0.1.8 story proxy runtime", () => {
  test("story model manifests and their listed assets resolve only inside the episode-scoped proxy", async () => {
    const advId = 24680;
    const modelId = "adv_live2d_anon_002_casual_spring_01";
    const hash = "d".repeat(64);
    const manifestUrl = `https://moenotes.test/api/v1/story-site/jp/stories/${advId}.json`;
    const modelUrl = `https://moenotes.test/api/v1/story-site/jp/stories/${advId}/models/${modelId}.json`;
    const assetUrl = `https://moenotes.test/api/v1/story-site/jp/stories/${advId}/assets/${hash}.moc3`;
    const calls: string[] = [];
    const { loadStoryStore } = await import("ournotes-player/story");
    const store = await loadStoryStore(manifestUrl, {
      lang: "ja",
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url === manifestUrl) {
          return Response.json({
            format: "ournotes.story-manifest/2",
            advId,
            language: "ja",
            root: `./${advId}/`,
            files: {},
            languages: { ja: { files: {} } },
            models: { [modelId]: `models/${modelId}.json` },
          });
        }
        if (url === modelUrl) {
          return Response.json({
            format: 3,
            id: modelId,
            files: { "model.moc3": { asset: `assets/${hash}.moc3`, size: 3 } },
          });
        }
        if (url === assetUrl) return new Response(new Uint8Array([4, 5, 6]));
        return new Response("not found", { status: 404 });
      },
    });

    expect(calls).toEqual([manifestUrl, modelUrl, assetUrl]);
    expect(store.has(`live2d/${modelId}/model.moc3`)).toBe(true);

    const routeResources = calls.slice(1).map((url) => {
      const pathname = new URL(url).pathname;
      const routePath = pathname.split("/").slice(5);
      expect(routePath[0]).toBe("stories");
      expect(routePath[1]).toBe(String(advId));
      return getApprovedStoryResourcePath(routePath.slice(2).join("/"));
    });
    expect(routeResources).toEqual([`models/${modelId}.json`, `assets/${hash}.moc3`]);
    expect(getApprovedStoryResourcePath(`models/${modelId}.json`)).toBe(`models/${modelId}.json`);
  });
});
