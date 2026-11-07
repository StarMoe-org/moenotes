import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "../src/components/md3/Md3Provider";
import AccentColorPicker, {
  buildAccentCatalogue,
  findSelectedAccentChoice,
} from "../src/components/shared/AccentColorPicker";
import { AppearanceSettings } from "../src/components/shell/SettingsDrawer";
import { t } from "../src/i18n";
import {
  buildThemeBandColors,
  normalizeThemeHexColor,
} from "../src/lib/masterdata/build-settings";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;

describe("theme band and character color builder", () => {
  test("normalizes hex codes, sorts bands and characters in display order, and excludes non-playable NPCs", () => {
    const bands = [
      { id: 4, name: "millsage", color: "#aa22ee" },
      { id: 1, name: "MyGO!!!!!", color: "3388bb" },
      { id: 99, name: "Invalid", color: "var(--md-sys-color-primary)" },
    ];
    const characters = [
      { id: 1, bandId: 1, displayOrder: 3, isNonPlayable: false, name: "Tomori", mainColor: "#77BBDD" },
      { id: 2, bandId: 1, displayOrder: 1, isNonPlayable: false, name: "Anon", mainColor: "#ff8899" },
      { id: 18, bandId: 4, displayOrder: 1, isNonPlayable: false, name: "Nagi", mainColor: "#5555FF" },
      { id: 1001, bandId: 4, displayOrder: 6, isNonPlayable: true, name: "Kanata", mainColor: "#FFFFFF" },
      { id: 999, bandId: 1, displayOrder: 9, isNonPlayable: false, name: "Broken", mainColor: "not-a-color" },
    ];

    expect(normalizeThemeHexColor("#bb9955")).toBe("#BB9955");
    expect(normalizeThemeHexColor(" 3388bb ")).toBe("#3388BB");
    expect(normalizeThemeHexColor("default")).toBeNull();

    const result = buildThemeBandColors(bands, characters);
    expect(result).toEqual([
      {
        bandId: 1,
        name: "MyGO!!!!!",
        color: "#3388BB",
        characters: [
          { characterId: 2, bandId: 1, name: "Anon", color: "#FF8899" },
          { characterId: 1, bandId: 1, name: "Tomori", color: "#77BBDD" },
        ],
      },
      {
        bandId: 4,
        name: "millsage",
        color: "#AA22EE",
        characters: [
          { characterId: 18, bandId: 4, name: "Nagi", color: "#5555FF" },
        ],
      },
    ]);
  });
});

describe("AccentColorPicker and AppearanceSettings", () => {
  const sampleBands = buildThemeBandColors(
    [
      { id: 1, name: "MyGO!!!!!", color: "#3388BB" },
      { id: 2, name: "Ave Mujica", color: "#881144" },
    ],
    [
      { id: 2, bandId: 1, displayOrder: 1, isNonPlayable: false, name: "Anon", mainColor: "#FF8899" },
      { id: 1, bandId: 1, displayOrder: 3, isNonPlayable: false, name: "Tomori", mainColor: "#77BBDD" },
      { id: 10, bandId: 2, displayOrder: 1, isNonPlayable: false, name: "Sakiko", mainColor: "#7799cc" },
    ],
  );

  test("builds default, band emblem, and character face choices with case-insensitive lookup", () => {
    const catalogue = buildAccentCatalogue({
      defaultLabel: "Default",
      bands: sampleBands,
      resolveAssetUrl: (url) => url,
    });

    expect(catalogue.allChoices.map((choice) => [choice.id, choice.value, choice.displayLabel])).toEqual([
      ["default", "default", "Default"],
      ["band:1", "#3388BB", "MyGO!!!!!"],
      ["character:2", "#FF8899", "Anon"],
      ["character:1", "#77BBDD", "Tomori"],
      ["band:2", "#881144", "Ave Mujica"],
      ["character:10", "#7799CC", "Sakiko"],
    ]);

    expect(findSelectedAccentChoice(catalogue, "#7799cc")?.id).toBe("character:10");
    expect(findSelectedAccentChoice(catalogue, "#3388BB")?.id).toBe("band:1");
    expect(findSelectedAccentChoice(catalogue, "default")?.id).toBe("default");
    expect(catalogue.rows[0]!.band.icon).toContain("band_small_icon_white");
    expect(catalogue.rows[0]!.characters[0]!.icon).toContain("Character/Image/2/character_face_icon");
  });

  test("marks the chosen character swatch as checked and renders band + character rows", () => {
    const catalogue = buildAccentCatalogue({ defaultLabel: "Default", bands: sampleBands });
    const html = renderToStaticMarkup(
      <AccentColorPicker
        label="Theme color"
        catalogue={catalogue}
        value="#77BBDD"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="MyGO!!!!! · Tomori"');
    expect(html).toContain('aria-label="Ave Mujica · Sakiko"');
    const checkedMatches = html.match(/aria-checked="true"/g) ?? [];
    expect(checkedMatches).toHaveLength(1);
    expect(html).toContain('aria-checked="true" aria-label="MyGO!!!!! · Tomori"');
  });

  test("renders AppearanceSettings with band and character swatches across all 5 core locales", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <AppearanceSettings locale={locale} pathname="/" bands={sampleBands} />
        </Md3Provider>,
      );
      expect(html).toContain(t(locale, "settings.accent.title"));
      expect(html).toContain(t(locale, "settings.accent.default"));
      expect(html).toContain("MyGO!!!!! · Anon");
      expect(html).toContain("Ave Mujica · Sakiko");
    }
  });
});
