import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { checkEvidenceGallery } from './check-evidence-gallery.mjs';
import { json } from './native-capture.mjs';

// This checks the generated report UI, not the App or its native acceptance.
export async function checkAppReport({ reportDir, outputDir }) {
  const report = path.resolve(reportDir), output = path.resolve(outputDir);
  const inventory = await json(path.join(report, "inventory.json"));
  const coverage = await json(path.join(report, "coverage.json"));
  const hashes = await json(path.join(report, "hashes.json"));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const verifyHashes = async () => {
    for (const [name, expected] of Object.entries(hashes.generated)) assert.equal(hash(await fs.readFile(path.join(report, name))), expected, name);
    for (const item of hashes.copies) assert.equal(hash(await fs.readFile(path.join(report, item.copy))), item.sha256, item.copy);
  };
  await verifyHashes();
  await fs.mkdir(output, { recursive: false });
  const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../apps/web/package.json"));
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], network = [], checks = [];
  let origin;
  const realReport = await fs.realpath(report);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      const file = await fs.realpath(path.join(report, pathname === '/' ? 'index.html' : pathname));
      if (!file.startsWith(realReport + path.sep)) throw Error('Outside report');
      const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
      const bytes = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) network.push(request.url()); });
  const screenshot = async name => {
    await page.locator("img[src]").evaluateAll(async images => {
      const selected = images.filter(image => image.getAttribute('src'));
      for (const image of selected) image.loading = 'eager';
      await Promise.all(selected.map(image => image.complete && image.naturalWidth ? Promise.resolve() : new Promise((resolve, reject) => {
        const done = error => { clearTimeout(timer); image.removeEventListener('load', loaded); image.removeEventListener('error', failed); error ? reject(error) : resolve(); };
        const loaded = () => done(), failed = () => done(new Error('Image load failed: ' + image.getAttribute('src')));
        const timer = setTimeout(failed, 10000);
        image.addEventListener('load', loaded, { once: true }); image.addEventListener('error', failed, { once: true });
      })));
      // Changing lazy loading can replace a pending request. Decode after load, sequentially.
      for (const image of selected) await image.decode();
    });
    await page.screenshot({ path: path.join(output, name), animations: "disabled" });
  };
  const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const containedDialog = async () => assert(await page.evaluate(() => {
    const panel = document.querySelector('.image-panel').getBoundingClientRect();
    const strip = document.querySelector('#thumbnails').getBoundingClientRect();
    const stage = document.querySelector('#image-stage').getBoundingClientRect();
    const image = document.querySelector('#image-stage img')?.getBoundingClientRect();
    return strip.left >= panel.left && strip.right <= panel.right + 1 && strip.bottom <= panel.bottom + 1 && (!image || (image.left >= stage.left - 1 && image.right <= stage.right + 1 && image.bottom <= stage.bottom + 1));
  }), 'Image stage / thumbnail strip overflowed its panel');
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin + '/');
    await page.locator("[data-page]").first().waitFor();
    const combined = inventory.version === 2;
    const initialInventory = combined ? inventory.app : inventory;
    assert.equal(await page.locator("[data-page]").count(), initialInventory.pages.length);
    if (await page.evaluate(() => (window.REPORT_DATA.scopes?.app || window.REPORT_DATA).domPolicy === 'inert-allowlist')) {
      const original = await page.evaluate(() => {
        const data = window.REPORT_DATA.scopes?.app || window.REPORT_DATA;
        const original = data.icons.house;
        data.icons.house = '<svg onload="window.reportXss=true"><script>window.reportXss=true</script></svg><a href="javascript:window.reportXss=true">test</a>';
        return original;
      });
      await page.locator('[data-group="home"]').click();
      assert.equal(await page.locator('#navigation [onload],#navigation script,#navigation [href^="javascript:"]').count(), 0);
      assert.equal(await page.evaluate(() => window.reportXss), undefined);
      await page.evaluate(value => { (window.REPORT_DATA.scopes?.app || window.REPORT_DATA).icons.house = value; }, original);
      await page.locator('[data-group="all"]').click();
      checks.push('dynamic markup removes scripts, event handlers and executable URLs');
    }
    const datasets = await page.evaluate(() => window.REPORT_DATA.scopes || { single: window.REPORT_DATA });
    await screenshot("desktop.png");
    if (combined) {
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.locator('.scope-tabs [role=tab]').count(), 2);
      await page.locator('[data-scope="app"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-scope="web"]').getAttribute('aria-selected'), 'true');
      await page.keyboard.press('Home');
      assert.equal(await page.locator('[data-scope="app"]').getAttribute('aria-selected'), 'true');
      checks.push('Web / mobile tabs: keyboard selection, one workbench, no iframe');
    }
    for (const [scope, dataset] of Object.entries(datasets)) {
      if (combined) await page.locator(`[data-scope="${scope}"]`).click();
      const scopedInventory = combined ? inventory[scope] : inventory;
      const scopedCoverage = combined ? coverage[scope] : coverage;
      for (const platform of Object.keys(dataset.reports)) {
      await page.locator(`[data-platform="${platform}"]`).click();
      const figures = dataset.reports[platform].screenshots;
      for (const group of ["home", "community", "map", "resources", "account"]) {
        await page.locator(`[data-group="${group}"]`).click();
        assert.equal(await page.locator("[data-page]").count(), scopedInventory.pages.filter(item => item.group === group).length);
      }
      await page.locator('[data-group="all"]').click();
      for (const state of ["native", "pending", "attention", "all"]) {
        await page.locator(`[data-status="${state}"]`).click();
        const expected = scopedCoverage[platform].pages.filter(item => state === "native" ? figures.some(image => image.pageId === item.id && image.kind === "runtime") : state === "pending" ? item.verdict === "UNRUN" : state === "attention" ? ["REWORK", "BLOCKED", "PARTIAL"].includes(item.verdict) : true).length;
        assert.equal(await page.locator("[data-page]").count(), expected);
      }
      const aliased = scopedInventory.pages.find(item => item.aliases?.length);
      if (aliased) {
        await page.locator("#search").fill(aliased.aliases[0]);
        assert(await page.locator(`[data-page="${aliased.id}"]`).isVisible());
      }
      await page.locator("#search").fill("__no_page__");
      assert(await page.locator("#empty").isVisible());
      await page.locator("#reset-button").click();
      const busiest = scopedInventory.pages.toSorted((a,b) => figures.filter(i=>i.pageId===b.id).length - figures.filter(i=>i.pageId===a.id).length)[0];
      const captured = page.locator(`.page-card [data-page="${busiest.id}"]`);
      if (figures.length && await captured.count()) {
        await captured.click();
        await containedDialog();
        const thumbnailCount = await page.locator("#thumbnails button").count();
        for (const index of new Set([0, Math.floor(thumbnailCount / 2), thumbnailCount - 1])) {
          await page.locator(`[data-image="${index}"]`).click();
          await page.locator("#image-stage img").evaluate(image => image.decode());
        }
        await page.locator('[data-image="0"]').click();
        await screenshot(`${platform}-dialog.png`);
        await page.setViewportSize({ width: 1440, height: 600 }); await containedDialog();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator("#zoom-button").click();
        assert(await page.locator("#zoom-dialog").evaluate(dialog => dialog.open));
        await page.keyboard.press("Escape");
        assert(await page.locator("#detail-dialog").evaluate(dialog => dialog.open));
        await page.locator("#tab-evidence").click();
        const expected = await page.locator("#evidence-panel").innerText();
        const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#evidence-panel a[download]").click()]);
        assert(expected.includes(hash(await fs.readFile(await download.path()))));
        for (let i = 0; i < 15; i++) {
          await page.keyboard.press("Tab");
          assert(await page.evaluate(() => !!document.activeElement.closest("#detail-dialog")));
        }
        await page.keyboard.press("Escape");
        assert(await page.evaluate(() => document.activeElement.hasAttribute("data-page")));
      }
      const missing = page.locator(".missing-card").first();
      if (await missing.count()) {
        await missing.click(); assert(await page.locator(".no-evidence").isVisible()); await page.keyboard.press("Escape");
      }
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-button").click()]);
      const exported = JSON.parse(await fs.readFile(await download.path(), "utf8"));
      assert.equal(exported.platform, platform);
      assert.equal(exported.pages.length, scopedInventory.pages.length);
      assert.deepEqual(exported.coverage, scopedCoverage[platform]);
      checks.push(`${platform}: groups, status, alias search, empty state, dialog, thumbnails, zoom/Escape, focus, download hash, full inventory export`);
      }
    }
    if (combined) {
      await page.locator('#search').fill('__switch_scope__');
      await page.locator('[data-scope="app"]').click();
      assert.equal(await page.locator('#search').inputValue(), '');
      assert.equal(await page.locator('[data-page]').count(), inventory.app.pages.length);
    }
    const firstPlatform = Object.keys(Object.values(datasets)[0].reports)[0];
    await page.locator(`[data-platform="${firstPlatform}"]`).click();
    await page.locator("#toast").evaluate(element => { element.hidden = true; });
    await page.locator("#theme-button").click(); await screenshot("dark.png");
    await page.locator("#theme-button").click();
    for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
      await page.setViewportSize(viewport); await noOverflow();
      if (combined) for (const scope of ['web', 'app']) {
        await page.locator(`[data-scope="${scope}"]`).click(); await noOverflow();
        assert.equal(await page.locator('[data-page]').count(), inventory[scope].pages.length);
      }
      await screenshot(`phone-${viewport.width}.png`);
      await page.locator("[data-page]").first().click(); await noOverflow();
      const box = await page.locator("#detail-dialog").boundingBox();
      assert(box.x >= 0 && box.x + box.width <= viewport.width);
      await containedDialog();
      await screenshot(`phone-${viewport.width}-dialog.png`);
      await page.keyboard.press("Escape");
      checks.push(`standard phone ${viewport.width}x${viewport.height}: no overflow, dialog visible`);
    }
    await page.goto(pathToFileURL(path.join(report, "index.html")).href);
    await page.locator('[data-page]').first().waitFor(); await screenshot('file.png'); await noOverflow();
    const html = await fs.readFile(path.join(report, "index.html"), "utf8");
    const portable = hashes.summary?.assetMode === 'directory' || html.includes('"asset":"originals/');
    await page.goto(portable ? origin + '/' : 'about:blank');
    await page.setContent(portable ? html.replace('<head>', `<head><base href="${origin}/">`) : html);
    await page.locator("[data-page]").first().waitFor();
    assert.equal(await page.locator("[data-page]").count(), initialInventory.pages.length);
    await noOverflow();
    await screenshot('inline.png');
    checks.push(portable ? "portable file assets, HTTP downloads and inline HTML with HTTP asset base" : "file and inline HTML without filesystem base");
    checks.push(await checkEvidenceGallery({ page, origin, outputDir: output, expectedImages: hashes.summary.screenshots }));
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    await verifyHashes();
    const result = { mode: "report-ui-only", status: "PASS", viewports: ["390x844", "412x915"], checks, consoleErrors: errors, externalRequests: network };
    await fs.writeFile(path.join(output, "check.json"), JSON.stringify(result, null, 2));
    return result;
  } finally { await browser.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--report" || args[2] !== "--output") throw new Error("check-app-report.mjs --report <report-directory> --output <new-check-directory>");
    console.log(JSON.stringify(await checkAppReport({ reportDir: args[1], outputDir: args[3] }), null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
