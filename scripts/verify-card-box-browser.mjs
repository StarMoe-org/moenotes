import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const { chromium, expect } = await import(process.env.PLAYWRIGHT_MODULE ?? "@playwright/test");
const origin = process.env.CARD_BOX_ORIGIN ?? "http://127.0.0.1:4321";
const out = path.resolve(process.env.CARD_BOX_PROOF_DIR ?? "cache/card-box-browser-proof");
const requireNative = process.env.CARD_BOX_REQUIRE_NATIVE === "1";
await mkdir(out, { recursive: true });
await expect.poll(async () => { try { return (await fetch(`${origin}/favicon.svg`)).ok; } catch { return false; } }, { timeout: 30000 }).toBe(true);
const browser = await chromium.launch({ headless: true });
const report = { format: "moenotes.card-box-browser-proof/1", at: new Date().toISOString(), origin, viewports: [], assertions: [], errors: [] };
report.renderedScreens = [];
report.resourceErrors = [];
const dynamicRequests = new Set();
const nativeBase = process.env.CARD_BOX_NATIVE_MANIFEST ? new URL(".", new URL(process.env.CARD_BOX_NATIVE_MANIFEST, origin)).pathname : null;
const dynamicSprite = url => nativeBase !== null && url.pathname.startsWith(nativeBase) && url.pathname.includes("/sprites/");
report.nativeRendering = requireNative ? "required" : "not-verified";
let fixture, memberIds, snapIds;
const writes = [];
async function collection(page) {
  return page.evaluate(async () => (await import("/tests/box-browser-entry.ts")).readLocalBox("jp"));
}
async function screenshot(page, name) {
  if (requireNative) {
    const deadline = Date.now() + 60000;
    while (true) {
      const states = await page.locator('[data-renderer="nnnotes-ui"], [data-renderer="nnnotes-sprite"]').evaluateAll(elements => elements.map(element => element.getAttribute("data-status")));
      if (states.includes("error")) throw new Error(`Native resource failed before ${name}: ${report.resourceErrors.join("; ")}`);
      if (states.every(status => status === "ready")) break;
      if (Date.now() > deadline) throw new Error(`Native rendering timed out before ${name}`);
      await page.waitForTimeout(200);
    }
  }
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  report.renderedScreens.push({ name, prefabs: await page.locator('[data-renderer="nnnotes-ui"]').count(), sprites: await page.locator('[data-renderer="nnnotes-sprite"]').count() });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}
async function prepare(page, temporary = false) {
  await page.goto(`${origin}/en/tools/deck`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Deck builder", exact: true })).toBeVisible();
  await page.getByLabel("Server", { exact: true }).selectOption("jp");
  await page.getByRole("button", { name: "Prepare card box", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Prepare card box", exact: true });
  if (temporary) await setup.getByRole("button", { name: /^This visit only/ }).click();
  await setup.getByRole("button", { name: "Continue", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "My card box", exact: true });
  await expect(manager).toBeVisible();
  return manager;
}
async function importFixture(_page, manager) {
  await manager.locator('input[type="file"]').setInputFiles({ name: "synthetic-box.json", mimeType: "application/json", buffer: Buffer.from(fixture) });
  await expect(manager.locator(".dw-box-card")).toHaveCount(6);
}
async function closeManager(manager) {
  await manager.getByRole("button", { name: "Close", exact: true }).click();
  await expect(manager).not.toBeVisible();
}
try {
  if (requireNative) {
    if (!process.env.CARD_BOX_NATIVE_MANIFEST || !process.env.CARD_BOX_NATIVE_MANIFEST_SHA256) throw new Error("Strict native proof needs its manifest URL and expected SHA-256");
    const response = await fetch(process.env.CARD_BOX_NATIVE_MANIFEST);
    expect(response.ok).toBe(true);
    const bytes = Buffer.from(await response.arrayBuffer()), manifest = JSON.parse(bytes.toString("utf8"));
    const manifestSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(manifestSha256).toBe(process.env.CARD_BOX_NATIVE_MANIFEST_SHA256);
    expect(manifest.region).toBe("jp"); expect(Object.keys(manifest.dynamicSprites ?? {}).length).toBeGreaterThan(0);
    report.nativeSource = { region: manifest.region, client: manifest.client, manifestSha256, dynamicSpriteCount: Object.keys(manifest.dynamicSprites).length };
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  await context.route("**/api/me", route => route.fulfill({ json: { user: { name: "Synthetic browser proof", username: null, picture: null, avatar: null } } }));
  context.on("request", request => { const url = new URL(request.url()); if (url.origin === origin && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push({ method: request.method(), path: url.pathname }); });
  context.on("request", request => { const url = new URL(request.url()); if (dynamicSprite(url)) dynamicRequests.add(url.pathname); });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (/^Native (?:card|Sprite) resource/.test(message.text()) && !report.resourceErrors.includes(message.text())) report.resourceErrors.push(message.text()); });
  const manager = await prepare(page);
  await manager.getByRole("button", { name: "Add card", exact: true }).click();
  const adding = page.getByRole("dialog", { name: "Add card", exact: true });
  await expect(adding).toBeVisible();
  memberIds = await adding.locator(".dw-card-identity-grid li").evaluateAll(options => options.map(option => option.dataset.cardId).filter(Boolean).slice(0, 6));
  expect(memberIds.length).toBe(6);
  await adding.locator(`.dw-card-identity-grid li[data-card-id="${memberIds[0]}"]`).getByRole("button").click();
  await adding.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(manager.locator(".dw-box-card")).toHaveCount(1);
  const manual = await collection(page);
  expect(manual.cards[0].fields.liveSkillLevel.value).toBeNull();
  expect(manual.cards[0].fields.rank.value).toBeNull();
  await manager.getByRole("button", { name: "Add card", exact: true }).click();
  await adding.getByRole("button", { name: "Snaps", exact: true }).click();
  snapIds = await adding.locator(".dw-card-identity-grid li").evaluateAll(options => options.map(option => option.dataset.cardId).filter(Boolean).slice(0, 5));
  await adding.getByRole("button", { name: "Close", exact: true }).click();
  fixture = await page.evaluate(async ({ memberIds, snapIds }) => {
    const api = await import("/tests/box-browser-entry.ts");
    const box = api.createBox("jp", "synthetic-import");
    for (const [kind, ids] of [["member", memberIds], ["snap", snapIds]]) for (const id of ids) {
      const card = api.createCard(kind, `${kind}-${id}`, id);
      for (const [name, value] of [["level", 20], ["rank", 2], ...(kind === "member" ? [["awake", 1]] : [])]) {
        card.fields[name] = api.answerField(card.fields[name], { id: crypto.randomUUID(), value, source: "manual", at: Date.now() });
      }
      box.cards.push(card);
    }
    return JSON.stringify(box);
  }, { memberIds, snapIds });
  await importFixture(page, manager);
  await manager.getByText("Player bonuses and state", { exact: true }).click();
  const furniture = manager.locator(".dw-player-field").first().getByRole("combobox");
  await expect(furniture).toBeVisible();
  const offered = await furniture.locator("option").evaluateAll(options => options.map(option => option.value));
  expect(offered).toContain("not-owned"); expect(offered).toContain("30"); expect(offered).not.toContain("31"); expect(offered).not.toContain("50");
  await furniture.selectOption("2");
  await expect(furniture).toHaveValue("2");
  const furnished = await collection(page), furnitureId = Object.keys(furnished.player.bandItems)[0];
  expect(furnished.player.bandItems[furnitureId].value).toBe(2); expect(furnished.player.bandItemStates[furnitureId].value).toBe("owned");
  expect(furnished.player.bandItems[furnitureId].history.at(-1).catalog.server).toBe("jp");
  await furniture.selectOption("");
  await expect(furniture).toHaveValue("");
  const ownedUnknown = await collection(page);
  expect(ownedUnknown.player.bandItemStates[furnitureId].value).toBe("owned"); expect(ownedUnknown.player.bandItems[furnitureId].value).toBeNull();
  await furniture.selectOption("not-owned"); await expect(furniture).toHaveValue("not-owned");
  expect((await collection(page)).player.bandItemStates[furnitureId].value).toBe("not-owned");
  const ranks = manager.locator(".dw-player-field").filter({ has: page.locator("strong").filter({ hasText: /^Character Rank: / }) });
  const rankOptions = await ranks.first().getByRole("combobox").locator("option").evaluateAll(options => options.map(option => Number(option.value)).filter(value => value > 0));
  const totalRank = manager.getByRole("spinbutton", { name: "Total Character Rank", exact: true });
  const legalTotal = (await ranks.count()) * Math.min(...rankOptions);
  expect(Number(await totalRank.getAttribute("min"))).toBe(legalTotal);
  expect(Number(await totalRank.getAttribute("max"))).toBe((await ranks.count()) * Math.max(...rankOptions));
  await totalRank.fill(String(legalTotal)); await totalRank.press("Tab");
  await expect.poll(async () => (await collection(page)).player.characterTotalRank.value).toBe(legalTotal);
  await ranks.first().getByRole("combobox").selectOption(String(rankOptions[0]));
  await manager.getByRole("combobox", { name: "VIP Rank", exact: true }).selectOption("1");
  const characterCoverage = manager.getByRole("checkbox", { name: /^I have covered all character ranks/ });
  await characterCoverage.click(); await expect(characterCoverage).toBeChecked();
  const globalFacts = await page.evaluate(async () => {
    const boxApi = await import("/tests/box-browser-entry.ts");
    const box = await boxApi.readLocalBox("jp");
    return { declared: box.player.characterCoverage, total: box.player.characterTotalRank.value, vip: box.player.vipRank.value, known: Object.values(box.player.characterRanks).filter(field => field.value !== null).length };
  });
  expect(globalFacts).toEqual({ declared: "complete", total: legalTotal, vip: 1, known: 1 });
  await screenshot(page, "00-desktop-player-inputs");
  await manager.getByText("Player bonuses and state", { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), manager.getByRole("button", { name: "Export", exact: true }).click()]);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.player.bandItemStates[furnitureId].value).toBe("not-owned"); expect(exported.player.bandItems[furnitureId].value).toBeNull();
  report.assertions.push("JP furniture options follow the Master level rows and stop at Level 30; level answers bind catalogue versions; clearing level preserves owned; explicit absence is distinct; JSON export retains the facts.");
  report.assertions.push("Total Character Rank bounds use actual character/rank rows; total and VIP inputs are independent version-bound facts; character coverage is declared separately and does not fill unknown individual ranks.");
  await screenshot(page, "01-desktop-collection");
  await closeManager(manager);
  await expect(page.getByText(/Account storage is not available yet/)).toBeVisible();
  await screenshot(page, "02-desktop-goal");
  await page.getByRole("button", { name: /Score higher/ }).click();
  await page.getByRole("button", { name: "Preview the flow", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm a few details", exact: true })).toBeVisible();
  const first = page.locator(".dw-question").first();
  const ordinary = first.locator(".dw-levels").first();
  await ordinary.getByRole("button", { name: "2", exact: true }).click();
  await expect(ordinary.getByRole("button", { name: "2", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await collection(page)).cards[0].fields.liveSkillLevel.history.at(-1).source).toBe("deck-answer");
  expect((await collection(page)).cards[0].fields.gekisouSkillLevel.value).toBeNull();
  await expect(first.getByRole("checkbox")).not.toBeChecked();
  await first.getByRole("checkbox").check();
  await ordinary.getByRole("button", { name: "2", exact: true }).click();
  await expect.poll(async () => (await collection(page)).cards[0].fields.gekisouSkillLevel.value).toBe(2);
  await first.locator(".dw-levels").last().getByRole("button", { name: "3", exact: true }).click();
  await expect.poll(async () => (await collection(page)).cards[0].fields.liveSkillLevel.value).toBe(3);
  await page.getByRole("button", { name: "All Lv5", exact: true }).click();
  await expect(ordinary.getByRole("button", { name: "5", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".dw-bulk").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(ordinary.getByRole("button", { name: "5", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "All Lv1", exact: true }).click();
  await expect(ordinary.getByRole("button", { name: "1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await screenshot(page, "03-desktop-answers");
  const answered = await collection(page);
  expect(answered.cards.filter(card => card.kind === "member")[5].fields.liveSkillLevel.value).toBeNull();
  await page.getByRole("button", { name: "View layout preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Five physical slots", exact: true })).toBeVisible();
  await expect(page.getByText("Calculation is not available yet", { exact: true })).toBeVisible();
  await screenshot(page, "04-desktop-layout");
  const frozenRevision = (await collection(page)).revision;
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await manager.locator(".dw-box-card").first().click();
  const editor = page.getByRole("dialog", { name: "Correct a card", exact: true });
  await editor.getByRole("group", { name: "Ordinary skill level", exact: true }).getByRole("button", { name: "2", exact: true }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await closeManager(manager);
  await expect(page.getByText("This preview is out of date", { exact: true })).toBeVisible();
  await page.getByText("Calculation notes", { exact: true }).click();
  expect(await page.locator(".dw-result-layout dd").first().textContent()).toBe(String(frozenRevision));
  await expect(page.getByRole("button", { name: "Copy layout", exact: true })).toBeDisabled();
  await screenshot(page, "05-desktop-stale");
  report.assertions.push("Manual entry keeps unknowns; JSON imports merge; answers retain deck-answer evidence; skills are independent; clearing and bulk answers work; result snapshot stays frozen and becomes stale.");

  // Real IndexedDB and BroadcastChannel, in two different browser documents.
  const tab = await context.newPage();
  await tab.goto(`${origin}/en/tools/deck`, { waitUntil: "domcontentloaded" });
  const old = await collection(tab);
  const newRevision = await page.evaluate(async () => {
    const api = await import("/tests/box-browser-entry.ts"), box = await api.readLocalBox("jp");
    box.cards[0].fields.liveSkillLevel = api.answerField(box.cards[0].fields.liveSkillLevel, { id: crypto.randomUUID(), value: 3, source: "manual", at: Date.now() });
    return (await api.saveLocalBox(box, box.revision)).revision;
  });
  const rejection = await tab.evaluate(async old => {
    const api = await import("/tests/box-browser-entry.ts");
    try { await api.saveLocalBox(old, old.revision); return null; } catch (error) { return error.code; }
  }, old);
  expect(rejection).toBe("conflict");
  await expect.poll(() => tab.evaluate(async () => (await import("/tests/box-browser-entry.ts")).getCardBoxSession("jp").getSnapshot().box?.revision)).toBe(newRevision);
  expect((await collection(tab)).cards[0].fields.liveSkillLevel.value).toBe(3);
  await tab.evaluate(async () => { const api = await import("/tests/box-browser-entry.ts"); await api.saveLocalBox(api.createBox("tw", "synthetic-tw"), null); });
  expect((await collection(page)).server).toBe("jp");
  report.assertions.push("Actual IndexedDB CAS rejects a stale second tab, BroadcastChannel refreshes its snapshot, and server keys remain isolated.");
  report.viewports.push({ width: 1440, height: 1050, storage: "IndexedDB", originWrites: writes.length });
  expect(writes).toEqual([]);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mobile.route("**/api/me", route => route.fulfill({ json: { user: null } }));
  const phone = await mobile.newPage();
  phone.on("pageerror", error => report.errors.push(error.message));
  phone.on("console", message => { if (/^Native (?:card|Sprite) resource/.test(message.text()) && !report.resourceErrors.includes(message.text())) report.resourceErrors.push(message.text()); });
  mobile.on("request", request => { const url = new URL(request.url()); if (dynamicSprite(url)) dynamicRequests.add(url.pathname); });
  const phoneManager = await prepare(phone, true);
  await importFixture(phone, phoneManager);
  await closeManager(phoneManager);
  expect(await collection(phone)).toBeNull();
  await screenshot(phone, "06-mobile-goal");
  await phone.getByRole("link", { name: "My card box", exact: true }).click();
  await expect(phone.getByRole("heading", { name: "My card box", exact: true, level: 1 })).toBeVisible();
  await expect(phone.locator(".dw-box-main .dw-box-card")).toHaveCount(6);
  await screenshot(phone, "07-mobile-collection");
  await phone.getByRole("link", { name: "Open deck builder", exact: true }).click();
  await phone.getByRole("button", { name: /Score higher/ }).click();
  await phone.getByRole("button", { name: "Preview the flow", exact: true }).click();
  await expect(phone.getByRole("heading", { name: "Confirm a few details", exact: true })).toBeVisible();
  const tapTargets = await phone.locator(".dw-levels button").evaluateAll(buttons => buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  expect(tapTargets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  await screenshot(phone, "08-mobile-answers");
  await phone.getByRole("button", { name: "View layout preview", exact: true }).click();
  await screenshot(phone, "09-mobile-layout");
  await phone.reload();
  await expect(phone.getByText("Not prepared", { exact: true })).toBeVisible();
  expect(await collection(phone)).toBeNull();
  report.assertions.push("390px mobile layout has no document overflow; Lv targets are at least 44px; temporary facts survive internal collection/deck navigation but disappear on reload and never enter IndexedDB.");
  report.viewports.push({ width: 390, height: 844, storage: "memory" });
  await mobile.close();
  report.passed = true;
  if (requireNative) report.nativeRendering = "verified";
} catch (error) {
  report.passed = false; report.failure = String(error.stack ?? error); process.exitCode = 1;
  for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
    const failed = await page.locator('[data-renderer="nnnotes-ui"], [data-renderer="nnnotes-sprite"]').evaluateAll(elements => elements.filter(element => element.getAttribute("data-status") !== "ready").map(element => ({ renderer: element.getAttribute("data-renderer"), status: element.getAttribute("data-status"), label: element.getAttribute("aria-label") || element.closest(".dw-player-field")?.querySelector("strong")?.textContent })));
    report.renderFailureCount = failed.length; report.renderFailures = failed.slice(0, 20);
    await page.screenshot({ path: path.join(out, `failure-${index}.png`), fullPage: true }).catch(() => {});
  }
} finally {
  await browser.close();
  report.dynamicFilesRequested = dynamicRequests.size;
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
