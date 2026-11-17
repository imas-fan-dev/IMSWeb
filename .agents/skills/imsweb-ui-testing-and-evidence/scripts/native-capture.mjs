import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { sameSource, validateApp } from './app-report-model.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseJSON(value, label = 'JSON input') {
  try { return JSON.parse(value.toString()); }
  catch (cause) { throw new Error(label + ': invalid JSON', { cause }); }
}
export const json = async file => parseJSON(await fs.readFile(file, 'utf8'), file);
export const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
const tool = (name, environment) => environment.tools?.[name] || (name === 'adb' && (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) ? path.join(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT, 'platform-tools/adb') : name === 'maestro' ? process.env.MAESTRO_BIN || name : name);
const readCommand = (file, args, environment) => execFileSync(file, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...environment.env } }).trim();

// Discovery only considers booted emulators/simulators. Never choose a physical device.
export function discoverDevices(platform, environment = {}, { hostPlatform = process.platform, read = readCommand } = {}) {
  if (platform === 'ios') {
    if (hostPlatform !== 'darwin') throw Error('iOS native capture requires a macOS capture host');
    const list = parseJSON(read(tool('xcrun', environment), ['simctl', 'list', 'devices', 'booted', '--json'], environment), 'simctl devices');
    return Object.entries(list.devices).flatMap(([runtime, devices]) => devices.filter(d => d.state === 'Booted' && d.isAvailable !== false && /iPhone/.test(d.deviceTypeIdentifier || d.name)).map(d => ({ id: d.udid, name: d.name + (d.deviceTypeIdentifier ? ' / ' + d.deviceTypeIdentifier.split('.').at(-1) : ''), os: runtime.replace(/^.*SimRuntime\./, '').replaceAll('-', '.') })));
  }
  if (platform !== 'android') throw Error('Unknown platform: ' + platform);
  const adb = tool('adb', environment);
  return readCommand(adb, ['devices', '-l'], environment).split('\n').flatMap(line => {
    const match = /^(emulator-\d+)\s+device\b/.exec(line);
    if (!match) return [];
    const serial = match[1];
    const size = [...readCommand(adb, ['-s', serial, 'shell', 'wm', 'size'], environment).matchAll(/(\d+)x(\d+)/g)].at(-1);
    const density = Number([...readCommand(adb, ['-s', serial, 'shell', 'wm', 'density'], environment).matchAll(/\d+/g)].at(-1)?.[0]);
    const shortDp = size && Math.min(Number(size[1]), Number(size[2])) * 160 / density;
    if (!shortDp || shortDp < 350 || shortDp >= 600) return [];
    return [{ id: serial, name: readCommand(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.model'], environment), os: 'Android ' + readCommand(adb, ['-s', serial, 'shell', 'getprop', 'ro.build.version.release'], environment), shortDp }];
  });
}

export function chooseDevice(devices, requested) {
  const matches = requested ? devices.filter(d => d.id === requested) : devices;
  if (matches.length !== 1) throw Error(requested ? `Booted phone simulator not uniquely found: ${requested}` : `Expected one booted phone simulator, found ${matches.length}; select its device ID in the environment file`);
  return matches[0];
}

// Commands are argv arrays, never shell strings. Logs and the real signal/timeout survive failures.
export async function execute({ file, args, cwd, environment = {}, timeoutMs = 60000, stdoutPath, stderrPath, signal: abortSignal }) {
  const start = new Date().toISOString();
  const stdout = await fs.open(stdoutPath, 'wx'), stderr = await fs.open(stderrPath, 'wx');
  let timedOut = false, error, timer, killTimer, abort;
  try {
    const child = spawn(file, args, { cwd, env: { ...process.env, ...environment.env, MAESTRO_CLI_NO_ANALYTICS: 'true', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' }, stdio: ['ignore', stdout.fd, stderr.fd], detached: process.platform !== 'win32' });
    const kill = signal => { try { if (process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch {} };
    abort = () => { kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1000); };
    abortSignal?.addEventListener('abort', abort, { once: true });
    if (abortSignal?.aborted) abort();
    timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1000); }, timeoutMs);
    const result = await new Promise(resolve => {
      child.on('error', e => { error = e.message; });
      child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    return { command: { file, args }, cwd, startedAt: start, finishedAt: new Date().toISOString(), ...result, timedOut, ...(error ? { error } : {}), stdoutPath, stderrPath };
  } finally { clearTimeout(timer); clearTimeout(killTimer); if (abort) abortSignal?.removeEventListener('abort', abort); await stdout.close(); await stderr.close(); }
}

export function validatePlan(plan, manifest) {
  if (plan.version !== 1 || !Array.isArray(plan.targets) || !Array.isArray(plan.scenarios) || !plan.targets.length || !plan.scenarios.length) throw Error('Plan version 1 requires targets and scenarios');
  validateApp(manifest.app, [], []);
  for (const key of ['targets', 'scenarios']) if (new Set(plan[key].map(v => v.id)).size !== plan[key].length || plan[key].some(v => !id(v.id))) throw Error('Invalid or duplicate ' + key + ' IDs');
  for (const target of plan.targets) {
    if (!['ios', 'android'].includes(target.platform) || !/^[A-Za-z0-9._-]+$/.test(target.appId || '') || !target.dataMode?.trim() || /填写/.test(target.dataMode)) throw Error('Target requires platform, appId and explicit dataMode');
  }
  for (const scene of plan.scenarios) {
    const page = manifest.app.inventory.pages.find(p => p.id === scene.pageId);
    if (!page?.scenarios.some(s => s.id === scene.scenarioId) || typeof scene.flow !== 'string' || !scene.flow || (scene.platforms && (!Array.isArray(scene.platforms) || scene.platforms.some(p => !['ios', 'android'].includes(p))))) throw Error('Invalid scenario association or flow: ' + scene.id);
    if (scene.timeoutMs !== undefined && (!Number.isInteger(scene.timeoutMs) || scene.timeoutMs < 100 || scene.timeoutMs > 600000)) throw Error('Scenario timeoutMs must be 100..600000');
  }
}

async function installedHash(target, device, environment) {
  if (target.platform === 'android') {
    const adb = tool('adb', environment), prefix = ['-s', device.id, 'shell'];
    const apk = readCommand(adb, [...prefix, 'pm', 'path', target.appId], environment).split('\n').find(p => p.startsWith('package:'))?.slice(8);
    if (!apk) throw Error('Installed APK not found');
    return readCommand(adb, [...prefix, 'sha256sum', apk], environment).split(/\s+/)[0];
  }
  const app = readCommand(tool('xcrun', environment), ['simctl', 'get_app_container', device.id, target.appId, 'app'], environment);
  const binary = readCommand('plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(app, 'Info.plist')], environment);
  if (binary !== path.basename(binary)) throw Error('Invalid bundle executable');
  return sha256(await fs.readFile(path.join(app, binary)));
}

export async function capturePlan({ planPath, outputDir, environment = {}, platforms, discover = discoverDevices, run = execute, verifyInstalled = installedHash }) {
  const base = path.dirname(path.resolve(planPath)), plan = await json(planPath);
  const manifestPath = path.resolve(base, plan.manifest), manifestBytes = await fs.readFile(manifestPath), manifest = parseJSON(manifestBytes, 'Native manifest');
  validatePlan(plan, manifest);
  const targets = plan.targets.filter(t => !platforms || platforms.includes(t.platform));
  if (!targets.length) throw Error('No selected targets');
  const output = path.resolve(outputDir);
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output);
  const capture = { version: 1, id: 'capture-' + randomUUID().slice(0, 8), host: { platform: process.platform, hostname: os.hostname() }, inventory: manifest.app.inventory, inputManifestSha256: sha256(manifestBytes), startedAt: new Date().toISOString(), runs: [], cases: [], screenshots: [] };
  const checkpoint = () => fs.writeFile(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  await checkpoint();
  for (const target of targets) {
    const targetDir = path.join(output, target.id); await fs.mkdir(targetDir);
    const runId = capture.id + '-' + target.id;
    const native = { id: runId, renderer: target.platform + '-native', platform: target.platform, source: manifest.app.inventory.source, device: '未知', os: '未知', deviceClass: 'standard-phone', orientation: 'portrait', profile: target.profile || 'unknown', dataMode: target.dataMode };
    capture.runs.push(native);
    let setupError, device;
    try {
      device = chooseDevice(discover(target.platform, environment), environment.devices?.[target.id] || target.deviceId);
      native.device = device.name + ' / ' + device.id; native.os = device.os;
      const bindingPath = environment.bindings?.[target.id] || target.binding;
      if (bindingPath) {
        const binding = await json(path.resolve(base, bindingPath));
        if (!sameSource(manifest.app.inventory.source, binding.source) || !/^[a-f0-9]{64}$/.test(binding.binarySha256 || '')) throw Error('Binding requires matching source and binarySha256 (APK on Android, executable on iOS)');
        const actual = await verifyInstalled(target, device, environment);
        if (actual !== binding.binarySha256) throw Error('Installed binary differs from the source/build binding');
        native.binding = target.id + '/binding.json';
        await save(path.join(output, native.binding), { ...binding, installedBinarySha256: actual, verifiedAt: new Date().toISOString(), deviceId: device.id });
      }
      const launch = target.platform === 'android' ? { file: tool('adb', environment), args: ['-s', device.id, 'shell', 'monkey', '-p', target.appId, '-c', 'android.intent.category.LAUNCHER', '1'] } : { file: tool('xcrun', environment), args: ['simctl', 'launch', device.id, target.appId] };
      const receipt = await run({ ...launch, cwd: base, environment, timeoutMs: 20000, stdoutPath: path.join(targetDir, 'launch.stdout.log'), stderrPath: path.join(targetDir, 'launch.stderr.log') });
      await save(path.join(targetDir, 'launch.json'), receipt);
      if (receipt.exitCode !== 0 || receipt.timedOut) throw Error('Native launch failed; see launch.json');
    } catch (error) { setupError = error.message; }
    for (const scene of plan.scenarios.filter(s => !s.platforms || s.platforms.includes(target.platform))) {
      const caseId = runId + '-' + scene.id, caseDir = path.join(targetDir, scene.id); await fs.mkdir(caseDir);
      const declared = manifest.app.inventory.pages.find(p => p.id === scene.pageId).scenarios.find(s => s.id === scene.scenarioId);
      const item = { id: caseId, title: scene.title || scene.id, renderer: native.renderer, pageId: scene.pageId, scenarioId: scene.scenarioId, runId, required: scene.required ?? declared.required ?? true, verdict: 'BLOCKED', exitCode: null, reason: setupError || '尚未执行', receipt: target.id + '/' + scene.id + '/receipt.json' };
      const receipt = { caseId, startedAt: new Date().toISOString(), commands: [], source: native.source, setupError };
      if (!setupError) {
        try {
          const sourceFlow = path.resolve(base, scene.flow), sourceBytes = await fs.readFile(sourceFlow);
          const text = sourceBytes.toString('utf8').replaceAll('{{appId}}', JSON.stringify(target.appId));
          if (/\{\{[^}]+\}\}/.test(text)) throw Error('Unresolved flow template parameter');
          receipt.flow = { path: sourceFlow, sha256: sha256(sourceBytes) };
          const flow = path.join(caseDir, 'flow.yaml'); await fs.writeFile(flow, text, { flag: 'wx' });
          const command = { file: tool('maestro', environment), args: ['--device=' + device.id, 'test', flow, '--debug-output=' + path.join(caseDir, 'debug'), '--test-output-dir=' + path.join(caseDir, 'artifacts'), '--format=JUNIT', '--output=' + path.join(caseDir, 'junit.xml')] };
          const result = await run({ ...command, cwd: base, environment, timeoutMs: scene.timeoutMs || 90000, stdoutPath: path.join(caseDir, 'flow.stdout.log'), stderrPath: path.join(caseDir, 'flow.stderr.log') });
          receipt.commands.push(result); item.command = JSON.stringify(command); item.exitCode = result.exitCode;
          let junit = ''; try { junit = await fs.readFile(path.join(caseDir, 'junit.xml'), 'utf8'); } catch {}
          item.verdict = /<failure(?:\s|\/?>)/.test(junit) ? 'REWORK' : result.exitCode === 0 && !result.timedOut ? 'PASS' : 'BLOCKED';
          item.reason = item.verdict === 'PASS' ? 'Maestro场景命令通过；原生截图待独立视觉复核。' : result.timedOut ? '场景命令超时；日志与信号已保留。' : '场景命令失败；参见原始日志与JUnit。';
        } catch (error) { item.verdict = 'BLOCKED'; item.reason = error.message; }
        // A failed flow still gets a diagnostic capture. A failed capture never grants PASS.
        try {
          const imagePath = path.join(caseDir, 'screen.png');
          const command = target.platform === 'android' ? { file: tool('adb', environment), args: ['-s', device.id, 'exec-out', 'screencap', '-p'], stdoutPath: imagePath } : { file: tool('xcrun', environment), args: ['simctl', 'io', device.id, 'screenshot', '--type=png', imagePath], stdoutPath: path.join(caseDir, 'capture.stdout.log') };
          const result = await run({ ...command, cwd: base, environment, timeoutMs: 20000, stderrPath: path.join(caseDir, 'capture.stderr.log') });
          receipt.commands.push(result);
          const bytes = await fs.readFile(imagePath);
          if (result.exitCode !== 0 || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Native PNG capture failed');
          if (bytes.readUInt32BE(16) >= bytes.readUInt32BE(20)) { item.verdict = 'BLOCKED'; item.reason = '实际截图不是默认竖屏范围；未自动旋转或扩大验收范围。'; native.orientation = 'landscape'; }
          capture.screenshots.push({ id: caseId + '-screen', caseId, title: item.title, renderer: item.renderer, pageId: item.pageId, scenarioId: item.scenarioId, runId, path: path.relative(output, imagePath), sha256: sha256(bytes), state: scene.scenarioId, kind: item.verdict === 'PASS' ? 'runtime' : 'diagnostic', review: 'NOT_REVIEWED', note: '脚本采集的原始原生截图；执行结果与视觉审阅分别保留。' });
        } catch (error) { receipt.captureError = error.message; if (item.verdict === 'PASS') { item.verdict = 'BLOCKED'; item.reason = error.message; } }
      }
      receipt.finishedAt = new Date().toISOString(); receipt.verdict = item.verdict; receipt.exitCode = item.exitCode; receipt.reason = item.reason;
      await save(path.join(output, item.receipt), receipt); capture.cases.push(item); await checkpoint();
    }
  }
  capture.finishedAt = new Date().toISOString(); await checkpoint();
  return { outputDir: output, capture, passed: capture.cases.every(c => c.verdict === 'PASS') };
}
