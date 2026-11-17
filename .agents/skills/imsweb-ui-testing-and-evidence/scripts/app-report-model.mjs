// Page coverage is derived from declared scenarios, current native cases,
// reviewed runtime captures and a preserved source/build/install receipt.
export const appGroups = [
  { id: "home", name: "首页", icon: "house" },
  { id: "community", name: "社区", icon: "users" },
  { id: "map", name: "交换地图", icon: "map" },
  { id: "resources", name: "资料", icon: "book-open" },
  { id: "account", name: "我的", icon: "user-round" },
];
const platforms = ["ios", "android"];
const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === "string" && value.trim();

function unique(items, label) {
  check(Array.isArray(items), `${label}: array required`);
  const ids = new Set();
  for (const item of items) {
    check(item && idPattern.test(item.id), `${label}: invalid id`);
    check(!ids.has(item.id), `${label}: duplicate id ${item.id}`);
    ids.add(item.id);
    check(text(item.title), `${label}/${item.id}: title required`);
  }
}

export function sameSource(inventory, run) {
  if (!text(inventory?.commit) || inventory.commit !== run?.commit) return false;
  if (inventory.dirty === false && run.dirty === false) return true;
  return inventory.dirty === true && run.dirty === true && text(inventory.fingerprint) && inventory.fingerprint === run.fingerprint;
}

export function aggregate(states) {
  if (!states.length) return "UNRUN";
  for (const state of ["REWORK", "BLOCKED"]) if (states.includes(state)) return state;
  if (states.every(state => state === "PASS")) return "PASS";
  return states.some(state => state === "PASS" || state === "PARTIAL") ? "PARTIAL" : "UNRUN";
}

export function validateApp(app, cases, images) {
  if (app === undefined) {
    check(![...cases, ...images].some(item => item.pageId || item.scenarioId || item.runId), "app inventory required for page/scenario/run associations");
    return null;
  }
  check(app && app.inventory?.version === 1, "app.inventory version 1 required");
  const inventory = app.inventory;
  check(text(inventory.source?.commit), "inventory source.commit required");
  check(inventory.deviceScope?.deviceClass === "standard-phone" && inventory.deviceScope?.orientation === "portrait", "inventory requires standard-phone portrait scope");
  unique(inventory.pages, "pages");
  check(inventory.pages.length > 0, "page inventory must not be empty");
  check(Array.isArray(app.runs), "app.runs array required");
  const routes = new Set();
  for (const page of inventory.pages) {
    check(text(page.route) && !routes.has(page.route), `${page.id}: route required/duplicate`);
    routes.add(page.route);
    check(appGroups.some(group => group.id === page.group), `${page.id}: invalid group`);
    check(!page.aliases || (Array.isArray(page.aliases) && page.aliases.every(text)), `${page.id}: invalid aliases`);
    unique(page.scenarios, `${page.id}/scenarios`);
    check(page.scenarios.some(scenario => scenario.required !== false), `${page.id}: required scenarios missing`);
    for (const scenario of page.scenarios) check(scenario.required == null || typeof scenario.required === "boolean", `${page.id}/${scenario.id}: required must be boolean`);
  }
  for (const page of inventory.pages) for (const alias of page.aliases || []) {
    check(!routes.has(alias), `${page.id}: duplicate route/alias ${alias}`);
    routes.add(alias);
  }
  const runs = new Map();
  for (const run of app.runs) {
    check(run && idPattern.test(run.id) && !runs.has(run.id), "runs: invalid/duplicate id");
    check(["web", "app-dom", "ios-native", "android-native"].includes(run.renderer), `${run.id}: invalid renderer`);
    check(!run.platform || (platforms.includes(run.platform) && run.renderer === `${run.platform}-native`), `${run.id}: platform/renderer mismatch`);
    if (run.renderer.endsWith("-native")) check(run.platform && text(run.device) && text(run.os), `${run.id}: native platform/device/os required`);
    runs.set(run.id, run);
  }
  const pages = new Map(inventory.pages.map(page => [page.id, page]));
  for (const item of cases) {
    if (![item.pageId, item.scenarioId, item.runId].some(Boolean)) continue;
    const page = pages.get(item.pageId), run = runs.get(item.runId);
    check(page && run && page.scenarios.some(scene => scene.id === item.scenarioId), `${item.id}: invalid page/scenario/run association`);
    check(run.renderer === item.renderer, `${item.id}: run/renderer mismatch`);
  }
  for (const image of images) {
    const owner = cases.find(item => item.id === image.caseId);
    for (const field of ["pageId", "scenarioId", "runId"]) {
      check(!image[field] || !owner?.[field] || image[field] === owner[field], `${image.id}: case/${field} mismatch`);
      if (!image[field] && owner?.[field]) image[field] = owner[field];
    }
    if (![image.pageId, image.scenarioId, image.runId].some(Boolean)) continue;
    const page = pages.get(image.pageId), run = runs.get(image.runId);
    check(page, `${image.id}: invalid page association`);
    check(!image.scenarioId || page.scenarios.some(scene => scene.id === image.scenarioId), `${image.id}: invalid scenario association`);
    check(!image.runId || run?.renderer === image.renderer, `${image.id}: run/renderer mismatch`);
    if (image.renderer.endsWith("-native")) check(run, `${image.id}: native image run required`);
  }
  return app;
}

export function buildAppCoverage(app, cases, images) {
  const { inventory, runs } = app;
  const coverage = {};
  for (const platform of platforms) {
    const renderer = `${platform}-native`;
    const eligible = new Set(runs.filter(run => run.renderer === renderer && sameSource(inventory.source, run.source) && run.bindingCopy && run.deviceClass === inventory.deviceScope.deviceClass && run.orientation === inventory.deviceScope.orientation).map(run => run.id));
    const pages = inventory.pages.map(page => {
      const scenarios = page.scenarios.map(scene => {
        const matching = cases.filter(item => item.pageId === page.id && item.scenarioId === scene.id && item.renderer === renderer && eligible.has(item.runId) && (scene.required === false || item.required !== false));
        // Repeated attempts remain separate; a later PASS cannot erase a failure.
        const execution = !matching.length ? "UNRUN" : ["REWORK", "BLOCKED", "UNRUN"].find(state => matching.some(item => item.verdict === state)) || "PASS";
        const captures = images.filter(image => matching.some(item => item.id === image.caseId) && image.kind === "runtime" && image.renderer === renderer);
        let verdict = execution;
        let reason = matching.length ? matching.map(item => item.reason || item.title).join("；") : "缺少当前源码、原生运行及构建/安装绑定的场景记录";
        if (execution === "PASS") {
          if (matching.some(item => item.exitCode !== 0 || !text(item.command) || !item.receiptCopy)) { verdict = "UNRUN"; reason = "缺少退出码 0、原始命令或执行回执"; }
          else if (captures.some(image => image.review === "REWORK")) { verdict = "REWORK"; reason = "运行通过，但原生运行截图审阅需返工"; }
          else if (!matching.every(item => captures.some(image => image.caseId === item.id && image.review === "PASS"))) { verdict = "UNRUN"; reason = "运行通过，缺少每个通过用例对应的已审阅原生运行截图"; }
        }
        return { ...scene, verdict, execution, reason, caseIds: matching.map(item => item.id), screenshotIds: captures.map(image => image.id) };
      });
      return { ...page, scenarios, verdict: aggregate(scenarios.filter(scene => scene.required !== false).map(scene => scene.verdict)) };
    });
    coverage[platform] = { verdict: aggregate(pages.map(page => page.verdict)), pages, counts: Object.fromEntries(["PASS", "REWORK", "BLOCKED", "PARTIAL", "UNRUN"].map(state => [state, pages.filter(page => page.verdict === state).length])) };
  }
  return coverage;
}

export function appMarkdown(app, coverage) {
  const clean = value => String(value ?? "未知").replace(/[\r\n|]/g, " ");
  let result = `\n## 全量 App 页面覆盖\n\n目录源码：${clean(app.inventory.source.commit)}。页面状态按当前源码、已绑定的原生用例及已审核运行截图计算；历史、DOM 和未关联记录仅作辅助证据。\n`;
  for (const platform of platforms) {
    result += `\n### ${platform === "ios" ? "iOS" : "Android"}\n\n页面覆盖：${coverage[platform].verdict}；${JSON.stringify(coverage[platform].counts)}\n\n| 页面 / 路由 | 页面状态 | 必需场景 |\n| --- | --- | --- |\n`;
    for (const page of coverage[platform].pages) result += `| ${clean(page.title)} / ${clean(page.route)} | ${page.verdict} | ${page.scenarios.filter(scene => scene.required !== false).map(scene => `${clean(scene.title)}: ${scene.verdict}`).join("；")} |\n`;
  }
  return result;
}
