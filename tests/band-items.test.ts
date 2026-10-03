import { describe, expect, test } from "bun:test";
import { describeBandItemEffect, formatBandItemEffectPercent, getBandItemIconUrl } from "../src/lib/band-items/assets";
import { groupSkillLevelResources, resolveBandItemUpgradeSteps, type BandItemUpgradesPayload } from "../src/lib/band-items/data";

describe("band item effects", () => {
  test("effect values are hundredths of a percent", () => {
    expect(formatBandItemEffectPercent(10, "en-US")).toBe("0.1");
    expect(formatBandItemEffectPercent(250, "en-US")).toBe("2.5");
    expect(formatBandItemEffectPercent(500, "en-US")).toBe("5");
  });

  test("the masterdata template gets the percentage, not the raw value", () => {
    const template = "All MyGO!!!!! parameters <style=color_positive>+{0}%Up</style>";
    expect(describeBandItemEffect(template, 10, "en-US")).toBe("All MyGO!!!!! parameters +0.1%Up");
    expect(describeBandItemEffect(template, 500, "en-US")).toBe("All MyGO!!!!! parameters +5%Up");
  });
});

describe("band item icon", () => {
  test("icon lives under the band and item id", () => {
    expect(getBandItemIconUrl({ id: 101, bandId: 1 }, "zh-CN")).toEndWith("/zh-Hans/Band/1/BandItem/101/band_item/band_item.webp");
    expect(getBandItemIconUrl({ id: 0, bandId: 1 }, "zh-CN")).toBe("");
  });
});

describe("band item upgrade materials", () => {
  const rows = [
    { id: 3, group: 1000, level: 2, itemID: 3, count: 5000 },
    { id: 1, group: 1000, level: 1, itemID: 28, count: 30 },
    { id: 2, group: 1000, level: 1, itemID: 3, count: 2500 },
    { id: 4, group: 1001, level: 1, itemID: 3, count: 9 },
  ];

  test("rows group by resource group, levels ascending, materials by item id", () => {
    expect(groupSkillLevelResources(rows)).toEqual({
      "1000": [[1, [[3, 2500], [28, 30]]], [2, [[3, 5000]]]],
      "1001": [[1, [[3, 9]]]],
    });
  });

  test("steps resolve for a server with localized material names", () => {
    const payload: BandItemUpgradesPayload = {
      items: { "3": { name: { simplifiedChinese: "金币", english: "Coin" }, imagePath: "Item/common/item_icon_coin" } },
      groupSets: [groupSkillLevelResources(rows)],
      servers: { tw: 0 },
    };
    const steps = resolveBandItemUpgradeSteps(payload, "tw", 1000, "en-US");
    expect(steps.map((step) => step.level)).toEqual([1, 2]);
    expect(steps[0]!.costs[0]).toEqual({ itemId: 3, itemName: "Coin", itemImagePath: "Item/common/item_icon_coin", count: 2500 });
    expect(steps[0]!.costs[1]!.itemName).toBe("#28");
    expect(resolveBandItemUpgradeSteps(payload, "jp", 1000, "en-US")).toEqual([]);
  });
});
