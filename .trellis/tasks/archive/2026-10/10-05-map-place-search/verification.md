# 验证记录

## 已执行

工作目录 `/Users/texas/Workspace/IMSWeb`，Node 24.18.0、pnpm 11.10.0。依赖安装由图片任务单独负责。doctor 确认本地 Podman Compose reachable；API/Web 依赖已就绪。本节保留原 worker 的 API 验证，Web 与最终浏览器验收见后文。

| 命令 | 结果与范围 |
| --- | --- |
| `python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-05-map-place-search` | 通过，最终 implement 10 条、check 7 条 curated entries |
| `TRELLIS_CONTEXT_ID=map-place-search-implement python3 ./.trellis/scripts/task.py start .trellis/tasks/10-05-map-place-search` | 当前子会话激活，状态 in_progress |
| `pnpm run dev:doctor` | API/Web 依赖、local Compose、端口检查通过 |
| `pnpm run dev:postgresql:up` | 仅启动本地 PostgreSQL；保留数据卷 |
| `docker compose --profile local-cache -f deploy/compose.yaml up -d valkey` | 启动本地 Valkey |
| `pnpm --filter @imsweb/api run typecheck` | exit 0，最新实现及测试 |
| `pnpm --filter @imsweb/api run check:architecture` | exit 0，382 domain modules |
| `pnpm --filter @imsweb/api exec vitest run tests/server/fudaba.test.ts` | exit 0，88/88，通过真实 PostgreSQL 套件及 search/owner/privacy 回归 |
| `python3 -m unittest tests/test_compose_deployment.py` | exit 0，10 tests |
| `node scripts/contracts/compile-route-inventory.mjs --write` | exit 0，当前 inventory 无 Git diff |
| `pnpm run check:rules` | exit 0，source/contract/non-JSON/inventory/docs 全部通过 |
| `pnpm run check:boundaries` | 当时失败于并行图片任务的 owner-card-media/use-owner-card-media API internal imports；地图任务不修改这些文件，主会话需完成后重跑 |
| `git diff --check` | exit 0 |

对全部九个修改的 Web TS/TSX 文件执行 scoped `pnpm --filter @imsweb/web exec prettier --write ...` 与 `pnpm --filter @imsweb/web exec eslint ...`，均 exit 0。文件为 exchange-place-search、office-place-search、office-editor、map-section、office-map、对应三个 unit test 及 community-exchange-map.spec.ts。没有运行共享 Vitest/build/Playwright。

首次 full Fudaba run 因 127.0.0.1:5432 未监听失败，启动本地 PostgreSQL 后重跑全部通过。首次新 policy 回归假定未知 query key 返回 400，实际既有 schema 明确为 legacy-strip；修正测试保留兼容语义，没有更改 wire schema。

## 真实 provider 与缓存/限流

执行了 `research/live-provider-check.ts` 同等脚本，使用真实 Hono application route graph、env parser、global fetch、真实 loopback ValkeyCache 和 ValkeyRateLimiter。以 in-process `app.request` 调用应用 endpoint，不绑定 HTTP listener，不使用 fixture provider response，不写数据库。

复现命令（从 `apps/api`，本地 Valkey 必须已启动）：

```sh
NODE_ENV=test IMS_ENV_FILE='' \
IMS_BACKOFFICE_JWT_SECRET=map-verification-backoffice-development-key \
IMS_PLATFORM_JWT_SECRET=map-verification-platform-development-key \
pnpm exec tsx ../../.trellis/tasks/10-05-map-place-search/research/live-provider-check.ts 西岸艺术中心
```

首次未缓存 venue 查询实际 upstream HTTP 200、application HTTP 200，exact response conformance=true：

```json
{"success":true,"items":[{"id":"way:307455604","label":"西岸艺术中心","address":"西岸艺术中心, 2555, 龙腾大道, 龙华街道, 徐汇区, 上海市, 200241, 中国","city":"上海市","location":{"latitude":31.1693193,"longitude":121.457005,"precision":"exact"}}],"attribution":"© OpenStreetMap contributors"}
```

同进程重复应用请求 HTTP 200，总上游请求一次。另一次进程重复相同查询 HTTP 200，上游零次，证明跨实例共享缓存。真实 Valkey 两个 limiter 实例对同一 global bucket 连续消费得到 firstAllowed=true、secondAllowed=false。上海市查询也获得两个真实地点，31.2312707/121.4700152 和 31.2323437/121.4691024。

原始 venue 返回 city=徐汇区，state=上海市；修正直辖市 mapping 和 cache v2 后再次真实查询确认 city=上海市，精确坐标保持 provider 值。日志留在 Git 忽略的 `data/map-place-search/`，持久 evidence 以上述响应为准。

实际 ignored API/deploy env 无 geocoder 设置。本次没有修改 ignored 配置或默认启用 provider。Compose passthrough 已修复；要在实际环境启用必须显式提供 endpoint 和可识别 User-Agent。未部署或修改生产数据。

## 最终 Web 与 App 检查

主会话释放独占 Web/App 窗口后执行以下检查，全部 exit 0：

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/pages/community/exchange/exchange-place-search.test.tsx tests/unit/pages/community/exchange/exchange-office-map.test.tsx tests/unit/pages/community/exchange/me/office-location-workspace.test.tsx tests/unit/lib/api/endpoints/fudaba.test.ts tests/unit/e2e/unit-source-policy.test.ts tests/unit/e2e/e2e-source-policy.test.ts
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run build
```

focused unit 为 6 files、56/56 tests。typecheck 修正了 Testing Library `getByRole` 不支持的 `exact` option；字符串 name 默认精确匹配。首次 unit 还有两个结果 selector 假定相邻文字之间有空格，修正为对应文本的正则后重跑 56/56。没有改变控件的可见文字。

新增 App 地点搜索场景和事务所浏览器草稿断言之后再次执行 full Web typecheck/lint，均 exit 0；最后一次 source-policy unit 为 2 files、12/12 tests。Web build 与 App build 均通过。App build 命令：

```sh
VITE_IMS_API_ORIGIN=http://127.0.0.1:4186 \
VITE_IMS_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4186 \
VITE_IMS_MAP_TRANSPORT_ORIGIN=http://localhost:4187 \
pnpm --filter @imsweb/web run build:app
```

最终 `pnpm run check:boundaries` exit 0。`pnpm run check:rules` exit 0，violations=0，550 API JSON emitters、218 Web API calls、32 non-JSON entries、244 mounted route instances、323 carriers、659 response expressions，25 Markdown documentation files 通过。首次规则检查被工具 60 秒前台 deadline 中止；后台重跑保留进程并完成，终态写入 `/tmp/map-rules.exit` 为 0。最后 `git diff --check` exit 0。

## 确定性浏览器回归

Web server：`IMS_API_ORIGIN=http://127.0.0.1:65534 VITE_IMS_MOCK_API=0 pnpm --filter @imsweb/web exec react-router dev --host 127.0.0.1 --port 4186`。未监听的 API origin 证明此 lane 的 typed fixtures 无隐式代理依赖。

```sh
E2E_BASE_URL=http://127.0.0.1:4186 pnpm --filter @imsweb/web run test:e2e tests/e2e/community-exchange-map.spec.ts tests/e2e/community-exchange-me.spec.ts --project chromium-desktop --project chromium-mobile --workers 1 --output /tmp/imsweb-map-place-search-playwright/web
E2E_APP_BASE_URL=http://localhost:4187 E2E_APP_API_ORIGIN=http://127.0.0.1:4186 pnpm --filter @imsweb/web run test:e2e:app tests/e2e/app-map.spec.ts --project app-iphone --project app-landscape --workers 1 --output /tmp/imsweb-map-place-search-playwright/app
```

Web exit 0，7/7 tests、51.5s；App exit 0，9/9 tests、21.5s，zero retries。Web 事务所段先填写未保存名称和介绍，以 Enter 搜索并选择首钢园，随后断言两个草稿字段仍在、城市为北京市、office/location PUT 都为零，再显式保存。Web map 验证独立城市筛选保留、Enter、bbox、marker、clear、焦点及移动宽度；App 新场景用按钮搜索，验证 portrait/landscape 的结果边界、attribution、bbox、marker 和 clear。现有 App geolocation、控件几何、tab/camera 持续性及 refresh 场景全部通过。

App 使用已构建的 `build-app/client`，由 task `research/browser-validation-server.ts` 的 `FrontendStaticAssets` + `NodeStaticAssets` 在 4187 提供正确的 prerender/SPA route。第一次普通 `vite preview --outDir build-app/client` 在 exchange URL 返回首页 prerender，9 个场景未加载地图。改用仓库 route adapter 后全部通过；没有为此改动生产路由。

截图包括 `web/*/office-place-search-preserved-draft.png`、`app/*/app-map-search-results.png` 和 `app/*/app-map-selected-place.png`。完整输出根目录为 `/tmp/imsweb-map-place-search-playwright/`。

## 真实 provider 浏览器验收

再次读取官方 https://operations.osmfoundation.org/policies/nominatim/ ：全应用最大每秒一次、可识别 User-Agent、显示 attribution、显式用户查询、禁用 autocomplete，建议代理和缓存并允许切换 provider。真实 basemap 使用 https://openfreemap.org/quick_start/ 官方公布的 `https://tiles.openfreemap.org/styles/liberty`，仅在验证 server 显式配置。它避免依赖本机缺失的 PMTiles archive，不改变生产地图配置。

启动 `research/browser-validation-server.ts` 的 cwd 为 `apps/api`：

```sh
NODE_ENV=test IMS_ENV_FILE='' \
IMS_BACKOFFICE_JWT_SECRET=map-verification-backoffice-development-key \
IMS_PLATFORM_JWT_SECRET=map-verification-platform-development-key \
pnpm exec tsx ../../.trellis/tasks/10-05-map-place-search/research/browser-validation-server.ts
```

该临时进程在 3206 绑定真实 Hono route graph，在 4187 服务 packaged App，使用 loopback Valkey；不读取生产 env，不连接或写数据库。显式 endpoint=`https://nominatim.openstreetmap.org/search`，countrycodes=cn，User-Agent=`IMSWeb local browser place search verification (https://github.com/IMSWeb)`。Web server 用 `IMS_API_ORIGIN=http://127.0.0.1:3206` 在 4186 启动，浏览器只能通过应用 API / proxy 搜索。

将 task `research/live-browser-validation.spec.ts` 临时复制到 Web testDir 的 `map-live-validation.spec.ts` 和 `app-map-live-validation.spec.ts`。这两个临时文件完成后删除；持久 task 源文件保留，方便主会话复核。命令：

```sh
E2E_BASE_URL=http://127.0.0.1:4186 pnpm --filter @imsweb/web run test:e2e tests/e2e/map-live-validation.spec.ts --project chromium-desktop --project chromium-mobile --workers 1 --output /tmp/imsweb-map-place-search-playwright/live
E2E_APP_BASE_URL=http://localhost:4187 E2E_APP_API_ORIGIN=http://127.0.0.1:4186 pnpm --filter @imsweb/web run test:e2e:app tests/e2e/app-map-live-validation.spec.ts --project app-iphone --project app-landscape --workers 1 --output /tmp/imsweb-map-place-search-playwright/live-app
```

Web live exit 0，2/2、16.6s；App live exit 0，2/2、16.4s。首次 live harness 重复注册 wiki/catalog，在导航前失败；移除多余 seeded registration 后通过。之后补充 result 多点 hit-test 和 map canvas 像素检查再重跑四个 project：结果上缘、下缘、中心均可点击；截图前 canvas 最大单色采样比例低于 90%，避免地图细节尚未渲染时截图。没有通过固定时间等待或重试掩盖问题。

map/config 与 places/search 都使用 typed dispatcher 的 exact named pass-through，未拦截搜索 response。其他目录与区域事务所列表用契约化空 fixture，以隔离数据库；这不是生产数据或整个 backend 的真实数据验收。真实 geocoder response 用 shared schema parse 与原始 JSON 比较一致：

```json
{"id":"way:307455604","label":"西岸艺术中心","address":"西岸艺术中心, 2555, 龙腾大道, 龙华街道, 徐汇区, 上海市, 200241, 中国","city":"上海市","location":{"latitude":31.1693193,"longitude":121.457005,"precision":"exact"}}
```

四个浏览器 project 均证明：Enter 和按钮查询成功、可见 attribution、实际 OpenFreeMap vector tile HTTP 成功、结果选择后 bbox 包含地点且经度跨度小于一度、临时 marker 可见、焦点回到查找按钮、清除后无 marker，mutation/pageerror 都为零。最终 bbox：

| Project | west,south,east,north |
| --- | --- |
| chromium-desktop | 121.29221,31.072917,121.6218,31.265624 |
| chromium-mobile | 121.386281,31.053066,121.527729,31.285431 |
| app-iphone | 121.390057,31.045271,121.523953,31.293205 |
| app-landscape | 121.312123,31.112019,121.601887,31.226585 |

同一个 validation server 的首次与加强断言复验共 16 个 application search HTTP 200；真实 upstream 仅一次 HTTP 200，其余命中共享 Valkey cache。日志 `/tmp/map-live-server.log` 保存识别 User-Agent 和 application request completion，不含生产凭据。最终截图：

- `/tmp/imsweb-map-place-search-playwright/live/map-live-validation-live-m-21047-proxy-and-moves-the-basemap-chromium-desktop/live-search-results.png`
- `/tmp/imsweb-map-place-search-playwright/live/map-live-validation-live-m-21047-proxy-and-moves-the-basemap-chromium-desktop/live-selected-venue-basemap.png`
- `/tmp/imsweb-map-place-search-playwright/live/map-live-validation-live-m-21047-proxy-and-moves-the-basemap-chromium-mobile/live-search-results.png`
- `/tmp/imsweb-map-place-search-playwright/live/map-live-validation-live-m-21047-proxy-and-moves-the-basemap-chromium-mobile/live-selected-venue-basemap.png`
- `/tmp/imsweb-map-place-search-playwright/live-app/app-map-live-validation-li-f8147-proxy-and-moves-the-basemap-app-iphone/live-search-results.png`
- `/tmp/imsweb-map-place-search-playwright/live-app/app-map-live-validation-li-f8147-proxy-and-moves-the-basemap-app-iphone/live-selected-venue-basemap.png`
- `/tmp/imsweb-map-place-search-playwright/live-app/app-map-live-validation-li-f8147-proxy-and-moves-the-basemap-app-landscape/live-search-results.png`
- `/tmp/imsweb-map-place-search-playwright/live-app/app-map-live-validation-li-f8147-proxy-and-moves-the-basemap-app-landscape/live-selected-venue-basemap.png`

已人工查看 desktop、mobile selected basemap 和 App landscape result 截图。raw command logs 位于 `/tmp/map-{unit,typecheck,lint,build,app-build,e2e,app-e2e,live-e2e,live-app-e2e,rules,boundaries}.log`，副本保存在 ignored `data/map-place-search/final-validation/`。

## 交接与限制

地图任务验收完成，可供主会话独立审核和 scoped commit。图片 worker 其后的 API 改动、完整共享 checkout 合并质量和提交由主会话负责。本次没有修改 owner-media implementation、task 或 spec，也没有 stage/commit/archive/push/deploy。

owned Web/App/API groups 已停止，`lsof -nP -iTCP:4186 -iTCP:4187 -iTCP:3206 -sTCP:LISTEN` 无 listener；Web/App window 已释放。PostgreSQL/Valkey 保留运行。原生 iOS/Android 设备未验证；App browser 是构建后的 Web 表面证据。实际环境 provider 仍须显式配置，默认禁用；本次没有修改 production 或 ignored env。
