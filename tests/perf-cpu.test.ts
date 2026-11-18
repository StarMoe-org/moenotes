import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { GET as getSitemapShardRoute } from "../src/app/sitemaps/[locale]/route";
import CommandPalette from "../src/components/shell/CommandPalette";
import { assetConfig } from "../src/config/assets";
import { withSyntheticMasterData } from "../scripts/synthetic-masterdata";
import { setBuildFetchTransportForTests } from "../src/lib/build/fetch";
import { normalizeSkill, type RawSkillCondition, type RawSkillConditionSet, type RawSkillCumulativeCondition, type RawSkillDefinition, type RawSkillEffect, type RawSkillIcon, type RawSkillTarget } from "../src/lib/cards/skills";
import type { RawBand, RawCharacter, RawText } from "../src/lib/cards/data";
import { getBuildReleasedCharacterIds, getBuildReleasedCharacterServers } from "../src/lib/characters/release";
import { LIVE2D_BUNDLE_MAX_ENTRIES, getGatedLive2DBundle, resetLive2DSiteAccessCachesForTests } from "../src/lib/live2d/site-access";
import { state as buildCoreState } from "../src/lib/masterdata/build-core";
import { resetMasterDataSnapshotForTests } from "../src/lib/masterdata/build-snapshot";
import { getDetailBreadcrumb } from "../src/lib/route/static-paths";
import { getSitemapEntries, getSitemapShardEntries } from "../src/lib/seo/sitemap";
import { mergeServerLists } from "../src/lib/servers/facets";
import { normalizeSkillDictionary } from "../src/lib/skills/dictionary";
import { STORY_BUNDLE_MAX_ENTRIES, getGatedStoryBundle, getReleasedStorySiteIndex, resetStorySiteAccessCachesForTests } from "../src/lib/story/site-access";
import { normalizeSupportSkill } from "../src/lib/support-cards/skills";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  resetStorySiteAccessCachesForTests();
  resetLive2DSiteAccessCachesForTests();
  resetMasterDataSnapshotForTests();
  buildCoreState.tables.clear();
  buildCoreState.selectors.clear();
});

async function withCustomMasterData<T>(
  options: {
    server?: "tw" | "jp";
    tables: Record<string, unknown[]>;
    onExternalRequest?: (url: string) => Response | Promise<Response>;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const prevDir = process.env.MOENOTES_MASTERDATA_DIR;
  const prevServers = process.env.MOENOTES_SERVERS;
  const prevCacheDir = process.env.MOENOTES_MASTERDATA_CACHE_DIR;
  const server = options.server ?? "tw";

  delete process.env.MOENOTES_MASTERDATA_DIR;
  delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
  process.env.MOENOTES_SERVERS = server;

  setBuildFetchTransportForTests(async (input) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const parsed = new URL(rawUrl);
    if (parsed.pathname.endsWith("/current_version.json")) {
      return Response.json({
        regions: server === "jp"
          ? { jp: { version: "custom-jp-v1" } }
          : { "hk-tw-mo": { version: "custom-tw-v1" } },
      });
    }
    if (parsed.pathname.endsWith("/index.json")) {
      return Response.json({ regions: {} });
    }
    if (rawUrl.startsWith(assetConfig.storySite) || rawUrl.startsWith(assetConfig.storySiteJp) || rawUrl.startsWith(assetConfig.chartSite)) {
      if (options.onExternalRequest) return options.onExternalRequest(rawUrl);
      return new Response("not found", { status: 404 });
    }
    const file = parsed.pathname.split("/").pop() ?? "";
    return Response.json({ _allData: options.tables[file] ?? [] });
  });

  resetMasterDataSnapshotForTests();
  buildCoreState.tables.clear();
  buildCoreState.selectors.clear();

  try {
    return await fn();
  } finally {
    setBuildFetchTransportForTests(undefined);
    resetMasterDataSnapshotForTests();
    buildCoreState.tables.clear();
    buildCoreState.selectors.clear();
    if (prevDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
    else process.env.MOENOTES_MASTERDATA_DIR = prevDir;
    if (prevServers === undefined) delete process.env.MOENOTES_SERVERS;
    else process.env.MOENOTES_SERVERS = prevServers;
    if (prevCacheDir === undefined) delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
    else process.env.MOENOTES_MASTERDATA_CACHE_DIR = prevCacheDir;
  }
}

describe("skill normalization pre-indexing", () => {
  test("normalizeSkillDictionary matches single-skill normalization across all 5 families", () => {
    const characters: RawCharacter[] = [
      { id: 10, bandID: 5, displayOrder: 1, nameTextID: "char.10", enDisplayNameTextId: "", mainColorCode: "#fff" },
    ];
    const bands: RawBand[] = [{ id: 5, nameTextID: "band.5", mainColorCode: "#fff" }];
    const texts: RawText[] = [
      { id: "char.10", english: "Tomori" },
      { id: "band.5", english: "MyGO!!!!!" },
      { id: "live.name", english: "Live Skill" },
      { id: "live.desc", english: "If {effects[0].con[0][0].targets[0].name}, +{effects[0].value/100:F1}% for {effects[0].time:F1}s" },
      { id: "leader.name", english: "Leader Skill" },
      { id: "leader.desc", english: "{effects[0].targets[0].name} +{effects[0].value/100:F0}%" },
      { id: "gekisou.name", english: "Gekisou Skill" },
      { id: "gekisou.desc", english: "Max {effects[0].cCon.maxCount}: +{effects[0].value}" },
      { id: "support.name", english: "Support Skill" },
      { id: "support.desc", english: "Support +{effects[0].value/100:F0}%" },
      { id: "gsupport.name", english: "Gekisou Support" },
      { id: "gsupport.desc", english: "Gekisou Support +{effects[0].value}" },
    ];
    const icons: RawSkillIcon[] = [{ id: 1, normalIconAssetName: "icon_1" }];
    const conditionSets: RawSkillConditionSet[] = [{ id: 1, group: 10, conditionIds: [100] }];
    const conditions: RawSkillCondition[] = [{ id: 100, conditionValues: [1], conditionTargetIDs: [2] }];
    const cumulativeConditions: RawSkillCumulativeCondition[] = [{ id: 30, conditionValues: [5], maxCumulativeCount: 3 }];
    const skillTargets: RawSkillTarget[] = [
      { id: 1, characterID: 10, bandID: 0 },
      { id: 2, characterID: 0, bandID: 5 },
    ];

    const liveSkills: RawSkillDefinition[] = [{ id: 1, nameTextID: "live.name", descriptionTextFormatID: "live.desc", skillIconID: 1 }];
    const liveEffects: RawSkillEffect[] = [
      { id: 1, liveSkillID: 1, level: 1, activationTimeSecond: 5, effectValue: 1050, skillEffectType: 1, skillConditionGroup: 10 },
      { id: 2, liveSkillID: 1, level: 2, activationTimeSecond: 6, effectValue: 1250, skillEffectType: 1, skillConditionGroup: 10 },
    ];
    const leaderSkills: RawSkillDefinition[] = [{ id: 2, nameTextID: "leader.name", descriptionTextFormatID: "leader.desc", skillIconID: 1 }];
    const leaderEffects: RawSkillEffect[] = [
      { id: 3, leaderSkillID: 2, level: 1, effectValue: 3000, skillEffectType: 2, skillTargetIDs: [1] },
    ];
    const gekisouSkills: RawSkillDefinition[] = [{ id: 3, nameTextID: "gekisou.name", descriptionTextFormatID: "gekisou.desc", skillIconID: 1 }];
    const gekisouEffects: RawSkillEffect[] = [
      { id: 4, gekisouSkillID: 3, level: 1, effectValue: 500, skillEffectType: 3, skillCumulativeConditionID: 30 },
    ];
    const supportSkills: RawSkillDefinition[] = [{ id: 4, nameTextID: "support.name", descriptionTextFormatID: "support.desc", skillIconID: 1 }];
    const supportEffects: RawSkillEffect[] = [
      { id: 5, supportSkillID: 4, level: 1, effectValue: 2000, skillEffectType: 4 },
    ];
    const gekisouSupportSkills: RawSkillDefinition[] = [{ id: 5, nameTextID: "gsupport.name", descriptionTextFormatID: "gsupport.desc", skillIconID: 1 }];
    const gekisouSupportEffects: RawSkillEffect[] = [
      { id: 6, gekisouSupportSkillID: 5, level: 1, effectValue: 90, skillEffectType: 5 },
    ];

    const dict = normalizeSkillDictionary({
      leaderSkills,
      leaderEffects,
      liveSkills,
      liveEffects,
      gekisouSkills,
      gekisouEffects,
      supportSkills,
      supportEffects,
      gekisouSupportSkills,
      gekisouSupportEffects,
      icons,
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      skillResources: [],
      memberResourceRows: [],
      characters,
      bands,
      texts,
      memberCards: [],
      supportCards: [],
      resolveItemCost: (id, count) => ({ id: String(id), name: String(id), imageUrl: "", count }),
      locale: "en-US",
    });

    const charMap = new Map(characters.map((c) => [c.id, c]));
    const bandMap = new Map(bands.map((b) => [b.id, b]));
    const expectedLive = normalizeSkill("live", 1, liveSkills, liveEffects, icons, texts, "en-US", conditionSets, conditions, cumulativeConditions, skillTargets, charMap, bandMap)!;
    const expectedLeader = normalizeSkill("leader", 2, leaderSkills, leaderEffects, icons, texts, "en-US", conditionSets, conditions, cumulativeConditions, skillTargets, charMap, bandMap)!;
    const expectedGekisou = normalizeSkill("gekisou", 3, gekisouSkills, gekisouEffects, icons, texts, "en-US", conditionSets, conditions, cumulativeConditions, skillTargets, charMap, bandMap)!;
    const expectedSupport = normalizeSupportSkill("support", 4, supportSkills, supportEffects, icons, texts, "en-US", conditionSets, conditions, cumulativeConditions, charMap, bandMap, skillTargets)!;
    const expectedGSupport = normalizeSupportSkill("gekisou-support", 5, gekisouSupportSkills, gekisouSupportEffects, icons, texts, "en-US", conditionSets, conditions, cumulativeConditions, charMap, bandMap, skillTargets)!;

    const byKey = new Map(dict.entries.map((entry) => [entry.key, entry]));
    expect(byKey.get("live:1")?.levels).toEqual(expectedLive.levels.map((l) => ({ level: l.level, description: l.description })));
    expect(byKey.get("leader:2")?.levels).toEqual(expectedLeader.levels.map((l) => ({ level: l.level, description: l.description })));
    expect(byKey.get("gekisou:3")?.levels).toEqual(expectedGekisou.levels.map((l) => ({ level: l.level, description: l.description })));
    expect(byKey.get("support:4")?.levels).toEqual(expectedSupport.levels.map((l) => ({ level: l.level, description: l.description })));
    expect(byKey.get("gekisouSupport:5")?.levels).toEqual(expectedGSupport.levels.map((l) => ({ level: l.level, description: l.description })));
  });

  test("normalizeSkillDictionary handles thousands of skills and texts in linear time", () => {
    const skillCount = 1500;
    const texts: RawText[] = Array.from({ length: 8000 }, (_, i) => ({
      id: `text.${i}`,
      english: i < skillCount ? `Skill ${i}` : `Desc {effects[0].value/100:F1}%`,
    }));
    const liveSkills: RawSkillDefinition[] = Array.from({ length: skillCount }, (_, i) => ({
      id: i + 1,
      nameTextID: `text.${i}`,
      descriptionTextFormatID: `text.${skillCount + i}`,
      skillIconID: (i % 10) + 1,
    }));
    const liveEffects: RawSkillEffect[] = Array.from({ length: skillCount * 2 }, (_, i) => ({
      id: i + 1,
      liveSkillID: Math.floor(i / 2) + 1,
      level: (i % 2) + 1,
      effectValue: 1000 + i,
      skillEffectType: 1,
    }));
    const icons: RawSkillIcon[] = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      normalIconAssetName: `icon_${i + 1}`,
    }));

    const start = performance.now();
    const dict = normalizeSkillDictionary({
      leaderSkills: [],
      leaderEffects: [],
      liveSkills,
      liveEffects,
      gekisouSkills: [],
      gekisouEffects: [],
      supportSkills: [],
      supportEffects: [],
      gekisouSupportSkills: [],
      gekisouSupportEffects: [],
      icons,
      conditionSets: [],
      conditions: [],
      cumulativeConditions: [],
      skillTargets: [],
      skillResources: [],
      memberResourceRows: [],
      characters: [],
      bands: [],
      texts,
      memberCards: [],
      supportCards: [],
      resolveItemCost: (id, count) => ({ id: String(id), name: String(id), imageUrl: "", count }),
      locale: "en-US",
    });
    const elapsedMs = performance.now() - start;

    expect(dict.entries).toHaveLength(skillCount);
    expect(elapsedMs).toBeLessThan(2000);
  });
});

describe("mergeServerLists and changedFields", () => {
  test("preserves exact interleaving order, duplicate keys, and structural field diffs", () => {
    interface Row {
      id: number;
      title: string;
      tags: number[];
      meta: { a: number; b?: string };
      onlyInBase?: number;
    }
    const merged = mergeServerLists<Row>(
      [
        ["tw", [
          { id: 1, title: "A", tags: [1, 2], meta: { a: 1 }, onlyInBase: 9 },
          { id: 1, title: "A-dup", tags: [1], meta: { a: 2 } },
          { id: 3, title: "C", tags: [3], meta: { a: 3 } },
        ]],
        ["jp", [
          { id: 0, title: "Before", tags: [], meta: { a: 0 } },
          { id: 1, title: "A", tags: [1, 2], meta: { a: 1 } },
          { id: 2, title: "Middle", tags: [2], meta: { a: 2 } },
          { id: 3, title: "C-jp", tags: [3, 4], meta: { a: 3 } },
          { id: 4, title: "After", tags: [4], meta: { a: 4 } },
        ]],
      ],
      (row) => row.id,
    );

    expect(merged.map((row) => [row.id, row.title, row.servers])).toEqual([
      [0, "Before", ["jp"]],
      [1, "A", ["tw", "jp"]],
      [2, "Middle", ["jp"]],
      [1, "A-dup", ["tw"]],
      [3, "C", ["tw", "jp"]],
      [4, "After", ["jp"]],
    ]);
    // Entry 1 has identical tags & meta and `onlyInBase` is omitted on jp, so no variant is recorded.
    expect(merged[1]!.serverVariants).toBeUndefined();
    expect(merged[4]!.serverVariants).toEqual({
      jp: { title: "C-jp", tags: [3, 4] },
    });
  });

  test("handles 5000 items across 4 servers in linear time", () => {
    const n = 5000;
    const makeList = (offset: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: i + offset,
        title: `Item ${i + offset}`,
        tags: [1, 2, 3],
        startAt: "2026/01/01 12:00:00",
      }));
    const start = performance.now();
    const merged = mergeServerLists(
      [
        ["tw", makeList(0)],
        ["jp", makeList(250)],
        ["kr", makeList(500)],
        ["en", makeList(750)],
      ],
      (item) => item.id,
    );
    const elapsedMs = performance.now() - start;
    expect(merged).toHaveLength(5750);
    expect(elapsedMs).toBeLessThan(1000);
  });
});

describe("story-detail breadcrumb deduplication", () => {
  test("keeps the first released story occurrence for duplicate advIds", async () => {
    await withCustomMasterData(
      {
        server: "tw",
        tables: {
          "MasterText.json": [
            { id: "ch.1", english: "Chapter 1" },
            { id: "story.first", english: "First Title" },
            { id: "story.second", english: "Second Title" },
          ],
          "MasterStoryChapter.json": [
            { id: 1, bandId: 1, nameTextId: "ch.1", startAt: "2020/01/01 00:00:00" },
          ],
          "MasterAdv.json": [
            { id: 501, titleTextId: "story.first" },
          ],
          "MasterStoryEpisode.json": [
            { id: 1, advId: 501, chapterId: 1, episodeNumber: 1, startAt: "2020/01/01 00:00:00" },
            { id: 2, advId: 501, chapterId: 1, episodeNumber: 2, startAt: "2020/01/01 00:00:00" },
          ],
        },
      },
      async () => {
        const detail = await getDetailBreadcrumb("story-detail", "501", "en-US");
        expect(detail?.label).toBe("First Title");
      },
    );
  });
});

describe("story and Live2D site-access caches", () => {
  test("getReleasedStorySiteIndex deduplicates concurrent fetches and caches for 15s TTL", async () => {
    let nowMs = 1_700_000_000_000;
    const nowSpy = spyOn(Date, "now").mockImplementation(() => nowMs);
    cleanups.push(() => nowSpy.mockRestore());

    let fetchCount = 0;
    await withCustomMasterData(
      {
        server: "jp",
        tables: {
          "MasterStoryChapter.json": [
            { id: 1, bandId: 1, nameTextId: "ch.1", startAt: "2020/01/01 00:00:00" },
          ],
          "MasterAdv.json": [{ id: 101, titleTextId: "ep.101" }],
          "MasterStoryEpisode.json": [
            { id: 1, advId: 101, chapterId: 1, episodeNumber: 1, startAt: "2020/01/01 00:00:00" },
          ],
        },
        onExternalRequest: (url) => {
          if (url === `${assetConfig.storySiteJp}/stories.json`) {
            fetchCount += 1;
            return Response.json({
              format: "ournotes.stories/1",
              stories: [
                { advId: 101, manifest: "stories/101.json", languages: ["ja"], language: "ja", titles: { ja: "Ep 101" } },
              ],
            });
          }
          return new Response("not found", { status: 404 });
        },
      },
      async () => {
        const [a, b] = await Promise.all([
          getReleasedStorySiteIndex("jp", nowMs),
          getReleasedStorySiteIndex("jp", nowMs),
        ]);
        expect(fetchCount).toBe(1);
        expect(a.stories).toHaveLength(1);
        expect(b.stories).toHaveLength(1);

        // Within 15s TTL, reuse cached upstream index.
        nowMs += 10_000;
        await getReleasedStorySiteIndex("jp", nowMs);
        expect(fetchCount).toBe(1);

        // After 15s TTL, re-fetch upstream index.
        nowMs += 10_000;
        await getReleasedStorySiteIndex("jp", nowMs);
        expect(fetchCount).toBe(2);
      },
    );
  });

  test("storyBundleCache enforces max-size LRU and sweeps expired entries on write", async () => {
    const total = STORY_BUNDLE_MAX_ENTRIES + 5;
    let nowMs = 1_800_000_000_000;
    const nowSpy = spyOn(Date, "now").mockImplementation(() => nowMs);
    cleanups.push(() => nowSpy.mockRestore());

    const manifestFetches: number[] = [];
    await withCustomMasterData(
      {
        server: "jp",
        tables: {
          "MasterStoryChapter.json": [
            { id: 1, bandId: 1, nameTextId: "ch.1", startAt: "2020/01/01 00:00:00" },
          ],
          "MasterAdv.json": Array.from({ length: total }, (_, i) => ({
            id: i + 1,
            titleTextId: `ep.${i + 1}`,
          })),
          "MasterStoryEpisode.json": Array.from({ length: total }, (_, i) => ({
            id: i + 1,
            advId: i + 1,
            chapterId: 1,
            episodeNumber: i + 1,
            startAt: "2020/01/01 00:00:00",
          })),
        },
        onExternalRequest: (url) => {
          if (url === `${assetConfig.storySiteJp}/stories.json`) {
            return Response.json({
              format: "ournotes.stories/1",
              stories: Array.from({ length: total }, (_, i) => ({
                advId: i + 1,
                manifest: `stories/${i + 1}.json`,
                languages: ["ja"],
                language: "ja",
              })),
            });
          }
          const match = url.match(/\/stories\/(\d+)\.json$/);
          if (match) {
            const advId = Number(match[1]);
            manifestFetches.push(advId);
            return Response.json({
              format: "ournotes.story-manifest/2",
              advId,
              language: "ja",
              files: {},
            });
          }
          return new Response("not found", { status: 404 });
        },
      },
      async () => {
        for (let id = 1; id <= STORY_BUNDLE_MAX_ENTRIES; id += 1) {
          expect(await getGatedStoryBundle("jp", id)).not.toBeNull();
        }
        // Touch id=1 so id=2 becomes the least recently used entry.
        await getGatedStoryBundle("jp", 1);
        expect(manifestFetches.filter((id) => id === 1)).toHaveLength(1);

        // Overflow by 1: id=2 must be evicted while id=1 remains cached.
        await getGatedStoryBundle("jp", STORY_BUNDLE_MAX_ENTRIES + 1);
        await getGatedStoryBundle("jp", 1);
        expect(manifestFetches.filter((id) => id === 1)).toHaveLength(1);
        await getGatedStoryBundle("jp", 2);
        expect(manifestFetches.filter((id) => id === 2)).toHaveLength(2);

        // Advance clock by 20s and insert id=3 (expires at +50s), then advance 15s so entries from +0s expire while id=3 stays alive.
        nowMs += 20_000;
        await getGatedStoryBundle("jp", 3);
        const beforeSweepFetches = manifestFetches.filter((id) => id === 3).length;
        nowMs += 15_000;
        await getGatedStoryBundle("jp", STORY_BUNDLE_MAX_ENTRIES + 2);
        // Live entry id=3 must NOT be evicted because expired entries were swept first.
        await getGatedStoryBundle("jp", 3);
        expect(manifestFetches.filter((id) => id === 3)).toHaveLength(beforeSweepFetches);
      },
    );
  });

  test("bundleCache in live2d/site-access enforces max-size LRU", async () => {
    const total = LIVE2D_BUNDLE_MAX_ENTRIES + 4;
    const manifestFetches: string[] = [];
    await withCustomMasterData(
      {
        server: "jp",
        tables: {
          "MasterCharacterCostume.json": [
            { _id: 1, _characterID: 1, _groupID: 1, _costumeType: 2, _costumeId: 1, _isDefault: true, _live2dPath: "001_live/model_1" },
          ],
          "MasterCharacterCostumeGroup.json": [
            { _id: 1, _characterID: 1, _costumeNameTextId: "", _iconPath: "", _isInitial: true, _isChangeable: false, _specialConditionMemberCardId: 0, _startAt: "" },
          ],
        },
        onExternalRequest: (url) => {
          if (url === `${assetConfig.chartSite}/models.json`) {
            return Response.json({
              models: Array.from({ length: total }, (_, i) => ({
                id: `story_model_${i + 1}`,
                manifest: `models/story_model_${i + 1}.json`,
              })),
            });
          }
          const match = url.match(/\/models\/(story_model_\d+)\.json$/);
          if (match) {
            const modelId = match[1]!;
            manifestFetches.push(modelId);
            return Response.json({ format: 3, id: modelId, files: {} });
          }
          return new Response("not found", { status: 404 });
        },
      },
      async () => {
        for (let i = 1; i <= LIVE2D_BUNDLE_MAX_ENTRIES; i += 1) {
          expect(await getGatedLive2DBundle("jp", "chart", `story_model_${i}`)).not.toBeNull();
        }
        // Touch model_1 so model_2 is LRU.
        await getGatedLive2DBundle("jp", "chart", "story_model_1");
        expect(manifestFetches.filter((id) => id === "story_model_1")).toHaveLength(1);

        // Overflow by 1: model_2 should be evicted, model_1 should stay cached.
        await getGatedLive2DBundle("jp", "chart", `story_model_${LIVE2D_BUNDLE_MAX_ENTRIES + 1}`);
        await getGatedLive2DBundle("jp", "chart", "story_model_1");
        expect(manifestFetches.filter((id) => id === "story_model_1")).toHaveLength(1);
        await getGatedLive2DBundle("jp", "chart", "story_model_2");
        expect(manifestFetches.filter((id) => id === "story_model_2")).toHaveLength(2);
      },
    );
  });
});

describe("CommandPalette hydration", () => {
  test("does not fetch search-index.json when rendered closed", () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    cleanups.push(() => fetchSpy.mockRestore());

    const html = renderToString(createElement(CommandPalette, { locale: "en-US" }));
    expect(html).not.toContain('role="dialog"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sitemap shard computation", () => {
  test("getSitemapShardEntries matches filtered getSitemapEntries including all alternates", async () => {
    await withSyntheticMasterData(async () => {
      const locales = ["zh-CN", "ja-JP", "en-US"] as const;
      const full = await getSitemapEntries(locales);
      for (const locale of locales) {
        const shard = await getSitemapShardEntries(locale, locales);
        const expected = full.filter((entry) => entry.locale === locale);
        expect(shard).toEqual(expected);
      }
      expect(await getSitemapShardEntries("ko-KR", locales)).toEqual([]);
    });
  });

  test("GET /sitemaps/[locale] serves valid XML for the requested locale shard", async () => {
    await withSyntheticMasterData(async () => {
      const response = await getSitemapShardRoute(
        new NextRequest("https://bdon.moe/sitemaps/en-US.xml"),
        { params: Promise.resolve({ locale: "en-US.xml" }) },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("application/xml");
      const xml = await response.text();
      expect(xml).toContain("<loc>https://bdon.moe/en/</loc>");
      expect(xml).toContain('hreflang="ja-JP"');
      expect(xml).toContain('hreflang="x-default"');
    });
  });
});

describe("character release schedule memoization", () => {
  test("evaluates released character ids accurately across timestamps using the shared epoch schedule", async () => {
    await withCustomMasterData(
      {
        server: "tw",
        tables: {
          "MasterCharacter.json": [1, 2, 3, 4, 5].map((id) => ({
            id,
            bandID: 1,
            displayOrder: id,
            nameTextID: `char.${id}`,
            enDisplayNameTextId: "",
            mainColorCode: "#fff",
          })),
          "MasterMemberCard.json": [
            {
              id: 1,
              assetID: 1,
              characterID: 1,
              rarity: 4,
              cardType: 1,
              nameTextID: "",
              subtitleTextID: "",
              performancePowerMax: 1,
              technicPowerMax: 1,
              visualPowerMax: 1,
              liveSkillID: 0,
              leaderSkillID: 0,
              gekisouSkillID: 0,
              startAt: "2026/01/01 00:00:00",
            },
            {
              id: 2,
              assetID: 2,
              characterID: 2,
              rarity: 4,
              cardType: 1,
              nameTextID: "",
              subtitleTextID: "",
              performancePowerMax: 1,
              technicPowerMax: 1,
              visualPowerMax: 1,
              liveSkillID: 0,
              leaderSkillID: 0,
              gekisouSkillID: 0,
              startAt: "2026/06/01 00:00:00",
            },
          ],
          "MasterSupportCard.json": [
            {
              id: 10,
              assetID: 10,
              characterIDs: [3],
              rarity: 4,
              cardType: 1,
              nameTextID: "",
              descriptionTextID: "",
              diaryTextID: "",
              performancePowerMax: 1,
              technicPowerMax: 1,
              visualPowerMax: 1,
              startAt: "2026/03/01 00:00:00",
            },
          ],
          "MasterAdv.json": [{ id: 20, titleTextId: "adv.20" }],
          "MasterStoryLiveResultEpisode.json": [
            { id: 20, advId: 20, characterIds: [4, 5], unlockCharacterFriendshipLevel: 1 },
          ],
        },
      },
      async () => {
        const feb = Date.UTC(2026, 1, 1);
        const apr = Date.UTC(2026, 3, 1);
        const jul = Date.UTC(2026, 6, 1);

        expect([...await getBuildReleasedCharacterIds("en-US", feb)].sort((a, b) => a - b)).toEqual([1, 4, 5]);
        expect([...await getBuildReleasedCharacterIds("ja-JP", apr)].sort((a, b) => a - b)).toEqual([1, 3, 4, 5]);
        expect([...await getBuildReleasedCharacterIds("ko-KR", jul)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        expect((await getBuildReleasedCharacterServers("en-US", feb)).get(1)).toEqual(["tw"]);
      },
    );
  });
});
