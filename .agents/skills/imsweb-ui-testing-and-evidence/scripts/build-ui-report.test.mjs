import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { buildReport } from "./build-ui-report.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture(t, change = () => {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "imsweb-ui-report-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const manifest = {
    title: "UI 验证",
    cases: [
      {
        id: "web",
        title: "搜索",
        renderer: "web",
        verdict: "PASS",
        exitCode: 0,
        receipt: "run.log",
      },
      {
        id: "android",
        title: "安装运行",
        renderer: "android-native",
        verdict: "BLOCKED",
        exitCode: null,
        reason: "Emulator unavailable",
      },
    ],
    screenshots: [
      {
        id: "search",
        title: "</script><script>bad()</script>",
        renderer: "web",
        caseId: "web",
        state: "results",
        path: "original.png",
      },
    ],
  };
  change(manifest);
  await fs.writeFile(path.join(directory, "original.png"), png);
  await fs.writeFile(
    path.join(directory, "run.log"),
    "Original command receipt\n",
  );
  const manifestPath = path.join(directory, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  return { directory, manifestPath, outputDir: path.join(directory, "report") };
}

test("preserves originals/receipts and separates blocked coverage from unreviewed screenshots", async (t) => {
  const options = await fixture(t);
  const input = await fs.readFile(options.manifestPath);
  const result = await buildReport(options);
  assert.equal(result.declaredRequiredVerdict, "BLOCKED");
  assert.equal(result.reviews.NOT_REVIEWED, 1);
  assert.deepEqual(
    await fs.readFile(path.join(options.outputDir, "originals/search.png")),
    png,
  );
  assert.deepEqual(
    await fs.readFile(path.join(options.directory, "original.png")),
    png,
  );
  assert.deepEqual(await fs.readFile(options.manifestPath), input);
  const html = await fs.readFile(
    path.join(options.outputDir, "index.html"),
    "utf8",
  );
  assert.ok(!html.includes("<script>bad()"));
  assert.ok(html.includes("&lt;script&gt;bad()"));
  assert.ok(html.includes(`data:image/png;base64,${png.toString("base64")}`));
  const hashes = JSON.parse(
    await fs.readFile(path.join(options.outputDir, "hashes.json"), "utf8"),
  );
  assert.equal(hashes.inputSha256, sha(input));
  assert.equal(hashes.copies[0].sha256, sha(png));
  assert.equal(
    await fs.readFile(path.join(options.outputDir, "receipts/web.log"), "utf8"),
    "Original command receipt\n",
  );
});

test("rejects an existing output without changing its contents", async (t) => {
  const options = await fixture(t);
  await fs.mkdir(options.outputDir);
  await fs.writeFile(path.join(options.outputDir, "keep.txt"), "frozen");
  await assert.rejects(buildReport(options), { code: "EEXIST" });
  assert.deepEqual(await fs.readdir(options.outputDir), ["keep.txt"]);
  assert.equal(
    await fs.readFile(path.join(options.outputDir, "keep.txt"), "utf8"),
    "frozen",
  );
});

test("missing capture fails before creating a report", async (t) => {
  const options = await fixture(t, (manifest) => {
    manifest.screenshots[0].path = "missing.png";
  });
  await assert.rejects(buildReport(options), { code: "ENOENT" });
  await assert.rejects(fs.stat(options.outputDir), { code: "ENOENT" });
});

test("rejects renderer misattribution and a contradictory passing command", async (t) => {
  const mixed = await fixture(t, (manifest) => {
    manifest.screenshots[0].renderer = "ios-native";
  });
  await assert.rejects(buildReport(mixed), /caseId\/renderer mismatch/);
  const failed = await fixture(t, (manifest) => {
    manifest.cases[0].exitCode = 1;
  });
  await assert.rejects(buildReport(failed), /PASS conflicts/);
});

test("an image inventory alone cannot produce passing required acceptance", async (t) => {
  const options = await fixture(t, (manifest) => {
    manifest.cases = [];
    delete manifest.screenshots[0].caseId;
  });
  assert.equal((await buildReport(options)).declaredRequiredVerdict, "UNRUN");
});

test("full App reports embed the page/dialog UI and hash coverage, inventory and binding artifacts", async (t) => {
  const options = await fixture(t, manifest => {
    manifest.app = {
      inventory: { version: 1, source: { commit: "current", dirty: false }, deviceScope: { deviceClass: "standard-phone", orientation: "portrait" }, pages: [{ id: "home", title: "</script><script>bad()</script>", route: "/", group: "home", scenarios: [{ id: "initial", title: "首屏" }] }] },
      runs: [{ id: "ios", platform: "ios", renderer: "ios-native", device: "Phone simulator", os: "iOS", deviceClass: "standard-phone", orientation: "portrait", source: { commit: "current", dirty: false }, binding: "run.log" }],
    };
    manifest.cases = [{ id: "ios", title: "首屏", renderer: "ios-native", pageId: "home", scenarioId: "initial", runId: "ios", verdict: "PASS", exitCode: 0, command: "native owner", receipt: "run.log" }];
    manifest.screenshots[0] = { ...manifest.screenshots[0], renderer: "ios-native", caseId: "ios", review: "PASS" };
  });
  const result = await buildReport(options);
  assert.equal(result.appCoverage.ios.verdict, "PASS");
  assert.equal(result.appCoverage.android.verdict, "UNRUN");
  const html = await fs.readFile(path.join(options.outputDir, "index.html"), "utf8");
  assert(html.includes('id="detail-dialog"'));
  assert(html.includes('data-platform="android"'));
  assert(!html.includes('<script>bad()'));
  assert(html.includes('\\u003c/script>'));
  assert(html.includes('data:font/woff2;base64,'));
  assert(!html.includes('src="dataset.js"'));
  assert(html.includes('const $$ ='));
  assert(html.includes('id="asset-licenses"'));
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  const hashes = JSON.parse(await fs.readFile(path.join(options.outputDir, "hashes.json"), "utf8"));
  for (const name of ["coverage.json", "inventory.json", "evidence.html"]) assert.equal(hashes.generated[name], sha(await fs.readFile(path.join(options.outputDir, name))));
  assert(hashes.copies.some(item => item.copy === "bindings/ios.log"));
  assert((await fs.readFile(path.join(options.outputDir, "results.md"), "utf8")).includes("全量 App 页面覆盖"));
});

test("invalid App associations and missing binding receipts fail before output; forged bindings do not pass", async t => {
  const invalid = await fixture(t, manifest => {
    manifest.app = { inventory: { version: 1, source: { commit: "x" }, deviceScope: { deviceClass: "standard-phone", orientation: "portrait" }, pages: [{ id: "home", title: "首页", route: "/", group: "home", scenarios: [{ id: "initial", title: "首屏" }] }] }, runs: [] };
    manifest.screenshots[0].pageId = "missing";
  });
  await assert.rejects(buildReport(invalid), /page association/);
  await assert.rejects(fs.stat(invalid.outputDir), { code: "ENOENT" });
  const missing = await fixture(t, manifest => {
    manifest.app = { inventory: { version: 1, source: { commit: "x", dirty: false }, deviceScope: { deviceClass: "standard-phone", orientation: "portrait" }, pages: [{ id: "home", title: "首页", route: "/", group: "home", scenarios: [{ id: "initial", title: "首屏" }] }] }, runs: [{ id: "ios", renderer: "ios-native", platform: "ios", device: "Phone", os: "iOS", source: { commit: "x", dirty: false }, binding: "missing.log" }] };
  });
  await assert.rejects(buildReport(missing), { code: "ENOENT" });
  await assert.rejects(fs.stat(missing.outputDir), { code: "ENOENT" });
  const forged = await fixture(t, manifest => {
    manifest.app = { inventory: { version: 1, source: { commit: "x", dirty: false }, deviceScope: { deviceClass: "standard-phone", orientation: "portrait" }, pages: [{ id: "home", title: "首页", route: "/", group: "home", scenarios: [{ id: "initial", title: "首屏" }] }] }, runs: [{ id: "ios", renderer: "ios-native", platform: "ios", device: "Phone", os: "iOS", deviceClass: "standard-phone", orientation: "portrait", source: { commit: "x", dirty: false }, bindingCopy: "made-up.log" }] };
    manifest.cases = [{ id: "ios", title: "首屏", renderer: "ios-native", pageId: "home", scenarioId: "initial", runId: "ios", verdict: "PASS", exitCode: 0, command: "native owner", receiptCopy: "made-up.log" }];
    manifest.screenshots[0] = { ...manifest.screenshots[0], renderer: "ios-native", caseId: "ios", review: "PASS" };
  });
  assert.equal((await buildReport(forged)).appCoverage.ios.verdict, "UNRUN");
});

async function combinedFixture(t) {
  const options = await fixture(t, manifest => {
    const source = { commit: 'app-source', dirty: false };
    manifest.app = {
      inventory: { version: 1, source, deviceScope: { deviceClass: 'standard-phone', orientation: 'portrait' }, pages: [{ id: 'home', title: 'App 首页', route: '/', group: 'home', scenarios: [{ id: 'initial', title: '首屏' }] }] },
      runs: [{ id: 'shared', platform: 'ios', renderer: 'ios-native', device: 'Phone simulator', os: 'iOS', deviceClass: 'standard-phone', orientation: 'portrait', source, binding: 'run.log' }],
    };
    manifest.cases = [{ id: 'app-case', title: 'App 首屏', renderer: 'ios-native', pageId: 'home', scenarioId: 'initial', runId: 'shared', verdict: 'PASS', exitCode: 0, command: 'native owner', receipt: 'run.log' }];
    manifest.screenshots = [{ id: 'app-screen', title: 'App 首屏', renderer: 'ios-native', caseId: 'app-case', state: 'initial', review: 'PASS', path: 'original.png' }];
  });
  const webDir = path.join(options.directory, 'web');
  await fs.mkdir(webDir);
  await fs.writeFile(path.join(webDir, 'web.png'), png);
  await fs.writeFile(path.join(webDir, 'web.log'), 'Web receipt\n');
  const source = { commit: 'web-source', dirty: false };
  const web = {
    title: 'Web 验收',
    web: {
      inventory: { version: 1, scope: 'web', source, pages: [
        { id: 'home', title: 'Web 首页', route: '/', group: 'home', scenarios: [{ id: 'initial', title: '首屏与整页' }] },
        { id: 'web-only', title: 'Web 独有页面', route: '/web-only', group: 'resources', scenarios: [{ id: 'initial', title: '首屏与整页' }] },
      ] },
      runs: [{ id: 'shared', target: 'desktop', renderer: 'web-desktop', project: 'chromium-desktop', source, sourceVerified: true, viewport: { width: 1280, height: 720 }, browser: 'test Chromium', dataMode: 'contract fixtures', binding: 'web.log' }],
    },
    cases: [{ id: 'web-case', title: 'Web 首屏', renderer: 'web-desktop', pageId: 'home', scenarioId: 'initial', runId: 'shared', verdict: 'PASS', testStatus: 'passed', batchExitCode: 0, command: 'web owner', receipt: 'web.log' }],
    screenshots: ['viewport', 'full-page'].map(capture => ({ id: 'web-' + capture, title: 'Web ' + capture, renderer: 'web-desktop', caseId: 'web-case', pageId: 'home', scenarioId: 'initial', runId: 'shared', state: 'initial', capture, review: 'PASS', path: 'web.png' })),
  };
  const webPath = path.join(webDir, 'manifest.json');
  await fs.writeFile(webPath, JSON.stringify(web));
  return { ...options, manifestPath: [options.manifestPath, webPath] };
}

test('combines Web and App in one tabbed workbench without mixing sources, same-name pages or run bindings', async t => {
  const options = await combinedFixture(t);
  const originals = await Promise.all(options.manifestPath.map(file => fs.readFile(file)));
  const result = await buildReport({ ...options, assetMode: 'directory' });
  assert.equal(result.appCoverage.ios.verdict, 'PASS');
  assert.equal(result.webCoverage.desktop.counts.PASS, 1);
  assert.equal(result.webCoverage.desktop.counts.UNRUN, 1);
  assert.equal(result.webCoverage.mobile.counts.UNRUN, 2);
  const html = await fs.readFile(path.join(options.outputDir, 'index.html'), 'utf8');
  assert(html.includes('data-scope="app"'));
  assert(html.includes('data-scope="web"'));
  assert(!html.includes('<iframe'));
  const dataset = JSON.parse(html.match(/window.REPORT_DATA=([\s\S]*?);<\/script>/)[1]);
  assert.equal(dataset.mode, 'combined-acceptance');
  assert.equal(dataset.scopes.app.pages.length, 1);
  assert.equal(dataset.scopes.web.pages.length, 2);
  assert.equal(dataset.scopes.app.source.commit, 'app-source');
  assert.equal(dataset.scopes.web.source.commit, 'web-source');
  assert.equal(dataset.scopes.app.reports.ios.screenshots.length, 1);
  assert.equal(dataset.scopes.web.reports.desktop.screenshots.length, 2);
  assert.equal(dataset.scopes.app.reports.ios.screenshots[0].pageId, 'home');
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  const inventory = JSON.parse(await fs.readFile(path.join(options.outputDir, 'inventory.json')));
  assert.equal(inventory.version, 2);
  assert.equal(inventory.app.pages.length, 1);
  assert.equal(inventory.web.pages.length, 2);
  const coverage = JSON.parse(await fs.readFile(path.join(options.outputDir, 'coverage.json')));
  assert.equal(coverage.app.ios.pages[0].verdict, 'PASS');
  assert.equal(coverage.web.desktop.pages[0].verdict, 'PASS');
  assert.equal(await fs.readFile(path.join(options.outputDir, 'bindings/app/shared.log'), 'utf8'), 'Original command receipt\n');
  assert.equal(await fs.readFile(path.join(options.outputDir, 'bindings/web/shared.log'), 'utf8'), 'Web receipt\n');
  for (const [index, file] of options.manifestPath.entries()) {
    assert.deepEqual(await fs.readFile(file), originals[index]);
    assert.deepEqual(await fs.readFile(path.join(options.outputDir, `receipts/input-${index ? 'web' : 'app'}.json`)), originals[index]);
  }
  const results = await fs.readFile(path.join(options.outputDir, 'results.md'), 'utf8');
  assert(results.includes('全量 App 页面覆盖') && results.includes('Web 页面覆盖'));
});

test('combined reports reject duplicate IDs and cross-scope associations before creating output', async t => {
  const duplicate = await combinedFixture(t);
  const web = JSON.parse(await fs.readFile(duplicate.manifestPath[1]));
  web.cases[0].id = 'app-case';
  await fs.writeFile(duplicate.manifestPath[1], JSON.stringify(web));
  await assert.rejects(buildReport(duplicate), /duplicate id app-case/);
  await assert.rejects(fs.stat(duplicate.outputDir), { code: 'ENOENT' });
  const invalid = await combinedFixture(t);
  await buildReport(invalid);
  const mixed = JSON.parse(await fs.readFile(path.join(invalid.outputDir, 'manifest.json')));
  mixed.screenshots[0].scope = 'web';
  const mixedPath = path.join(invalid.directory, 'mixed.json');
  await fs.writeFile(mixedPath, JSON.stringify(mixed));
  const invalidOutput = path.join(invalid.directory, 'invalid');
  await assert.rejects(buildReport({ manifestPath: mixedPath, outputDir: invalidOutput }), /case\/scope mismatch/);
  await assert.rejects(fs.stat(invalidOutput), { code: 'ENOENT' });
});
