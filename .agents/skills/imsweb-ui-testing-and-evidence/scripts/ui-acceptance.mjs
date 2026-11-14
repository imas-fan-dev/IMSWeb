import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { capturePlan, discoverDevices, json, save } from './native-capture.mjs';
import { collectEvidence, applyReviews } from './ui-evidence.mjs';
import { createAppInventory } from './create-app-inventory.mjs';
import { buildReport } from './build-ui-report.mjs';
import { snapshotSource } from './source-identity.mjs';
import { createWebInventory, webTargets } from './web-report-model.mjs';
import { captureWebPlan } from './web-capture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const help = `ui-acceptance.mjs <command> [options]
  init     --output <new-plan-directory> [--scope app|web]
  devices  --platform ios|android [--environment local.json]
  capture  --plan plan.json --output <new-capture-directory> [--platform ios|android] [--environment local.json]
  collect  --capture host-a/capture.json [--capture host-b/capture.json] --output <new-collection-directory>
  run      --plan plan.json --output <new-run-directory> [--platform ios|android] [--environment local.json]
  report   --manifest manifest.json --output <new-report-directory> [--overview]
  review   --manifest manifest.json --annotations llm.json --output <new-revision-directory>
Web capture/run: --plan <web-plan> [--target desktop|mobile]; defaults to both existing Web projects.
Capture/collect/run do not call an LLM. run and collect generate portable reports and review queues.
Review imports only hash-bound image reviews and notes; original execution facts stay unchanged.
Use installed simulator packages; build/install separately through pnpm run app.
`;

export function parseArgs(argv) {
  const [command, ...args] = argv, options = { captures: [] };
  const allowed = {
    init: ['output', 'scope'], devices: ['platform', 'environment'], capture: ['plan', 'output', 'platform', 'target', 'environment'],
    collect: ['capture', 'output'], run: ['plan', 'output', 'platform', 'target', 'environment'],
    report: ['manifest', 'output', 'overview'], review: ['manifest', 'annotations', 'output'],
  };
  if (!allowed[command]) throw Error(help);
  for (let i = 0; i < args.length; i++) {
    const name = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed[command].includes(name)) throw Error('Unknown option: ' + args[i]);
    if (name === 'overview') { options.overview = true; continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw Error('Missing value: --' + name);
    if (name === 'capture') options.captures.push(value);
    else { if (options[name]) throw Error('Duplicate option: --' + name); options[name] = value; }
  }
  const required = { init: ['output'], devices: ['platform'], capture: ['plan', 'output'], collect: ['output'], run: ['plan', 'output'], report: ['manifest', 'output'], review: ['manifest', 'annotations', 'output'] }[command];
  for (const name of required) if (!options[name]) throw Error('--' + name + ' required');
  if (options.platform && !['ios', 'android'].includes(options.platform)) throw Error('Platform must be ios or android');
  if (options.scope && !['app', 'web'].includes(options.scope)) throw Error('Scope must be app or web');
  if (options.target && !['desktop', 'mobile'].includes(options.target)) throw Error('Web target must be desktop or mobile');
  return { command, options };
}

async function environmentFrom(file) {
  if (!file) return {};
  const environment = await json(file), base = path.dirname(path.resolve(file));
  for (const section of ['tools', 'bindings']) for (const [key, value] of Object.entries(environment[section] || {})) {
    if (typeof value !== 'string') throw Error('Environment paths must be strings');
    if (section === 'bindings' || value.includes('/') || value.includes('\\')) environment[section][key] = path.resolve(base, value);
  }
  return environment;
}

async function initPlan(outputDir, scope = 'app') {
  const directory = path.resolve(outputDir);
  const { source, files: entries } = await snapshotSource(root);
  const { routeDescriptors } = await import(pathToFileURL(path.join(root, 'apps/web/app/route-metadata.ts')).href);
  const inventory = scope === 'web' ? createWebInventory(routeDescriptors, source) : createAppInventory(routeDescriptors, source);
  await fs.mkdir(path.dirname(directory), { recursive: true }); await fs.mkdir(directory); await fs.mkdir(path.join(directory, 'flows'));
  await save(path.join(directory, 'source.json'), { source, files: entries });
  if (scope === 'web') {
    await save(path.join(directory, 'manifest.json'), { title: 'IMSWeb Web 页面与响应式布局验收', source, web: { inventory, runs: [] }, cases: [], screenshots: [] });
    const recipes = ['home', 'about', 'events', 'recommendations', 'live', 'community', 'works', 'wiki'];
    await save(path.join(directory, 'plan.json'), { version: 1, scope: 'web', manifest: 'manifest.json', targets: webTargets, scenarios: recipes.map(id => ({ id: id + '-initial', pageId: id, scenarioId: 'initial', recipe: id, path: inventory.pages.find(p => p.id === id).route, title: inventory.pages.find(p => p.id === id).title })) });
    await save(path.join(directory, 'environment.example.json'), { tools: {}, env: {} });
    return { directory, scope, pages: inventory.pages.length, configuredScenarios: recipes.length, projects: webTargets.map(t => t.project), source, note: '普通桌面Web和正常尺寸移动Web；复用已有Playwright presets与契约fixtures。每场景采集首屏和完整页面；其他路由保持未执行。默认启动任务自有临时端口服务。' };
  }
  await save(path.join(directory, 'manifest.json'), { title: 'IMSWeb App 批量截图验收', source, app: { inventory, runs: [] }, cases: [], screenshots: [] });
  const scenarios = [
    { id: 'home-initial', title: '首页首屏', pageId: 'home', tab: '首页', expected: 'THE iDOLM@STER' },
    { id: 'community-initial', title: '社区首屏', pageId: 'community', tab: '社区', expected: '制作人社区' },
    { id: 'apps-initial', title: '资料目录首屏', pageId: 'apps', tab: '资料', expected: '剧情站' },
  ];
  for (const s of scenarios) await fs.writeFile(path.join(directory, 'flows', s.id + '.yaml'), `appId: {{appId}}\n---\n- tapOn: ${JSON.stringify(s.tab)}\n- assertVisible: ${JSON.stringify(s.expected)}\n`, { flag: 'wx' });
  await save(path.join(directory, 'plan.json'), { version: 1, manifest: 'manifest.json', targets: [
    { id: 'android', platform: 'android', appId: 'top.idol_master.imsweb.debug', profile: 'debug', dataMode: '填写实际后端或fixture来源' },
    { id: 'ios', platform: 'ios', appId: 'top.idol-master.imsweb', profile: 'debug', dataMode: '填写实际后端或fixture来源' },
  ], scenarios: scenarios.map(({ tab, expected, ...s }) => ({ ...s, scenarioId: 'initial', flow: 'flows/' + s.id + '.yaml' })) });
  await save(path.join(directory, 'environment.example.json'), { tools: { maestro: 'maestro' }, devices: {}, bindings: {}, env: {} });
  return { directory, pages: inventory.pages.length, configuredSmokeScenarios: scenarios.length, source, note: '生成全部页面目录和3页冒烟示例；其余场景保持UNRUN。填写实际dataMode和包绑定，并按业务owner添加/复用Maestro流程。' };
}

const render = (manifestPath, outputDir, overview = false) => buildReport({ manifestPath, outputDir, overview, assetMode: 'directory' });

export async function main(argv) {
  if (!argv.length || argv.includes('--help')) { console.log(help); return; }
  const { command, options } = parseArgs(argv);
  const environment = await environmentFrom(options.environment);
  if (command === 'init') return initPlan(options.output, options.scope);
  if (command === 'devices') return discoverDevices(options.platform, environment);
  if (command === 'report') return render(options.manifest, options.output, options.overview);
  if (command === 'review') {
    const result = await applyReviews({ manifestPath: options.manifest, annotationsPath: options.annotations, outputDir: options.output });
    const report = await render(result.manifestPath, path.join(options.output, 'report'));
    return { ...result, report };
  }
  if (command === 'collect') {
    const result = await collectEvidence({ captures: options.captures, outputDir: options.output });
    const report = await render(result.manifestPath, path.join(options.output, 'report'));
    return { ...result, report };
  }
  const plan = await json(options.plan), web = plan.scope === 'web';
  if (web && options.platform || !web && options.target) throw Error('Web uses --target desktop|mobile; App uses --platform ios|android');
  if (command === 'run') { await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true }); await fs.mkdir(options.output); }
  const result = await (web ? captureWebPlan : capturePlan)({ planPath: options.plan, outputDir: command === 'run' ? path.join(options.output, 'capture') : options.output, environment, target: options.target, platforms: options.platform ? [options.platform] : undefined });
  if (command === 'capture') { process.exitCode = result.passed ? 0 : 1; return { outputDir: result.outputDir, passed: result.passed, cases: result.capture.cases.length }; }
  const collected = await collectEvidence({ captures: [path.join(result.outputDir, 'capture.json')], outputDir: path.join(options.output, 'collection') });
  const report = await render(collected.manifestPath, path.join(options.output, 'report'));
  process.exitCode = result.passed ? 0 : 1;
  return { ...collected, report, passed: result.passed };
}

if (process.argv[1] && await fs.realpath(process.argv[1]) === await fs.realpath(fileURLToPath(import.meta.url))) {
  try { const result = await main(process.argv.slice(2)); if (result !== undefined) console.log(JSON.stringify(result, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
