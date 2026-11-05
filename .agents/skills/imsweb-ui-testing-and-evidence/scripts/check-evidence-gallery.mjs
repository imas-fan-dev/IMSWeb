import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function checkEvidenceGallery({ page, origin, outputDir, expectedImages }) {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(origin + '/evidence.html');
  assert.equal(await page.locator('figure').count(), expectedImages);
  assert.equal(await page.locator('#execution').evaluate(e => e.open), false);
  await page.locator('#search').fill('__no_evidence__'); assert(await page.locator('#empty').isVisible());
  await page.locator('#reset').click();
  const renderer = await page.locator('[data-filter="renderer"] option').last().getAttribute('value');
  if (renderer) {
    await page.locator('[data-filter="renderer"]').selectOption(renderer);
    assert.equal(await page.locator('figure:not([hidden])').count(), await page.locator(`figure[data-renderer="${renderer}"]`).count());
  }
  await page.locator('#reset').click();
  if (expectedImages) {
    const first = page.locator('figure .enlarge').first(); await first.click();
    await page.locator('dialog img').evaluate(img => img.decode());
    if (expectedImages > 1) { await page.locator('#next').click(); await page.keyboard.press('ArrowLeft'); }
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#image-download').click()]);
    const expectedHash = (await page.locator('figure .image-meta code').first().textContent()).trim();
    assert.equal(createHash('sha256').update(await fs.readFile(await download.path())).digest('hex'), expectedHash);
    await page.keyboard.press('Escape'); assert(await first.evaluate(button => button === document.activeElement));
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#execution').evaluate(e => { e.open = true; });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const status = page.locator('tbody .badge').first();
    if (await status.count()) assert(await status.evaluate(e => e.getBoundingClientRect().width > 25));
    await page.locator('#execution').evaluate(e => { e.open = false; });
    await page.screenshot({ path: path.join(outputDir, 'evidence-' + viewport.width + '.png'), animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: path.join(outputDir, 'evidence-dark.png') }); await page.emulateMedia({ colorScheme: 'light' });
  return 'evidence gallery: collapsed execution, search/filter/reset, image navigation, Escape/focus, download hash, desktop/mobile, dark theme and table containment';
}
