import { chromium } from 'playwright';
import fs from 'node:fs';
const man = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
fs.mkdirSync('out/png', { recursive: true }); fs.mkdirSync('out/html', { recursive: true });
const browser = await chromium.launch();
for (const m of man) {
  const page = await browser.newPage({ viewport: { width: m.width, height: m.height }, deviceScaleFactor: m.width < 600 ? 2 : 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', c => { if (c.type() === 'error') errs.push(c.text()); });
  await page.goto(`http://127.0.0.1:8765/${m.name}.dc.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `out/png/${m.name}.png`, fullPage: true });
  const html = await page.evaluate(() => {
    const d = document.documentElement.cloneNode(true);
    d.querySelectorAll('script').forEach(s => s.remove());
    return '<!doctype html>\n' + d.outerHTML;
  });
  fs.writeFileSync(`out/html/${m.name}.html`, html);
  const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 80) }));
  console.log(m.name, JSON.stringify(info), errs.length ? 'ERR ' + errs.slice(0, 3).join(' | ') : '');
  await page.close();
}
await browser.close();
