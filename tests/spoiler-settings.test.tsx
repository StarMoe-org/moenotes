import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "../src/components/md3/Md3Provider";
import { ContentSettings } from "../src/components/shell/SettingsDrawer";
import SpoilerNotice from "../src/components/shared/SpoilerNotice";
import { t } from "../src/i18n";
import { buildThemeBootstrapScript } from "../src/lib/settings/apply-theme";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;

describe("public spoiler controls", () => {
  test("the early theme bootstrap no longer recognizes a spoiler-override URL", () => {
    const script = buildThemeBootstrapScript().toLowerCase();
    expect(script).not.toContain("spoiler=allow");
    expect(script).not.toContain("moenotes:show-spoiler");
  });

  test("does not render a spoiler switch in ContentSettings across the five core locales", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <ContentSettings locale={locale} />
        </Md3Provider>,
      );
      expect(html).not.toContain(t(locale, "settings.spoiler.title"));
      expect(html).not.toContain(t(locale, "settings.spoiler.showLabel"));
      // Only the Japanese song-title switch remains.
      expect((html.match(/type="checkbox"/g) ?? []).length).toBe(1);
    }
  });

  test("renders the unreleased-content notice across the five core locales", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <SpoilerNotice locale={locale} />
        </Md3Provider>,
      );
      expect(html).not.toContain("settings.spoiler.");
      expect(html).toContain(t(locale, "settings.spoiler.restrictedTitle"));
      expect(html).toContain(t(locale, "settings.spoiler.eulaNotice"));
    }
  });
});
