import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWebInventory, validateWeb, buildWebCoverage } from './web-report-model.mjs';
import { validateWebPlan } from './web-capture.mjs';
import { buildReport } from './build-ui-report.mjs';
import { collectEvidence, applyReviews } from './ui-evidence.mjs';
import { parseJSON, sha256 } from './native-capture.mjs';
import Reporter from './web-capture-reporter.mjs';

const source = { commit: 'test-web-source', dirty: false };
test('malformed external JSON fails before creating report artifacts', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-invalid-json-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'invalid.json'), output = path.join(dir, 'report'); await fs.writeFile(input, '{broken');
  assert.throws(() => parseJSON('{broken', 'annotations'), /annotations: invalid JSON/);
  await assert.rejects(buildReport({ manifestPath: input, outputDir: output }), /Report manifest: invalid JSON/);
  await assert.rejects(fs.stat(output), { code: 'ENOENT' }); assert.equal(await fs.readFile(input, 'utf8'), '{broken');
});
function sample() {
  const inventory = createWebInventory([{ index: true, layout: 'public', targets: ['web'] }, { path: 'admin', layout: 'admin', targets: ['web'] }, { path: 'native-only', layout: 'public', targets: ['app'] }], source);
  const run = { id: 'desktop', target: 'desktop', project: 'chromium-desktop', renderer: 'web-desktop', source, sourceVerified: true, viewport: { width: 1280, height: 720 }, browser: 'Chromium test', dataMode: 'test fixture' };
  const item = { id: 'home-test', title: 'Home test', pageId: 'home', scenarioId: 'initial', runId: 'desktop', renderer: 'web-desktop', verdict: 'PASS', exitCode: null, batchExitCode: 1, testStatus: 'passed', command: 'actual batch command', receiptCopy: 'receipt.json', receipt: 'browser/receipt.json' };
  const images = ['viewport', 'full-page'].map(capture => ({ id: 'home-' + capture, title: capture, pageId: 'home', scenarioId: 'initial', runId: 'desktop', renderer: 'web-desktop', caseId: item.id, capture, state: 'initial', kind: 'runtime', review: 'PASS' }));
  return { web: { inventory, runs: [run] }, item, images };
}

test('Web public inventory and desktop/mobile coverage are independent', () => {
  const { web, item, images } = sample();
  assert.equal(web.inventory.pages.length, 1); assert.deepEqual(web.inventory.excluded, ['admin']);
  validateWeb(web, [item], images);
  const coverage = buildWebCoverage(web, [item], images);
  assert.equal(coverage.desktop.verdict, 'PASS'); assert.equal(coverage.mobile.verdict, 'UNRUN');
  images[1].review = 'NOT_REVIEWED';
  assert.equal(buildWebCoverage(web, [item], images).desktop.verdict, 'UNRUN');
  images[1].review = 'PASS'; web.runs[0].sourceVerified = false;
  assert.equal(buildWebCoverage(web, [item], images).desktop.verdict, 'UNRUN');
  web.runs[0].renderer = 'app-dom'; assert.throws(() => validateWeb(web, [item], images), /renderer/);
});

test('teardown failures survive a successful screenshot and cannot be erased by another PASS', () => {
  const { web, item, images } = sample();
  const failed = { ...item, id: 'teardown-failed', testStatus: 'failed', verdict: 'BLOCKED', reason: 'API dispatcher teardown failed' };
  assert.equal(buildWebCoverage(web, [item, failed], images).desktop.verdict, 'BLOCKED');
  const plan = { version: 1, scope: 'web', targets: [{ id: 'mobile', project: 'app-small' }], scenarios: [] };
  assert.throws(() => validateWebPlan(plan, { web }), /requires|projects/);
});

test('reporter records terminal status, real project and retry after fixture teardown', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-reporter-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const previous = process.env.IMS_UI_CAPTURE_RESULTS; process.env.IMS_UI_CAPTURE_RESULTS = path.join(dir, 'results.jsonl');
  t.after(() => { if (previous === undefined) delete process.env.IMS_UI_CAPTURE_RESULTS; else process.env.IMS_UI_CAPTURE_RESULTS = previous; });
  const reporter = new Reporter(); reporter.onBegin();
  reporter.onTestEnd({ title: 'ui-capture:home-initial @mobile', parent: { project: () => ({ name: 'chromium-mobile' }) } }, { status: 'failed', retry: 0, duration: 10, startTime: new Date(), errors: [{ message: 'fixture cleanup failed' }], attachments: [{ name: 'ui-capture-meta', contentType: 'application/json', body: Buffer.from('{"viewport":{"width":412,"height":839}}') }] });
  const result = JSON.parse(await fs.readFile(process.env.IMS_UI_CAPTURE_RESULTS, 'utf8'));
  assert.equal(result.status, 'failed'); assert.equal(result.project, 'chromium-mobile'); assert.equal(result.retry, 0); assert.equal(result.metadata.viewport.width, 412);
});

test('Web capture collect/review/report keeps raw execution and portable gallery assets', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-evidence-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { web, item, images } = sample(); const captureDir = path.join(dir, 'capture'); await fs.mkdir(path.join(captureDir, 'browser'), { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAgCAIAAACU62+bAAAAIElEQVR4nGP8//8/AymAiSTVoxpGNYxqGNUwqmGIagAAEuMDPdmnbvsAAAAASUVORK5CYII=', 'base64');
  for (const image of images) { image.path = 'browser/' + image.id + '.png'; image.sha256 = sha256(png); image.review = 'NOT_REVIEWED'; await fs.writeFile(path.join(captureDir, image.path), png); }
  await fs.writeFile(path.join(captureDir, item.receipt), JSON.stringify({ testStatus: 'passed', batchExitCode: 1 }));
  const capture = { version: 1, scope: 'web', id: 'capture-web-test', inventory: web.inventory, runs: web.runs, cases: [item], screenshots: images };
  await fs.writeFile(path.join(captureDir, 'capture.json'), JSON.stringify(capture));
  const result = await collectEvidence({ captures: [path.join(captureDir, 'capture.json')], outputDir: path.join(dir, 'collection') });
  const draft = await buildReport({ manifestPath: result.manifestPath, outputDir: path.join(dir, 'draft'), assetMode: 'directory' }); assert.equal(draft.webCoverage.desktop.verdict, 'UNRUN');
  const queue = JSON.parse(await fs.readFile(path.join(dir, 'collection/review-queue.json'), 'utf8'));
  const notes = { version: 1, manifestSha256: queue.manifestSha256, reviewer: { id: 'test', model: 'test', method: 'direct-image-review' }, images: queue.images.map(i => ({ id: i.id, sha256: i.sha256, review: 'PASS', note: 'Test image reviewed' })), notes: [] };
  await fs.writeFile(path.join(dir, 'notes.json'), JSON.stringify(notes));
  const reviewed = await applyReviews({ manifestPath: result.manifestPath, annotationsPath: path.join(dir, 'notes.json'), outputDir: path.join(dir, 'reviewed') });
  const report = await buildReport({ manifestPath: reviewed.manifestPath, outputDir: path.join(dir, 'report'), assetMode: 'directory' });
  assert.equal(report.webCoverage.desktop.verdict, 'PASS'); assert.equal(report.webCoverage.mobile.verdict, 'UNRUN');
  const gallery = await fs.readFile(path.join(dir, 'report/evidence.html'), 'utf8'); assert.match(gallery, /全部证据图册/); assert.ok(!gallery.includes('<details id="execution" class="execution" open'));
  const html = await fs.readFile(path.join(dir, 'report/index.html'), 'utf8'); assert.match(html, /data-platform="desktop"/); assert.match(html, /data-platform="mobile"/); assert.ok(!html.includes('data-platform="ios"'));
});
