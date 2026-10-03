import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? '@playwright/test';
const { chromium, expect } = await import(path.isAbsolute(playwrightModule) ? pathToFileURL(playwrightModule).href : playwrightModule);

const origin = new URL(process.env.CARD_BOX_ORIGIN ?? 'http://127.0.0.1:24321').origin;
const fixtures = process.env.CARD_BOX_SCREENSHOT_DIR ?? (process.env.CARD_BOX_SCREENSHOT ? path.dirname(process.env.CARD_BOX_SCREENSHOT) : null);
if (!fixtures) throw new Error('CARD_BOX_SCREENSHOT_DIR must contain member-training.jpg, member-performance.jpg and member-technic.jpg');
const out = path.resolve(process.env.CARD_BOX_PROOF_DIR ?? 'cache/card-box-batch-browser-proof');
await mkdir(out, { recursive: true });
const invalid = path.join(out,'invalid-negative-control.jpg');
await writeFile(invalid,Buffer.from('not an image'));
const training = path.join(fixtures, 'member-training.jpg');
const sha = data => createHash('sha256').update(data).digest('hex');
const fixtureDigests = {};
for (const name of ['member-training.jpg', 'member-performance.jpg', 'member-technic.jpg']) fixtureDigests[name] = sha(await readFile(path.join(fixtures, name)));
const report = { format:'moenotes.actual-card-box-batch-browser-proof/2', origin, at:new Date().toISOString(), platform:process.platform,
  fixtures:fixtureDigests,
  scope:'Chromium against a running Astro origin with the configured recognition Worker; /api/me is stubbed. An invalid JPEG and a delayed gallery manifest exercise failure and cancellation.',
  cases:[], pageErrors:[], nativeErrors:[], writes:[], passed:false, error:null, finalDom:null };
const browser = await chromium.launch({ headless:true });
let page;
const readBox = page => page.evaluate(async () => (await import('/src/lib/box/store.ts')).readLocalBox('jp'));
async function fit(page, label) {
  const sizes = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth }));
  expect(sizes.scroll, label).toBeLessThanOrEqual(sizes.width + 1);
  return sizes;
}
async function readyCards(page, area, n) {
  await expect(area).toHaveCount(n);
  await expect(area.first().locator('[data-renderer="nnnotes-ui"]')).toHaveAttribute('data-status','ready',{timeout:60000});
  await expect.poll(() => area.first().evaluate(tile => {
    const image=tile.querySelector('.mn-native-card-canvas img');
    return image instanceof HTMLImageElement ? image.complete && image.naturalWidth > 0 : !!tile.querySelector('canvas');
  }),{timeout:60000}).toBe(true);
  const pixels = await area.evaluateAll(tiles => tiles.flatMap(tile => {
    const root=tile.querySelector('[data-renderer="nnnotes-ui"][data-status="ready"]');
    if (!root) return [];
    const image=root.querySelector('.mn-native-card-canvas img'), existing=root.querySelector('canvas');
    let canvas=existing;
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth) {
      canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      canvas.getContext('2d').drawImage(image,0,0);
    }
    if (!canvas) return [];
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let painted=0;for(let i=3;i<data.length;i+=4) if(data[i])painted++;
    return [{width:canvas.width,height:canvas.height,painted,surface:image?'decodedNativePng':'nativeCanvas'}];
  }));
  expect(pixels.length).toBeGreaterThan(0); expect(pixels.every(item => item.painted > 5000)).toBe(true);
  expect(await area.locator('[data-renderer="nnnotes-ui"][data-status="error"]').count()).toBe(0);
  await fit(page, 'native card layout');
  return pixels;
}
async function visibleFirstCard(area) {
  const proof = await area.first().evaluate(tile => {
    const art = tile.querySelector('.mn-native-card-canvas img') ?? tile.querySelector('canvas') ?? tile.querySelector('.dw-card-art img');
    if (!art) throw new Error('No actual artwork in first card');
    const rect = art.getBoundingClientRect(), clip = tile.closest('.mn-overlay-body')?.getBoundingClientRect();
    const left = Math.max(rect.left, clip?.left ?? 0, 0), right = Math.min(rect.right, clip?.right ?? innerWidth, innerWidth);
    const top = Math.max(rect.top, clip?.top ?? 0, 0), bottom = Math.min(rect.bottom, clip?.bottom ?? innerHeight, innerHeight);
    const width = Math.max(0, right-left), height = Math.max(0, bottom-top);
    const hit = width && height ? document.elementFromPoint((left+right)/2, (top+bottom)/2) : null;
    return { width, height, fraction:width*height/(rect.width*rect.height), hitOwnCard:!!hit && tile.contains(hit), rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height} };
  });
  expect(proof.width).toBeGreaterThan(50); expect(proof.height).toBeGreaterThan(50);
  expect(proof.fraction).toBeGreaterThan(0.5); expect(proof.hitOwnCard).toBe(true);
  return proof;
}
async function pickIdentity(page, id) {
  const picker = page.getByRole('dialog',{name:'Change card',exact:true});
  const expand = picker.locator('button[aria-controls][aria-expanded="false"]').first();
  if (await expand.count()) await expand.click();
  await picker.getByRole('textbox',{name:'Search',exact:true}).fill(id);
  await picker.getByRole('button',{name:'Icons',exact:true}).click();
  const item = picker.locator(`.dw-card-identity-grid li[data-card-id="${id}"]`);
  await item.getByRole('button').click();
  await expect(item.getByRole('button')).toHaveAttribute('aria-pressed','true');
  await picker.getByRole('button',{name:'Use this card',exact:true}).click();
}
async function start(width) {
  const context = await browser.newContext({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
  await context.route('**/api/me',route=>route.fulfill({json:{user:null}}));
  await context.addInitScript(() => {
    self.__batchReplies=[]; const Base=self.Worker;
    self.Worker=class extends Base { constructor(...args) { super(...args);
      this.addEventListener('message',event=>{ if(event.data?.type==='result') self.__batchReplies.push(event.data); });
    }};
  });
  context.on('request',request=>{ if(new URL(request.url()).origin===origin && !['GET','HEAD','OPTIONS'].includes(request.method())) report.writes.push({url:request.url(),method:request.method()}); });
  page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('console',message=>{if(/^Native (card|Sprite) resource/.test(message.text())) report.nativeErrors.push(message.text());});
  await page.goto(origin+'/en/account/box',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Server',{exact:true}).selectOption('jp');
  await page.getByRole('button',{name:'Import screenshots',exact:true}).first().click();
  return {context,page,dialog:page.getByRole('dialog',{name:'Import screenshots',exact:true})};
}
const settled = dialog => expect.poll(async () => dialog.locator('.dw-screenshot-queue-item[data-status="queued"],.dw-screenshot-queue-item[data-status="preparing"],.dw-screenshot-queue-item[data-status="running"]').count(), {timeout:90000}).toBe(0);
try {
  {
    const run=await start(800); page=run.page;
    const upload=run.dialog.locator('input[type=file][multiple]');
    await upload.setInputFiles([training,training,path.join(fixtures,'member-performance.jpg'),invalid]);
    await settled(run.dialog);
    await expect(run.dialog.locator('.dw-screenshot-queue-item[data-status="complete"]')).toHaveCount(3);
    await expect(run.dialog.locator('.dw-screenshot-queue-item[data-status="failed"]')).toHaveCount(1);
    const tiles=run.dialog.locator('.dw-recognition-card'); await expect(tiles).toHaveCount(24);
    const beforePixels=await readyCards(page,tiles,24);
    const replies=await page.evaluate(()=>self.__batchReplies);
    expect(replies.filter(item=>item.status==='complete')).toHaveLength(3);
    expect(replies[0].cards.map(item=>item.id)).toEqual(Array.from({length:24},(_,i)=>String(i+1)));
    expect(replies[0].cards.filter(item=>item.awake_count.value===1)).toHaveLength(18);
    await tiles.first().getByRole('button',{name:'Correct card',exact:true}).click();
    let edit=page.getByRole('dialog',{name:'Correct card',exact:true});
    await edit.getByRole('group',{name:'Training count (1–5)',exact:true}).getByRole('button',{name:'2',exact:true}).click();
    await edit.getByRole('button',{name:'Change card',exact:true}).click();
    await pickIdentity(page,'25');
    edit=page.getByRole('dialog',{name:'Correct card',exact:true});
    await edit.getByRole('button',{name:'Done',exact:true}).click();
    await expect(run.dialog.locator('.dw-recognition-card[data-card-id="25"]')).toHaveCount(1);
    await upload.setInputFiles(path.join(fixtures,'member-technic.jpg')); await settled(run.dialog);
    await expect(run.dialog.locator('.dw-screenshot-queue-item[data-status="complete"]')).toHaveCount(4);
    await expect(tiles).toHaveCount(24);
    const corrected=run.dialog.locator('.dw-recognition-card[data-card-id="25"]');
    await expect(corrected.locator('.dw-recognition-facts dd[aria-label="Training count (1–5): 2"]')).toBeVisible();
    const afterPixels=await readyCards(page,tiles,24);
    const viewportArtwork=await visibleFirstCard(tiles);
    await page.screenshot({path:path.join(out,'800-batch-review.png'),fullPage:true});
    await run.dialog.getByRole('button',{name:'Save 24 cards',exact:true}).click(); await expect(run.dialog).not.toBeVisible();
    const saved=await readBox(page); expect(saved.cards).toHaveLength(24);
    const manual=saved.cards.find(card=>card.identity.value==='25'); expect(manual.identity.status).toBe('manual'); expect(manual.fields.awake.value).toBe(2);
    expect(saved.coverage.member.complete).toBe(false); expect(saved.cards.every(card=>card.fields.level.value===null)).toBe(true);
    await page.reload({waitUntil:'domcontentloaded'}); await expect.poll(async()=> (await readBox(page))?.cards.length).toBe(24);
    const collection=page.locator('.dw-box-manager .dw-box-card'); await collection.first().scrollIntoViewIfNeeded(); await readyCards(page,collection,24);
    const collectionViewportArtwork=await visibleFirstCard(collection);
    await page.screenshot({path:path.join(out,'800-box-reloaded.png'),fullPage:true});
    report.cases.push({width:800,successImages:4,failedImages:1,uniqueCards:24,realReplies:replies,manualCorrection:saved.cards.find(card=>card.identity.value==='25'),beforePixels,afterPixels,viewportArtwork,collectionViewportArtwork,persistence:true});
    await contextClose(run.context);
  }
  {
    const run=await start(390); page=run.page;
    const upload=run.dialog.locator('input[type=file][multiple]'); let delayed=false;
    await page.route('**/assets/gallery-manifest.json',async route=>{if(!delayed){delayed=true;await new Promise(resolve=>setTimeout(resolve,2500));}await route.continue().catch(()=>{});});
    await upload.setInputFiles([training,training]);
    const first=run.dialog.locator('.dw-screenshot-queue-item').first();
    await expect(first).toHaveAttribute('data-status','preparing');
    await first.getByRole('button',{name:'Cancel recognition',exact:true}).click();
    await settled(run.dialog);
    await expect(first).toHaveAttribute('data-status','cancelled');
    await expect(run.dialog.locator('.dw-screenshot-queue-item[data-status="complete"]')).toHaveCount(1);
    await page.unroute('**/assets/gallery-manifest.json');
    await first.getByRole('button',{name:'Retry',exact:true}).click(); await settled(run.dialog);
    await expect(run.dialog.locator('.dw-screenshot-queue-item[data-status="complete"]')).toHaveCount(2);
    const tiles=run.dialog.locator('.dw-recognition-card'); await expect(tiles).toHaveCount(24);
    const pixels=await readyCards(page,tiles,24);
    const viewportArtwork=await visibleFirstCard(tiles);
    await page.screenshot({path:path.join(out,'390-batch-review.png'),fullPage:true});
    await run.dialog.getByRole('button',{name:'Save 24 cards',exact:true}).click();await expect(run.dialog).not.toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'}); await expect.poll(async()=> (await readBox(page))?.cards.length).toBe(24);
    const collection=page.locator('.dw-box-manager .dw-box-card'); await collection.first().scrollIntoViewIfNeeded(); await readyCards(page,collection,24);
    const collectionViewportArtwork=await visibleFirstCard(collection);
    await page.screenshot({path:path.join(out,'390-box-reloaded.png'),fullPage:true});
    report.cases.push({width:390,successImages:2,uniqueCards:24,cancelPreparing:true,retry:true,pixels,viewportArtwork,collectionViewportArtwork,persistence:true});
    await contextClose(run.context);
  }
  {
    const run=await start(800); page=run.page;
    const upload=run.dialog.locator('input[type=file][multiple]');
    await upload.setInputFiles(training); await settled(run.dialog);
    const tiles=run.dialog.locator('.dw-recognition-card'); await expect(tiles).toHaveCount(24);
    await tiles.first().getByRole('button',{name:'Correct card',exact:true}).click();
    let edit=page.getByRole('dialog',{name:'Correct card',exact:true});
    await edit.getByRole('group',{name:'Training count (1–5)',exact:true}).getByRole('button',{name:'2',exact:true}).click();
    await edit.getByRole('button',{name:'Change card',exact:true}).click(); await pickIdentity(page,'2');
    edit=page.getByRole('dialog',{name:'Correct card',exact:true}); await edit.getByRole('button',{name:'Done',exact:true}).click();
    await expect(tiles).toHaveCount(23); await expect(run.dialog.locator('.dw-recognition-card[data-card-id="2"]')).toHaveCount(1);
    await upload.setInputFiles(training); await settled(run.dialog); await expect(tiles).toHaveCount(23);
    await readyCards(page,tiles,23); const viewportArtwork=await visibleFirstCard(tiles);
    await run.dialog.getByRole('button',{name:'Save 23 cards',exact:true}).click(); await expect(run.dialog).not.toBeVisible();
    const saved=await readBox(page), merged=saved.cards.find(card=>card.identity.value==='2');
    expect(saved.cards).toHaveLength(23); expect(merged.identity.status).toBe('manual'); expect(merged.fields.awake.value).toBe(2);
    expect(new Set(merged.identity.history.filter(entry=>entry.screenshot).map(entry=>entry.screenshot.bbox.join(','))).size).toBe(2);
    expect(saved.cards.every(card=>card.fields.level.value===null && card.fields.rank.value===null)).toBe(true);
    await page.reload({waitUntil:'domcontentloaded'}); await expect.poll(async()=> (await readBox(page))?.cards.length).toBe(23);
    report.cases.push({width:800,existingIdentityCorrection:true,appendedRealImage:true,uniqueCards:23,manualCorrection:merged,viewportArtwork,persistence:true});
    await contextClose(run.context);
  }
  expect(report.pageErrors).toEqual([]);expect(report.nativeErrors).toEqual([]);expect(report.writes).toEqual([]);report.passed=true;
} catch(error) { report.error=error.stack; if(page && !page.isClosed()){report.finalDom=await page.locator('body').innerText();await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});} process.exitCode=1; }
finally { await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close(); }
async function contextClose(context) { await context.close(); }
console.log(JSON.stringify({passed:report.passed,error:report.error,cases:report.cases.map(item=>({width:item.width,uniqueCards:item.uniqueCards,persistence:item.persistence})),out}));
