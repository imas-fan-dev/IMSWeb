import { aggregate, appGroups, sameSource } from './app-report-model.mjs';

export const webTargets = [
  { id: 'desktop', label: '桌面 Web', renderer: 'web-desktop', project: 'chromium-desktop' },
  { id: 'mobile', label: '移动 Web', renderer: 'web-mobile', project: 'chromium-mobile' },
];
export const webGroups = appGroups.map(g => ({ ...g, name: g.id === 'home' ? '首页与资讯' : g.id === 'account' ? '账户' : g.id === 'resources' ? '资料与作品' : g.name }));
const assert = (condition, message) => { if (!condition) throw Error(message); };
const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);

export function createWebInventory(descriptors, source) {
  const titles = { '/': '首页', '/about': '关于 IMSWeb', '/events': '社区动态', '/recommendations': '向您推荐', '/live': 'Live 日程', '/community': '制作人社区', '/community/exchange': '名片交换事务所', '/works': '系列作品', '/wiki': '剧情档案' };
  const routes = descriptors.filter(d => d.targets.includes('web') && d.layout !== 'admin');
  return { version: 1, scope: 'web', source, routeSource: 'apps/web/app/route-metadata.ts', routeCount: routes.length,
    deviceScope: { desktop: 'existing chromium-desktop preset', mobile: 'existing chromium-mobile normal portrait phone preset' },
    normalization: 'Web公共与账户路由逐条建档；管理后台不在本次范围。动态参数与登录后页面未配置实例时保持未执行。',
    excluded: descriptors.filter(d => d.targets.includes('web') && d.layout === 'admin').map(d => d.path),
    pages: routes.map(d => {
      const route = d.index ? '/' : '/' + d.path;
      const id = route === '/' ? 'home' : route === '/*' ? 'not-found' : route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      const group = d.appNavigation?.tab || (/^\/account/.test(route) ? 'account' : /^\/community/.test(route) ? 'community' : /^\/(wiki|story|works|apps|packages|chronicle)/.test(route) ? 'resources' : 'home');
      return { id, route, title: titles[route] || route, group, private: !!d.appNavigation?.private, scenarios: [{ id: 'initial', title: '首屏、完整页面与响应式布局', required: true }] };
    }) };
}

export function validateWeb(web, cases, images) {
  assert(web?.inventory?.version === 1 && web.inventory.scope === 'web' && web.inventory.source?.commit, 'web.inventory version 1 and source required');
  assert(Array.isArray(web.inventory.pages) && web.inventory.pages.length && Array.isArray(web.runs), 'Web pages/runs required');
  const pages = new Map(), routes = new Set(), runs = new Map();
  for (const page of web.inventory.pages) {
    assert(validId(page.id) && !pages.has(page.id) && page.title && page.route && !routes.has(page.route) && webGroups.some(g => g.id === page.group), 'Invalid/duplicate Web page');
    assert(Array.isArray(page.scenarios) && page.scenarios.length && new Set(page.scenarios.map(s => s.id)).size === page.scenarios.length && page.scenarios.every(s => validId(s.id) && s.title) && page.scenarios.some(s => s.required !== false), 'Invalid Web scenarios');
    pages.set(page.id, page); routes.add(page.route);
  }
  for (const run of web.runs) {
    assert(validId(run.id) && !runs.has(run.id) && webTargets.some(t => t.id === run.target && t.renderer === run.renderer && t.project === run.project), 'Invalid Web run/renderer/project');
    assert((run.sourceVerified !== true && run.viewport == null || Number.isInteger(run.viewport?.width) && run.viewport.width > 0 && Number.isInteger(run.viewport?.height) && run.viewport.height > 0) && run.browser && run.dataMode && !run.platform, 'Web run requires actual viewport/browser/dataMode and no native platform');
    runs.set(run.id, run);
  }
  for (const item of cases) {
    const page = pages.get(item.pageId), run = runs.get(item.runId);
    assert(page && page.scenarios.some(s => s.id === item.scenarioId) && run?.renderer === item.renderer, 'Invalid Web case association');
  }
  for (const image of images) {
    const owner = cases.find(c => c.id === image.caseId);
    assert(owner && ['pageId', 'scenarioId', 'runId', 'renderer'].every(key => image[key] === owner[key]), 'Invalid Web screenshot association');
  }
  return web;
}

export function buildWebCoverage(web, cases, images) {
  return Object.fromEntries(webTargets.map(target => {
    const eligible = new Set(web.runs.filter(r => r.target === target.id && r.sourceVerified === true && sameSource(web.inventory.source, r.source)).map(r => r.id));
    const pages = web.inventory.pages.map(page => {
      const scenarios = page.scenarios.map(scene => {
        const matching = cases.filter(c => c.pageId === page.id && c.scenarioId === scene.id && c.renderer === target.renderer && eligible.has(c.runId));
        const execution = matching.length ? ['REWORK', 'BLOCKED', 'UNRUN'].find(s => matching.some(c => c.verdict === s)) || 'PASS' : 'UNRUN';
        const captures = images.filter(i => i.kind === 'runtime' && matching.some(c => c.id === i.caseId));
        let verdict = execution, reason = matching.map(c => c.reason).join('；') || '缺少相同源码、对应Web环境的执行记录';
        if (execution === 'PASS') {
          if (matching.some(c => c.testStatus !== 'passed' || !c.receiptCopy || !c.command)) { verdict = 'UNRUN'; reason = '缺少完成fixture清理后的Playwright通过状态或执行回执'; }
          else if (captures.some(i => i.review === 'REWORK')) { verdict = 'REWORK'; reason = '执行通过，截图视觉审阅需返工'; }
          else if (!matching.every(c => (c.expectedCaptures || ['viewport', 'full-page']).every(kind => captures.some(i => i.caseId === c.id && i.capture === kind && i.review === 'PASS')))) { verdict = 'UNRUN'; reason = '执行通过，首屏/完整页面截图待独立视觉复核'; }
        }
        return { ...scene, verdict, execution, reason, caseIds: matching.map(c => c.id), screenshotIds: captures.map(i => i.id) };
      });
      return { ...page, scenarios, verdict: aggregate(scenarios.filter(s => s.required !== false).map(s => s.verdict)) };
    });
    return [target.id, { verdict: aggregate(pages.map(p => p.verdict)), pages, counts: Object.fromEntries(['PASS', 'REWORK', 'BLOCKED', 'PARTIAL', 'UNRUN'].map(s => [s, pages.filter(p => p.verdict === s).length])) }];
  }));
}

export function webMarkdown(web, coverage) {
  return '\n## Web 页面覆盖\n\n桌面与常规移动Web分别统计；fixture、执行和视觉审阅独立保留。\n' + webTargets.map(t => `\n### ${t.label}\n\n${coverage[t.id].verdict}；${JSON.stringify(coverage[t.id].counts)}\n`).join('');
}
