import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import BrandLogo from "../src/components/shared/BrandLogo";

/** Working-tree line endings differ between checkouts; the assets only need to be the same document. */
const readAsset = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const BRAND_ASSETS = ["moenotes-signature.svg", "moenotes-signature-light.svg"];

describe("brand signature", () => {
  test("both variants travel in the markup, so no page load waits for a revalidated asset", () => {
    const html = renderToString(<BrandLogo className="mn-brand-shell" />);
    // `/assets/` answers no-cache: as a URL the mark revalidates on every navigation and the capsule paints empty.
    expect(html).not.toContain("/assets/brand/");
    const sources = [...html.matchAll(/src="(data:image\/svg\+xml,[^"]*)"/g)].map((match) => match[1]!);
    expect(sources.length).toBe(2);
    const [ink, starlight] = sources.map((source) => decodeURIComponent(source.slice("data:image/svg+xml,".length)));
    expect(ink).toBe(readAsset("../src/assets/brand/moenotes-signature.svg"));
    expect(starlight).toBe(readAsset("../src/assets/brand/moenotes-signature-light.svg"));
  });

  test("the bundled copies match the public brand assets", () => {
    // The public files stay the brand's source of truth (share images, the chart renderer's copy, hotlinks); the
    // src copies exist because Vite cannot import from public/. A logo change updates both, and this keeps them equal.
    for (const name of BRAND_ASSETS) {
      expect(readAsset(`../src/assets/brand/${name}`)).toBe(readAsset(`../public/assets/brand/${name}`));
    }
  });

  test("the accessible name sits on the wrapper, and the decorative images stay hidden", () => {
    const html = renderToString(<BrandLogo />);
    expect(html).toContain('role="img" aria-label="Moenotes"');
    expect(html.match(/alt=""/g)?.length).toBe(2);
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
  });
});
