# App 导航规划背景

## 当前授权与范围

用户已批准任务创建、四栏入口分组与栏目切换规则，明确 Wiki 内部不变，重点是 App 整体导航体验。`prd.md`、`design.md`、`implement.md` 与上下文清单已完成。用户在最终方案展示后批准继续，并指定 `.worktrees/app-navigation-interaction` 同样检出 `release/v1.1`，后续子代理统一使用 `sol` / `xhigh`。任务已进入实现。既有设计和历史要求是讨论依据，不自动构成本轮新增要求。

## 环境预检

- 工作区：`/Users/texas/Workspace/IMSWeb`。
- Node：`v24.18.0`；pnpm：`11.10.0`，满足 `docs/development/ai-environment.md` 的版本要求。
- 开始前已有修改：`scripts/deployment/render-preview-app-release-notes.sh`，本任务保留该修改。
- 新任务目录：`.trellis/tasks/09-13-app-navigation-interaction/`。
- `pnpm run dev:doctor` 通过：API/Web 依赖已安装，本地 Podman Compose 可达，API 3000、Web 5173 与 Valkey 6379 端口可用。
- 已通过 `pnpm --filter @imsweb/web run dev:app` 启动 App target 预览，`http://localhost:1420/` 返回 HTTP 200。API 尚未启动，数据页面中的加载失败不计为产品缺陷。
- 已使用 workspace 中安装的 Playwright `1.61.1` 检查 390 × 844 Chromium 触屏视口下的全局导航，具体事实与截图见 `navigation-options.md` 和 `browser/`。未运行产品测试套件或设备构建，浏览器结果不代表原生 UIKit 验收。
- `pnpm run app:doctor` 已完成，退出码 0。iOS 的 Xcode、xcrun、CocoaPods、Rust targets 与 Android 的 SDK、NDK、Java 21、adb、emulator、build-tools、Rust targets 均通过检查，已有两端生成工程。尚未查询具体可用设备，也未构建或安装 App。
- 唯一提醒是未设置 `TAURI_APPLE_DEVELOPMENT_TEAM`，影响后续 iOS 真机签名，不阻塞本轮计划中的 iOS 模拟器验证。完整体检输出保存在 `.pi/tasks/session-62201-62201/b593daa31.output`。
- 规划末次检查另观察到 `apps/api/package.json` 与 `pnpm-lock.yaml` 的导航无关差异，保留这些改动，不纳入本任务。

## 设计与工程约束

来源：`apps/web/.rules`、`apps/web/DESIGN.md`、`.trellis/spec/web/frontend/architecture.md`、`.trellis/spec/web/frontend/components-and-ux.md`、`.trellis/spec/web/frontend/testing.md`。

- 路由由 `apps/web/app/routes.ts` 直接连接页面与布局；App 与普通 Web 的构建入口有区分。
- 设计文档规定：iOS 26 及以上的 App 使用系统 `UITabBarController`，其他环境使用 Web 回退底栏；实际行为仍需与实现核对。原生底栏的材质、尺寸与动画由 UIKit 负责，弹层打开时暂时隐藏原生底栏。
- App 壳层统一拥有顶栏、底栏、安全区和视口尺寸变量，页面不重复计算这些尺寸。
- 导航控件需要清楚的标签、当前状态、键盘操作与焦点反馈；重要操作不能仅靠悬停发现。
- 非必要动画需要尊重减少动态效果设置。生产界面中的指针追踪玻璃高光当前停用，恢复需要单独交互评审。
- 新单元测试归入 `apps/web/tests/unit/`，浏览器测试归入 `apps/web/tests/e2e/`，按生产代码所有者组织。
- 设备交付通过 `app:*` 包装脚本，不能手工修改 `src-tauri/gen/`。
- `apps/web/.rules` 中提到的仓库根 `DESIGN.md` 当前不存在；本次读取了实际存在、且被前端 spec 引用的 `apps/web/DESIGN.md`。

## 相关任务边界

来源：`.trellis/tasks/09-05-card-mobile-browsing-redesign/prd.md`。

- 名片任务负责双列浏览、预览返回位置、分页与悬浮入口避让，明确将公共壳层重设计排除在外。
- 名片预览关闭时恢复原列表 URL、页码、焦点与滚动位置，是已有的独立交互要求；本轮若影响公共导航，需考虑这一回归边界。
- 该任务保留一个未完成的 iOS 组合场景：键盘跳页后预览横竖屏切换、关闭时的日期遮挡。没有把该问题自动纳入本次导航任务。
- 该任务中的设备交付与提交授权只属于该任务，不推断为本次发布或提交授权。

## 历史交互要求

通过 `trellis mem search "转盘" --cwd /Users/texas/Workspace/IMSWeb --limit 12 --json` 检索，再过滤用户摘录。以下来自历史用户消息，不代表本轮用户新增需求。

- 会话 `01a05dc7-c269-7a2e-95c6-fa98267690fe`：用户明确表示 "确认了，最新的转盘还是在中间，我们现在要求要在左下角的位置，请你适配"。
- 会话 `01a0592a-38d8-70db-8d6b-e28bbb6af4b4`：用户曾要求 "修复一下问题，当前app下的剧情站里的转盘切换和搜索的显示存在异常，请进行修复"。

前一条可以确定左下角位置有明确的历史意图；后一条只说明有过问题报告，不能证明当前仍然存在同一缺陷。当前行为与代码依据由 `navigation-current-state.md` 记录。
