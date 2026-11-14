import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appGroups, validateApp } from "./app-report-model.mjs";

const titles = {
  "/": "首页", "/information/:contentId": "资讯详情", "/about": "关于 IMSWeb",
  "/events": "活动日历", "/events/:eventId": "活动详情", "/community": "社区",
  "/community/cards": "制作人名片墙", "/community/cards/submissions/:id": "名片投稿详情",
  "/producer-map": "制作人地图", "/community/exchange": "交换地图",
  "/community/exchange/offices/:officeSlug": "事务所详情", "/apps": "资料目录",
  "/recommendations": "入坑推荐", "/live": "直播", "/tier-list": "印象排行",
  "/works": "作品列表", "/works/:workSlug": "作品详情", "/wiki": "偶像资料",
  "/story": "剧情阅读", "/chronicle": "编年史", "/chronicle/:activityId": "编年史详情",
  "/packages/:siteSlug": "专题包", "/account/me": "我的", "/account/login": "登录",
  "/account/register": "注册", "/account/password-reset": "重置密码", "/account/security": "账号安全",
  "/account/me/profile": "个人资料", "/account/me/namecards": "我的名片",
  "/account/me/favorites": "我的收藏", "/account/me/offices": "我的事务所",
  "/account/me/claims": "我的认领", "/*": "页面未找到",
};
const scene = (id, title) => ({ id, title, required: true });

export function createAppInventory(descriptors, source) {
  const appRoutes = descriptors.filter(route => route.targets.includes("app"));
  const canonical = appRoutes.filter(route => !route.appNavigation?.canonical);
  for (const alias of appRoutes.filter(route => route.appNavigation?.canonical)) {
    if (!canonical.some(route => (route.index ? "/" : `/${route.path}`) === alias.appNavigation.canonical)) throw new Error(`App canonical route missing: ${alias.appNavigation.canonical}`);
  }
  const pages = canonical.flatMap(descriptor => {
    const nav = descriptor.appNavigation;
    if (!nav || !appGroups.some(group => group.id === nav.tab)) throw new Error(`App route missing navigation: ${descriptor.path}`);
    const routes = nav.sections ? nav.sections.map(section => `/${descriptor.path.replace(":section", section)}`) : [descriptor.index ? "/" : `/${descriptor.path}`];
    return routes.map(route => {
      const scenarios = [scene("initial", "首屏与安全区"), scene("states", "加载、空态与错误反馈"), scene("interaction", "主操作与触控反馈"), scene("navigation", "返回、重入与导航恢复")];
      if (nav.private || nav.presentation === "auth") scenarios.push(scene("auth", "登录状态与权限边界"));
      if (nav.presentation === "auth" || route === "/account/me/profile" || route === "/account/security") scenarios.push(scene("keyboard", "真实键盘、输入校验与提交"));
      if (route.includes(":")) scenarios.push(scene("fixture", "具名内容实例与失效链接"));
      if (route === "/community/exchange") scenarios.push(...[
        scene("guide", "首次引导"), scene("office", "事务所入口"), scene("search", "真实地点搜索与选择"),
        scene("keyboard", "真实键盘与搜索避让"), scene("create", "长按创建"), scene("nearby", "附近地点候选"), scene("prefill", "创建表单位置预填"),
      ]);
      return { id: route === "/" ? "home" : route === "/*" ? "not-found" : route.replace(/^\//, "").replaceAll(":", "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(), title: titles[route] || route, route, group: nav.tab, file: descriptor.file, private: !!nav.private, aliases: appRoutes.filter(item => item.appNavigation?.canonical === route).map(item => `/${item.path}`), scenarios };
    });
  });
  const inventory = { version: 1, source, deviceScope: { deviceClass: "standard-phone", orientation: "portrait", browserProjects: ["app-iphone", "app-android"] }, routeSource: "apps/web/app/route-metadata.ts", routeCount: appRoutes.length, normalization: "合并 canonical 别名，展开个人 section，保留动态路由模板与未找到页；默认常规手机竖屏，不含小屏和短横屏；场景为待执行计划。", pages };
  validateApp({ inventory, runs: [] }, [], []);
  return inventory;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") console.log("node --experimental-strip-types create-app-inventory.mjs --output <new-manifest.json>");
    else {
      if (args.length !== 2 || args[0] !== "--output" || !args[1] || args[1].startsWith("--")) throw new Error("--output <new-manifest.json> required");
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
      const { routeDescriptors } = await import(pathToFileURL(path.join(root, "apps/web/app/route-metadata.ts")).href);
      const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
      const dirty = !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
      const inventory = createAppInventory(routeDescriptors, { commit, dirty });
      const output = path.resolve(args[1]);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `${JSON.stringify({ title: "IMSWeb App 全量页面验收", source: inventory.source, app: { inventory, runs: [] }, cases: [], screenshots: [] }, null, 2)}\n`, { flag: "wx" });
      console.log(`Created ${inventory.pages.length} pages from ${inventory.routeCount} App routes: ${output}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
