import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import {
  COSTUME_TOKENS,
  getLive2DModelManifestUrl,
  getLive2DModelsIndexUrl,
  getLive2DViewerHref,
  parseLive2DModel,
  parseLive2DViewerSearch,
} from "../src/lib/live2d/models";
import { IDENTITY_VIEW, MAX_ZOOM, clampView, toNdc, zoomAbout } from "../src/lib/live2d/view";
import { enUS } from "../src/i18n/messages/en-US";

const model = (id: string, group: string, character?: number) =>
  parseLive2DModel({ id, manifest: `models/${id}.json`, group, ...(character === undefined ? {} : { character }), bytes: 1024 });

describe("Live2D model site addresses", () => {
  test("the index and manifests live next to the charts", () => {
    expect(getLive2DModelsIndexUrl()).toBe(`${assetConfig.chartSite}/models.json`);
    expect(getLive2DModelManifestUrl("adv_live2d_rana_003_casual_spring_01")).toBe(`${assetConfig.chartSite}/models/adv_live2d_rana_003_casual_spring_01.json`);
  });

  test("the viewer link carries the model and is localized", () => {
    expect(getLive2DViewerHref("zh-CN")).toBe("/tools/live2d");
    expect(getLive2DViewerHref("en-US", "live2d_tomori_001_live_01")).toBe("/en/tools/live2d?model=live2d_tomori_001_live_01");
    expect(parseLive2DViewerSearch("?model=live2d_tomori_001_live_01")).toBe("live2d_tomori_001_live_01");
    expect(parseLive2DViewerSearch("?model=../evil")).toBeNull();
    expect(parseLive2DViewerSearch("")).toBeNull();
  });
});

describe("Live2D models", () => {
  test("a numbered group names the character, even without the master data's mapping", () => {
    const rana = model("adv_live2d_rana_003_school_winter_hs_1st_glasses", "003_adv");
    expect(rana).toMatchObject({ characterId: 3, kind: "story", sideName: null, lowQuality: false });
    expect(rana.costume).toEqual([{ token: "school" }, { token: "winter" }, { token: "hs" }, { token: "grade1" }, { token: "glasses" }]);
    expect(model("adv_live2d_anon_002_casual_spring_01", "002_adv", 2).costume).toEqual([{ token: "casual" }, { token: "spring" }]);
  });

  test("live models and their low quality copies", () => {
    expect(model("live2d_tomori_001_live_01", "001_live")).toMatchObject({ characterId: 1, kind: "live", costume: [{ token: "live" }], lowQuality: false });
    expect(model("live2d_tomori_001_live_01_low", "001_live")).toMatchObject({ kind: "live", costume: [{ token: "live" }], lowQuality: true });
  });

  test("side characters keep their name; unknown words stay as the id spells them", () => {
    const secretary = model("adv_live2d_sub_raikas_fathers_secretary_suits_01_still", "sub_raikas_fathers_secretary");
    expect(secretary).toMatchObject({ characterId: null, kind: "side", sideName: "raikas_fathers_secretary" });
    expect(secretary.costume).toEqual([{ token: "suits" }, { token: "still" }]);
    expect(model("adv_live2d_arale_011_casual_spring_01_hairdown_nose_glasses", "011_adv").costume)
      .toEqual([{ token: "casual" }, { token: "spring" }, { token: "hairdown" }, { token: "noseGlasses" }]);
    expect(model("adv_live2d_sub_marukun_casual_spring_02_unknownword", "sub_marukun").costume)
      .toEqual([{ token: "casual" }, { token: "spring" }, { text: "02" }, { text: "unknownword" }]);
  });

  test("every costume word has copy", () => {
    const copy = (enUS as unknown as { live2d: { costume: Record<string, string> } }).live2d.costume;
    for (const token of COSTUME_TOKENS) expect(copy[token]?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("Live2D stage view", () => {
  test("zooming keeps the point under the cursor in place", () => {
    const view = zoomAbout(IDENTITY_VIEW, 2, 0.5, -0.25);
    expect(view.zoom).toBe(2);
    // the model point that was at (0.5, -0.25) is still there: zoom * q + offset
    expect(view.zoom * 0.5 + view.x).toBeCloseTo(0.5);
    expect(view.zoom * -0.25 + view.y).toBeCloseTo(-0.25);
    expect(zoomAbout(view, 0.5, 0.5, -0.25)).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  test("zoom and offset stay in range", () => {
    expect(zoomAbout(IDENTITY_VIEW, 100, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAbout(IDENTITY_VIEW, 0.1, 0, 0)).toEqual(IDENTITY_VIEW);
    expect(clampView({ zoom: 1, x: 0.4, y: -0.4 })).toEqual(IDENTITY_VIEW);
    const far = clampView({ zoom: 2, x: 10, y: -10 });
    expect(far.x).toBeLessThan(2);
    expect(far.y).toBeGreaterThan(-2);
  });

  test("stage pixels map to device coordinates with y up", () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 } as DOMRect;
    expect(toNdc(100, 50, rect)).toEqual([-1, 1]);
    expect(toNdc(300, 150, rect)).toEqual([1, -1]);
    expect(toNdc(200, 100, rect)).toEqual([0, 0]);
  });
});
