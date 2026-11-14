import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { capturePlan, chooseDevice, discoverDevices, execute, json } from './native-capture.mjs';
import { collectEvidence, applyReviews } from './ui-evidence.mjs';
import { buildReport } from './build-ui-report.mjs';
import { parseArgs } from './ui-acceptance.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAgCAIAAACU62+bAAAAIElEQVR4nGP8//8/AymAiSTVoxpGNYxqGNUwqmGIagAAEuMDPdmnbvsAAAAASUVORK5CYII=', 'base64');
async function fixture(t, fail = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-capture-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const inventory = { version: 1, source: { commit: 'test-source', dirty: false }, deviceScope: { deviceClass: 'standard-phone', orientation: 'portrait' }, pages: [{ id: 'home', title: 'Home', route: '/', group: 'home', scenarios: [{ id: 'initial', title: 'Initial', required: true }] }] };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ title: 'Test fixture', app: { inventory, runs: [] }, cases: [], screenshots: [] }));
  await fs.writeFile(path.join(dir, 'binding.json'), JSON.stringify({ source: inventory.source, binarySha256: 'a'.repeat(64) }));
  await fs.writeFile(path.join(dir, 'flow.yaml'), 'appId: {{appId}}\n---\n- assertVisible: "Home"\n');
  const plan = { version: 1, manifest: 'manifest.json', targets: [{ id: 'android', platform: 'android', appId: 'test.app', dataMode: 'test fixture', binding: 'binding.json' }], scenarios: [{ id: 'home', title: 'Home', pageId: 'home', scenarioId: 'initial', flow: 'flow.yaml' }] };
  const planPath = path.join(dir, 'plan.json'); await fs.writeFile(planPath, JSON.stringify(plan));
  const run = async request => {
    const flow = request.args.includes('test');
    if (flow) {
      assert.match(await fs.readFile(request.args[2], 'utf8'), /appId: "test.app"/);
      if (fail) await fs.writeFile(request.args.find(a => a.startsWith('--output=')).slice(9), '<testsuite><testcase><failure message="expected state"/></testcase></testsuite>');
    }
    await fs.writeFile(request.stdoutPath, request.args.includes('screencap') ? png : 'original stdout');
    await fs.writeFile(request.stderrPath, 'original stderr');
    return { command: { file: request.file, args: request.args }, cwd: request.cwd, exitCode: flow && fail ? 1 : 0, signal: null, timedOut: false, stdoutPath: request.stdoutPath, stderrPath: request.stderrPath };
  };
  const capture = output => capturePlan({ planPath, outputDir: path.join(dir, output), discover: () => [{ id: 'emulator-1234', name: 'Test phone', os: 'Android test' }], verifyInstalled: async () => 'a'.repeat(64), run });
  return { dir, inventory, plan, planPath, capture };
}

test('capture/collect/review preserves execution and only promotes hash-bound visual evidence', async t => {
  const f = await fixture(t), result = await f.capture('capture');
  assert.equal(result.capture.cases[0].verdict, 'PASS');
  assert.equal(result.capture.screenshots[0].review, 'NOT_REVIEWED');
  const frozen = await fs.readFile(path.join(result.outputDir, 'capture.json'));
  const collected = await collectEvidence({ captures: [path.join(result.outputDir, 'capture.json')], outputDir: path.join(f.dir, 'collected') });
  const draft = await buildReport({ manifestPath: collected.manifestPath, outputDir: path.join(f.dir, 'draft'), assetMode: 'directory' });
  assert.equal(draft.appCoverage.android.counts.UNRUN, 1);
  const queue = await json(path.join(f.dir, 'collected/review-queue.json'));
  const annotation = { version: 1, manifestSha256: queue.manifestSha256, reviewer: { id: 'test-reviewer', model: 'human-test', method: 'direct-image-review' }, images: queue.images.map(i => ({ id: i.id, sha256: i.sha256, review: 'PASS', note: 'Directly reviewed test image' })), notes: [{ caseId: result.capture.cases[0].id, text: 'Fixture only' }] };
  const annotationsPath = path.join(f.dir, 'review.json'); await fs.writeFile(annotationsPath, JSON.stringify(annotation));
  const revision = await applyReviews({ manifestPath: collected.manifestPath, annotationsPath, outputDir: path.join(f.dir, 'reviewed') });
  const reviewed = await json(revision.manifestPath), original = await json(collected.manifestPath);
  assert.equal(reviewed.cases[0].verdict, original.cases[0].verdict);
  assert.equal(reviewed.cases[0].exitCode, original.cases[0].exitCode);
  assert.equal(reviewed.screenshots[0].reviewHistory[0].reviewer.id, 'test-reviewer');
  assert.deepEqual(await fs.readFile(path.join(result.outputDir, 'capture.json')), frozen);
  const final = await buildReport({ manifestPath: revision.manifestPath, outputDir: path.join(f.dir, 'final'), assetMode: 'directory' });
  assert.equal(final.appCoverage.android.counts.PASS, 1);
  const html = await fs.readFile(path.join(f.dir, 'final/index.html'), 'utf8');
  assert.ok(html.includes('originals/')); assert.ok(!html.includes('data:image/png;base64,'));
});

test('all attempts survive collection; later PASS cannot erase a failed scenario', async t => {
  const f = await fixture(t, true), failed = await f.capture('failed');
  const other = await fixture(t), passed = await other.capture('passed');
  const c = await collectEvidence({ captures: [path.join(failed.outputDir, 'capture.json'), path.join(passed.outputDir, 'capture.json')], outputDir: path.join(f.dir, 'all') });
  const manifest = await json(c.manifestPath);
  assert.equal(manifest.cases.length, 2); assert.equal(manifest.cases[0].verdict, 'REWORK'); assert.equal(manifest.cases[1].verdict, 'PASS');
  const report = await buildReport({ manifestPath: c.manifestPath, outputDir: path.join(f.dir, 'report'), assetMode: 'directory' });
  assert.equal(report.appCoverage.android.counts.REWORK, 1);
  await assert.rejects(collectEvidence({ captures: [path.join(failed.outputDir, 'capture.json'), path.join(failed.outputDir, 'capture.json')], outputDir: path.join(f.dir, 'duplicate') }), /Duplicate/);
});

test('changed image, stale manifest and text-only approval are rejected', async t => {
  const f = await fixture(t), r = await f.capture('capture'), c = await collectEvidence({ captures: [path.join(r.outputDir, 'capture.json')], outputDir: path.join(f.dir, 'collection') });
  const queue = await json(path.join(f.dir, 'collection/review-queue.json'));
  const annotation = { version: 1, manifestSha256: queue.manifestSha256, reviewer: { id: 'reviewer', model: 'test', method: 'text-only' }, images: [{ id: queue.images[0].id, sha256: queue.images[0].sha256, review: 'PASS', note: 'not inspected' }], notes: [] };
  const file = path.join(f.dir, 'annotation.json'); await fs.writeFile(file, JSON.stringify(annotation));
  await assert.rejects(applyReviews({ manifestPath: c.manifestPath, annotationsPath: file, outputDir: path.join(f.dir, 'bad') }), /Text-only/);
  annotation.reviewer.method = 'direct-image-review'; annotation.manifestSha256 = 'old'; await fs.writeFile(file, JSON.stringify(annotation));
  await assert.rejects(applyReviews({ manifestPath: c.manifestPath, annotationsPath: file, outputDir: path.join(f.dir, 'stale') }), /exact manifest/);
  annotation.manifestSha256 = queue.manifestSha256; await fs.writeFile(file, JSON.stringify(annotation));
  const manifest = await json(c.manifestPath); await fs.appendFile(path.resolve(path.dirname(c.manifestPath), manifest.screenshots[0].path), 'changed');
  await assert.rejects(applyReviews({ manifestPath: c.manifestPath, annotationsPath: file, outputDir: path.join(f.dir, 'changed') }), /stale image/);
});

test('device ambiguity, missing tools and timeouts stay explicit', async t => {
  assert.throws(() => chooseDevice([{ id: 'a' }, { id: 'b' }]), /found 2/);
  assert.deepEqual(chooseDevice([{ id: 'a' }, { id: 'b' }], 'b'), { id: 'b' });
  const f = await fixture(t);
  const result = await capturePlan({ planPath: f.planPath, outputDir: path.join(f.dir, 'blocked'), discover: () => { throw Error('device unavailable'); } });
  assert.equal(result.capture.cases[0].verdict, 'BLOCKED'); assert.equal(result.capture.cases[0].exitCode, null);
  const command = await execute({ file: process.execPath, args: ['-e', 'process.stdout.write("started");setInterval(()=>{},1000)'], cwd: f.dir, timeoutMs: 500, stdoutPath: path.join(f.dir, 'stdout'), stderrPath: path.join(f.dir, 'stderr') });
  assert.equal(command.timedOut, true); assert.notEqual(command.exitCode, 0); assert.match(await fs.readFile(path.join(f.dir, 'stdout'), 'utf8'), /started/);
  assert.throws(() => parseArgs(['capture', '--plan']), /Missing value/);
  assert.throws(() => parseArgs(['devices', '--platform', 'desktop']), /Platform/);
});

test('CLI also executes through a symlink, including macOS /tmp paths', async t => {
  const f = await fixture(t), link = path.join(f.dir, 'acceptance.mjs');
  await fs.symlink(fileURLToPath(new URL('./ui-acceptance.mjs', import.meta.url)), link);
  const output = execFileSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
  assert.match(output, /ui-acceptance.mjs <command>/);
});

test('iOS discovers renamed phone simulators by device type and excludes tablets', () => {
  const list = { devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
    { udid: 'phone', name: 'Task-Owned-01', state: 'Booted', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro' },
    { udid: 'tablet', name: 'iPhone tests on tablet', state: 'Booted', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro' },
    { udid: 'off', name: 'Off', state: 'Shutdown', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro' },
  ] } };
  const devices = discoverDevices('ios', {}, { hostPlatform: 'darwin', read: () => JSON.stringify(list) });
  assert.deepEqual(devices.map(d => d.id), ['phone']);
  assert.match(devices[0].name, /Task-Owned-01.*iPhone-17-Pro/);
});
