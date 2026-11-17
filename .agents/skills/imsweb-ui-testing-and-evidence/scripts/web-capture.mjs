import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execute, json, parseJSON, save, sha256 } from './native-capture.mjs';
import { snapshotSource } from './source-identity.mjs';
import { sameSource } from './app-report-model.mjs';
import { validateWeb, webTargets } from './web-report-model.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
function siteOrigin(value) {
  try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('HTTP origin required'); return parsed.origin; }
  catch (cause) { throw new Error('Invalid Web origin', { cause }); }
}
export function validateWebPlan(plan, manifest) {
  if (plan.version !== 1 || plan.scope !== 'web' || !Array.isArray(plan.targets) || !plan.targets.length || !Array.isArray(plan.scenarios) || !plan.scenarios.length) throw Error('Web plan requires version, targets and scenarios');
  validateWeb(manifest.web, [], []);
  if (new Set(plan.targets.map(t => t.id)).size !== plan.targets.length || plan.targets.some(t => !webTargets.some(p => p.id === t.id && p.project === t.project))) throw Error('Select existing chromium-desktop / chromium-mobile projects');
  if (new Set(plan.scenarios.map(s => s.id)).size !== plan.scenarios.length) throw Error('Duplicate Web scenario IDs');
  for (const scene of plan.scenarios) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(scene.id) || !scene.recipe || !manifest.web.inventory.pages.some(p => p.id === scene.pageId && p.route === scene.path && p.scenarios.some(s => s.id === scene.scenarioId))) throw Error('Invalid Web scene association/path');
  }
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

export async function captureWebPlan({ planPath, outputDir, environment = {}, target, root = repo }) {
  const base = path.dirname(path.resolve(planPath)), plan = await json(planPath);
  const manifest = await json(path.resolve(base, plan.manifest)); validateWebPlan(plan, manifest);
  const targets = plan.targets.filter(t => !target || t.id === target);
  if (!targets.length) throw Error('No selected Web target');
  const before = await snapshotSource(root);
  if (!sameSource(manifest.web.inventory.source, before.source)) throw Error('Workspace source changed after init; create a fresh Web plan before capture');
  const output = path.resolve(outputDir); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output); await fs.mkdir(path.join(output, 'browser'));
  const capture = { version: 1, scope: 'web', id: 'capture-' + randomUUID().slice(0, 8), host: { platform: process.platform, hostname: os.hostname() }, inventory: manifest.web.inventory, startedAt: new Date().toISOString(), runs: [], cases: [], screenshots: [] };
  const checkpoint = () => fs.writeFile(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  await checkpoint();
  const control = new AbortController(), pnpm = environment.tools?.pnpm || 'pnpm';
  let server, serverResult, batch, setupError;
  const external = environment.env?.E2E_BASE_URL || process.env.E2E_BASE_URL;
  const origin = external || 'http://127.0.0.1:' + await unusedPort();
  const actualOrigin = siteOrigin(origin);
  const env = { ...environment, env: { ...environment.env, VITE_IMS_APP_TARGET: 'web', E2E_UI_TIER: 'core', E2E_BASE_URL: origin, IMS_UI_CAPTURE_PLAN: path.resolve(planPath), IMS_UI_CAPTURE_RESULTS: path.join(output, 'browser/results.jsonl') } };
  try {
    if (!external) {
      const port = new URL(origin).port;
      const serverEnvironment = { ...env, env: { ...env.env, IMS_API_ORIGIN: 'http://127.0.0.1:65534' } };
      server = execute({ file: pnpm, args: ['--filter', '@imsweb/web', 'run', 'dev', '--host', '127.0.0.1', '--port', port, '--strictPort'], cwd: root, environment: serverEnvironment, timeoutMs: 600000, signal: control.signal, stdoutPath: path.join(output, 'browser/server.stdout.log'), stderrPath: path.join(output, 'browser/server.stderr.log') }).then(r => { serverResult = r; return r; });
      const deadline = Date.now() + 120000;
      while (true) {
        if (serverResult) throw Error('Owned Web server exited before readiness; see server logs');
        try { const response = await fetch(origin, { signal: AbortSignal.timeout(2000) }); await response.body?.cancel(); if (response.ok) break; } catch {}
        if (Date.now() >= deadline) throw Error('Owned Web server readiness timed out');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    const reporter = fileURLToPath(new URL('./web-capture-reporter.mjs', import.meta.url));
    const command = { file: pnpm, args: ['--filter', '@imsweb/web', 'run', 'test:e2e', 'ui-capture.spec.ts', ...targets.map(t => '--project=' + t.project), '--workers=1', '--retries=0', '--reporter=' + reporter, '--output=' + path.join(output, 'browser/playwright')] };
    batch = await execute({ ...command, cwd: root, environment: env, timeoutMs: Math.min(600000, 120000 + targets.length * plan.scenarios.length * 30000), stdoutPath: path.join(output, 'browser/batch.stdout.log'), stderrPath: path.join(output, 'browser/batch.stderr.log') });
    await save(path.join(output, 'browser/batch.json'), batch);
  } catch (error) { setupError = error.message; }
  finally { control.abort(); if (server) await save(path.join(output, 'browser/server.json'), { ...await server, stoppedByOwner: true }); }
  const after = await snapshotSource(root), sourceUnchanged = sameSource(before.source, after.source);
  let results = [];
  try { results = (await fs.readFile(path.join(output, 'browser/results.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => parseJSON(line, 'Playwright result')); } catch (error) { setupError ||= 'Playwright did not emit complete capture results: ' + error.message; }
  for (const t of targets) {
    const meta = results.find(r => r.project === t.project && r.metadata)?.metadata;
    const runId = capture.id + '-' + t.id;
    capture.runs.push({ id: runId, target: t.id, project: t.project, renderer: 'web-' + t.id, source: before.source, sourceVerified: !external && sourceUnchanged && !!meta, viewport: meta?.viewport || null, browser: meta?.browser || '未启动', device: meta ? `${meta.viewport.width} × ${meta.viewport.height} · ${t.project}` : '未启动', os: os.platform(), profile: t.project, dataMode: '现有契约校验的Playwright fixtures；不代表真实后端数据', origin: meta?.origin || actualOrigin, externalOrigin: !!external });
    for (const scene of plan.scenarios) {
      const attempts = results.filter(r => r.project === t.project && r.id === scene.id);
      if (!attempts.length) attempts.push({ status: 'interrupted', retry: 0, errors: [setupError || 'Scenario did not produce a terminal receipt'] });
      for (const attempt of attempts) {
        const caseId = runId + '-' + scene.id + '-r' + attempt.retry, folder = 'browser/' + caseId;
        await fs.mkdir(path.join(output, folder));
        const verdict = attempt.status === 'passed' ? 'PASS' : attempt.status === 'failed' && !attempt.errors?.some(e => /dispatcher|unregistered|contract|fixture/i.test(e)) ? 'REWORK' : 'BLOCKED';
        const item = { id: caseId, title: scene.title || scene.id, renderer: 'web-' + t.id, pageId: scene.pageId, scenarioId: scene.scenarioId, runId, required: true, verdict, exitCode: null, batchExitCode: batch?.exitCode ?? null, testStatus: attempt.status, command: batch ? JSON.stringify(batch.command) : 'Web准备阶段未完成', reason: verdict === 'PASS' ? 'Playwright断言和fixture清理通过；首屏及完整页面待视觉复核。' : attempt.errors?.join('\n') || 'Playwright未通过', expectedCaptures: ['viewport', 'full-page'], receipt: folder + '/receipt.json' };
        await save(path.join(output, item.receipt), { ...attempt, command: batch || null, setupError, sourceBefore: before.source, sourceAfter: after.source, sourceUnchanged });
        for (const attachment of attempt.attachments || []) {
          if (!['ui-viewport', 'ui-full-page', 'ui-diagnostic'].includes(attachment.name)) continue;
          const bytes = attachment.body ? Buffer.from(attachment.body, 'base64') : await fs.readFile(attachment.path);
          const imageId = caseId + '-' + attachment.name, imagePath = folder + '/' + attachment.name + '.png';
          await fs.writeFile(path.join(output, imagePath), bytes, { flag: 'wx' });
          capture.screenshots.push({ id: imageId, caseId, title: item.title + (attachment.name === 'ui-full-page' ? ' · 完整页面' : ' · 首屏'), renderer: item.renderer, pageId: item.pageId, scenarioId: item.scenarioId, runId, path: imagePath, sha256: sha256(bytes), state: scene.scenarioId, capture: attachment.name.slice(3), kind: verdict === 'PASS' && attachment.name !== 'ui-diagnostic' ? 'runtime' : 'diagnostic', review: 'NOT_REVIEWED', note: '常规Web截图，桌面与移动响应式布局独立采集；fixtures来源，未经自动视觉批准。' });
        }
        if (item.verdict === 'PASS' && !item.expectedCaptures.every(kind => capture.screenshots.some(i => i.caseId === caseId && i.capture === kind))) { item.verdict = 'BLOCKED'; item.reason = 'Missing expected viewport or full-page PNG attachment'; }
        capture.cases.push(item); await checkpoint();
      }
    }
  }
  capture.finishedAt = new Date().toISOString(); await checkpoint();
  return { outputDir: output, capture, passed: batch?.exitCode === 0 && sourceUnchanged && capture.cases.every(c => c.verdict === 'PASS') };
}
