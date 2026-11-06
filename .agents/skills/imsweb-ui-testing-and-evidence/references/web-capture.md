# 常规 Web 与移动响应式截图

Web 使用与原生相同的 capture → collect → report → review 流水线，但独立建档，不将浏览器截图计作 iOS/Android 原生证据。

## 批量运行

从仓库根执行：

```sh
UI=.agents/skills/imsweb-ui-testing-and-evidence/scripts/ui-acceptance.mjs
node --experimental-strip-types "$UI" init --scope web --output data/verification/web-plan-01
node "$UI" run --plan data/verification/web-plan-01/plan.json --output data/verification/web-run-01
```

默认复用 `apps/web/playwright.config.ts` 的 `chromium-desktop` 和 `chromium-mobile` 项目，不创建新的浏览器配置，不覆盖 presets。当前常规桌面视口为 1280×720；Pixel 7 移动视口为 412×839，屏幕尺寸不冒充 CSS 视口。只跑一个环境时加 `--target desktop` 或 `--target mobile`。不包含 App DOM、平板、320px、小屏或横屏矩阵。

默认从权威 Web 路由建立公共与账户页面目录，并配置首页、关于、社区动态、推荐、Live、社区、系列作品、Wiki 八个初始场景。后台明确排除；动态实例、登录后页面及未配置场景保持 UNRUN。fixture 数据可能为空，不解释成线上内容完整。

每个场景执行可见文档、标题、主内容和无整页横向溢出断言，等待实际响应、字体和可见图片；先保存未滚动首屏，再逐屏加载内容并保存完整页面。完整页面高度有界，失败时保留诊断图。场景扩充归 `apps/web/tests/e2e/fixtures/ui-capture.ts` 与既有业务 fixtures；请求仍通过契约 dispatcher，不直接 mock JSON `/api`。

## 环境和源码

默认使用本机已安装的 pnpm、Playwright 和浏览器。采集器通过既有 Web dev 入口启动任务自有服务，使用临时回环端口；跑完仅停止自己启动的进程。Playwright 仍通过工作区 `test:e2e` 入口运行，单 worker、零 retries。不会占用或停止其他人的 5173/4173 服务。

计划冻结源码，运行前后核对。源码在 init 后变化时重新 init；运行中变化保留执行结果但不贡献当前视觉覆盖。外部站点可以通过环境文件的 `env.E2E_BASE_URL` 指定，但其源码归属无法自动验证，保持未核对状态，不继承本地源码 PASS。

```json
{ "tools": { "pnpm": "/可选/pnpm" }, "env": {} }
```

通过 `--environment` 提供机器配置。不要把凭据放在计划、URL 或截图说明中。当前默认八个配方是已有契约 fixtures，不向真实数据库提交写入。

## 结果、归并和视觉审阅

输出包含：

- `capture/capture.json`：独立的 web-desktop / web-mobile runs，实际视口、浏览器版本、origin、源码和数据来源。
- `capture/browser/`：完整批次进程回执、真实退出码、stdout/stderr、Playwright trace/附件，以及每个场景的终态回执。
- `report/index.html`：桌面 / 手机切换的页面验收工作台；`report/evidence.html` 为可搜索筛选的全部图册，执行记录默认折叠。最终入口遵循 [页面与交付约定](../SKILL.md#报告页面与交付)。
- `collection/review-queue.json` 和 `review-request.md`：供视觉 LLM 集中处理，机械步骤不需要模型介入。

Playwright 的每个 test 没有独立进程退出码，因此每个用例保存 `testStatus` 和 `batchExitCode`，不伪造 exit=0。reporter 在 fixture teardown 后记录终态，拍到截图后清理失败的场景也会保留失败。首屏和完整页面分别待审，两类都审阅通过后才贡献 Web 视觉 PASS。

单独采集与跨主机归并使用相同入口：

```sh
node "$UI" capture --plan data/verification/web-plan-01/plan.json --target desktop --output data/verification/web-desktop-01
node "$UI" capture --plan data/verification/web-plan-01/plan.json --target mobile --output data/verification/web-mobile-01
node "$UI" collect --capture data/verification/web-desktop-01/capture.json --capture data/verification/web-mobile-01/capture.json --output data/verification/web-collected-01
```

两轮要求相同冻结目录与源码。失败与重试不被后一次 PASS 抹除；Web 和 App 清单分别归并。LLM 导入方式沿用 [脚本流水线](scripted-pipeline.md)，校验 manifest/image hash，保留原始执行与审阅历史。联合验收在审阅后按 [同页交付流程](scripted-pipeline.md#app-与-web-同页交付) 生成一个 Tab 工作台。

## 验证入口

```sh
node --test .agents/skills/imsweb-ui-testing-and-evidence/scripts/web-capture.test.mjs
node .agents/skills/imsweb-ui-testing-and-evidence/scripts/check-app-report.mjs --report data/verification/web-run-01/report --output data/verification/web-run-01/report-check
pnpm run check:rules
```

报告检查同时覆盖页面工作台和证据图册：桌面/正常手机布局、筛选、执行表格容纳、Dialog、前后切图、键盘焦点、下载原图 hash。该检查验证报告界面，采集的目标 Web 页面结果仍以 Playwright 原始回执为准。
