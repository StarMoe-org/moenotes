import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const { chromium, expect } = await import(process.env.PLAYWRIGHT_MODULE ?? "@playwright/test");
const origin = process.env.CARD_BOX_ORIGIN ?? "http://127.0.0.1:24321";
const out = path.resolve(process.env.NATIVE_CARD_LIFECYCLE_PROOF_DIR ?? "cache/native-card-lifecycle-proof");
const expectRegression = process.env.NATIVE_CARD_EXPECT_BLANK === "1";
const mode = process.env.NATIVE_CARD_LIFECYCLE_MODE ?? "square";
if (mode !== "square" && mode !== "formation") throw new Error("Unknown lifecycle fixture mode");
const server = process.env.NATIVE_CARD_LIFECYCLE_SERVER ?? "jp";
if (!["jp", "tw", "kr", "en"].includes(server)) throw new Error("Unknown lifecycle fixture server");
const pagePath = process.env.NATIVE_CARD_PAGE_PATH ?? "/en/account/box";
const formationControl = process.env.NATIVE_CARD_EX_FORMATION === "1";
await mkdir(out, { recursive: true });
const source = await readFile("src/components/shared/NativeGameCard.tsx");
const playerSource = await readFile("node_modules/ournotes-player/src/ui/player.js");
const rendererSource = await readFile("node_modules/ournotes-player/src/ui/renderer.js");
const librarySource = await readFile("src/lib/game-ui/source.ts");
const formationProducer = await readFile("src/components/chart-data/NativeFormationGroup.tsx");
let baselineUrl = null, baselinePath = null, baselineSha256 = null;
if (expectRegression) {
  if (!process.env.NATIVE_CARD_BASELINE_SOURCE) throw new Error("Baseline mode requires NATIVE_CARD_BASELINE_SOURCE");
  const baselineSource = await readFile(process.env.NATIVE_CARD_BASELINE_SOURCE);
  baselineSha256 = createHash("sha256").update(baselineSource).digest("hex");
  baselineUrl = `/tests/.native-card-lifecycle-baseline-${Date.now()}.tsx`;
  baselinePath = path.resolve(`.${baselineUrl}`);
  await writeFile(baselinePath, baselineSource, { flag: "wx" });
  await writeFile(path.join(out, "NativeGameCard-baseline.tsx"), baselineSource);
}
const report = { format: "moenotes.native-card-lifecycle-browser-proof/2", origin, pagePath, server, mode, formationControl, at: new Date().toISOString(),
  scope: `Local Chromium rendering ${server.toUpperCase()} cards through UIPlayer. Prefab and Sprite files are checked against the UI library manifest; release artwork outside a dynamic Sprite directory is not hash-checked. A held render exercises scheduling.`,
  componentSha256: createHash("sha256").update(source).digest("hex"), playerSha256: createHash("sha256").update(playerSource).digest("hex"),
  rendererSha256: createHash("sha256").update(rendererSource).digest("hex"), librarySourceSha256: createHash("sha256").update(librarySource).digest("hex"),
  formationProducerSha256: createHash("sha256").update(formationProducer).digest("hex"),
  expectRegression, baselineSha256, samples: [], errors: [], assertions: [], networkFailures: [], consoleErrors: [], status: "starting", error: /** @type {string | null} */ (null) };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("requestfailed", request => report.networkFailures.push({ url: request.url(), failure: request.failure() }));
  page.on("response", response => { if (response.status() >= 400) report.networkFailures.push({ url: response.url(), status: response.status() }); });
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (/^Native card resource/.test(message.text())) report.errors.push(message.text()); if (message.type() === "error") report.consoleErrors.push(message.text()); });
  await page.goto(`${origin}${pagePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("astro-island")].some(island => island.getAttribute("component-url")?.includes("DeckWorkspace") && !island.hasAttribute("ssr")));
  report.catalogue = await page.evaluate(async ({ baselineUrl, mode, server, formationControl }) => {
    const island = [...document.querySelectorAll("astro-island")].find(element => element.getAttribute("component-url")?.includes("DeckWorkspace"));
    const revive = value => { if (!Array.isArray(value)) return value; const [type, data] = value; if (type === 1) return data.map(revive); if (type === 0 && data && typeof data === "object") return Object.fromEntries(Object.entries(data).map(([key, item]) => [key, revive(item)])); return data; };
    const raw = JSON.parse(island.getAttribute("props"));
    const props = { locale: revive(raw.locale), formationControl, members: revive(raw.members), snaps: revive(raw.snaps) };
    const { mountNativeCardLifecycle } = await import(`/tests/native-card-lifecycle-browser-entry.tsx?proof=${Date.now()}`);
    const baselineCard = baselineUrl ? (await import(baselineUrl)).default : undefined;
    const host = document.createElement("main"); host.id = "native-card-lifecycle-proof";
    host.style.cssText = "position:fixed;inset:0;background:white;padding:30px;z-index:100000;display:flex;align-items:flex-start";
    document.body.append(host);
    window.nativeCardLifecycle = mountNativeCardLifecycle(host, props, baselineCard, mode, server);
    return window.nativeCardLifecycle.catalogue;
  }, { baselineUrl, mode, server, formationControl });
  const target = page.locator("#native-card-lifecycle-proof [data-renderer=nnnotes-ui]");
  async function pixels() {
    return page.evaluate(async () => {
      const wrapper = document.querySelector("#native-card-lifecycle-proof [data-renderer=nnnotes-ui]");
      const surfaces = [...(wrapper?.querySelectorAll(".mn-native-card-canvas canvas, .mn-native-card-canvas img") ?? [])];
      const samples = [];
      for (const surface of surfaces) {
        const canvas = surface instanceof HTMLCanvasElement ? surface : document.createElement("canvas");
        if (surface instanceof HTMLImageElement) {
          canvas.width = surface.naturalWidth; canvas.height = surface.naturalHeight;
          if (surface.complete && canvas.width && canvas.height) canvas.getContext("2d").drawImage(surface, 0, 0);
        }
        if (!canvas.width || !canvas.height) { samples.push({ tag: surface.tagName, width: canvas.width, height: canvas.height, paintedPixels: 0, sampledColors: 0, rgbaSha256: null }); continue; }
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0; const colors = new Set();
        for (let index = 3; index < data.length; index += 4) if (data[index] > 0) { painted++; if ((index - 3) % 256 === 0) colors.add(`${data[index - 3]},${data[index - 2]},${data[index - 1]}`); }
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(value => value.toString(16).padStart(2, "0")).join("");
        samples.push({ tag: surface.tagName, width: canvas.width, height: canvas.height, paintedPixels: painted, sampledColors: colors.size, rgbaSha256: digest });
      }
      return { status: wrapper?.getAttribute("data-status"), surfaceCount: surfaces.length,
        canvasCount: surfaces.filter(surface => surface instanceof HTMLCanvasElement).length,
        imageCount: surfaces.filter(surface => surface instanceof HTMLImageElement).length, surfaces: samples };
    });
  }
  async function visible(name, previousHash) {
    await expect.poll(async () => { const value = await pixels(); return value.status === "ready" && value.surfaceCount === 1 && value.surfaces[0].paintedPixels > 1000 && value.surfaces[0].sampledColors > 20 && (!previousHash || value.surfaces[0].rgbaSha256 !== previousHash); }, { timeout: 60000 }).toBe(true);
    const value = await pixels(); report.samples.push({ name, ...value });
    await target.screenshot({ path: path.join(out, `${name}.png`) });
    return value;
  }
  const initial = await visible("01-initial-real-member");
  await page.evaluate(() => { window.nativeCardLifecycle.holdNextRender(); window.nativeCardLifecycle.update({ index: 1, level: 20, rank: 2 }); });
  await page.waitForFunction(() => window.nativeCardLifecycle.held);
  const heldPlayer = await page.evaluate(() => window.nativeCardLifecycle.events.findLast(event => event.action === "held-before-real-render").player);
  const pending = await pixels(); report.samples.push({ name: "02-next-real-render-pending", ...pending });
  await target.screenshot({ path: path.join(out, "02-next-real-render-pending.png") });
  const retained = pending.surfaceCount === 1 && pending.surfaces[0].rgbaSha256 === initial.surfaces[0].rgbaSha256;
  report.assertions.push({ name: "visible-real-pixels-retained-until-replacement", passed: retained });
  if (expectRegression) { expect(retained).toBe(false); report.status = "baseline-blank-observed"; }
  else {
    expect(retained).toBe(true);
    await page.evaluate(() => window.nativeCardLifecycle.update({ index: 0, level: 30, rank: 3 }));
    const newer = await visible("03-newer-real-member", initial.surfaces[0].rgbaSha256);
    await page.evaluate(() => window.nativeCardLifecycle.releaseRender());
    await page.waitForFunction(player => window.nativeCardLifecycle.events.some(event => event.player === player && event.action === "destroy"), heldPlayer);
    const late = await pixels(); report.samples.push({ name: "04-after-late-old-render", ...late });
    expect(late.surfaceCount).toBe(1); expect(late.surfaces[0].rgbaSha256).toBe(newer.surfaces[0].rgbaSha256);
    report.assertions.push({ name: "late-render-keeps-current-real-pixels", passed: true });
    for (let index = 0; index < 10; index++) {
      await page.evaluate(index => window.nativeCardLifecycle.update({ index: index % 2, level: index + 1, rank: index % 5 + 1 }), index);
      await page.waitForTimeout(10);
      const sample = await pixels(); report.samples.push({ name: `rapid-${index}`, ...sample });
      expect(sample.surfaceCount).toBe(1); expect(sample.surfaces[0].paintedPixels).toBeGreaterThan(1000);
    }
    const finalMember = await visible("05-final-rapid-member", newer.surfaces[0].rgbaSha256);
    await page.evaluate(() => window.nativeCardLifecycle.update({ kind: "snap", index: 0, level: 15, rank: 2 }));
    const snap = await visible("06-real-snap", finalMember.surfaces[0].rgbaSha256);
    await page.evaluate(() => window.nativeCardLifecycle.update({ shown: false }));
    await expect(page.locator("#native-card-lifecycle-proof .mn-native-card-canvas canvas, #native-card-lifecycle-proof .mn-native-card-canvas img")).toHaveCount(0);
    await page.evaluate(mode => window.nativeCardLifecycle.update({ shown: true, kind: mode === "formation" ? "formation" : "member", index: 1, epoch: 1, level: 10, rank: 1 }), mode);
    await visible("07-real-remount", snap.surfaces[0].rgbaSha256);
    if (server === "tw" && mode === "square") {
      for (const [kind, assetId] of [["member",61],["member",62],["member",63],["snap",62],["snap",63],["snap",64]]) {
        const catalogue = kind === "member" ? report.catalogue.members : report.catalogue.snaps;
        const index = catalogue.findIndex(card => card.assetId === assetId);
        if (index < 0) throw new Error(`Actual TW ${kind} asset ${assetId} is missing`);
        const previous = await pixels();
        await page.evaluate(({kind,index}) => window.nativeCardLifecycle.update({ kind, index, epoch: index + 10, level: 20, rank: 2 }), {kind,index});
        const sample = await visible(`tw-exact-${kind}-${assetId}`, previous.surfaces[0]?.rgbaSha256);
        expect(sample.imageCount).toBe(1);
        report.assertions.push({name:`actual-tw-${kind}-${assetId}-painted`,passed:true});
      }
    }
    report.assertions.push({ name: "rapid-card-level-rank-snap-and-remount-real-pixels", passed: true });
    expect(report.errors).toEqual([]); report.status = "passed";
  }
  report.playerEvents = await page.evaluate(async () => {
    const controller = window.nativeCardLifecycle;
    await controller.dispose();
    return controller.events;
  });
} catch (error) { report.status = "failed"; report.error = String(error); throw error; }
finally { await browser.close(); if (baselinePath) await unlink(baselinePath); await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2)+"\n"); console.log(JSON.stringify({ status: report.status, assertions: report.assertions, error: report.error, out })); }
