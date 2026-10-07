# 实施验证

工作区：`/Users/texas/Workspace/IMSWeb/.worktrees/community-admin-list-dialog`，分支 `codex/community-admin-list-dialog`，基线 `2e546377`。Node v24.18.0，pnpm 11.10.0。只改社区 Web 所有者、endpoint 单项 schema re-export、受影响测试和当前任务；未暂存、提交或修改主检出。

## 已执行门禁

- `pnpm --filter @imsweb/web run format`：退出 0；已移除全局 formatter 对其他页面和测试产生的无关格式改动，最终 diff 只保留任务文件。
- `pnpm --filter @imsweb/web run test:unit tests/unit/pages/admin/community/admin-community-page.test.tsx tests/unit/pages/community/community-page.test.tsx tests/unit/lib/api/endpoints/community-content.test.ts tests/unit/e2e/e2e-source-policy.test.ts`：退出 0，4 文件 / 25 用例，3.34s，日志 `/tmp/community-unit-final.log`。
- `pnpm --filter @imsweb/web run test:e2e tests/e2e/community-content-management.spec.ts --workers=1`：退出 0，6 用例（桌面 3、320×568 手机 3），44.3s；日志 `/tmp/community-e2e-final.log`。使用原配置的临时启动器，未停止用户服务。
- `pnpm --filter @imsweb/web run check`：首次完整通过 lint、typecheck、225 unit 文件 / 1581 用例和生产 build。最终焦点卸载清理与新增回归后再执行全量 check，退出 0；225 文件 / 1582 用例通过，lint/typecheck/build 均通过，日志 `/tmp/community-web-check-final.log`。
- `pnpm run check:rules`：完整通过，source violations 0；247 mounted method/path、326 carriers、667 responses；25 文档规则通过。日志 `/tmp/community-rules.log`。
- `pnpm run check:boundaries`：退出 0，日志 `/tmp/community-boundaries.log`。
- `git diff --check`：退出 0。

## 失败与修复记录

首次集中 unit 的改 ID 焦点断言失败，已增加关闭后的可取消 animation-frame 焦点恢复，并保留断言。
首次 Web check 的 refs lint 失败，已改为 row callback ref 注册。
扩展浏览器回归首次失败：新增冲突 fixture 缺少 catalog read 且 session 次数声明为 2，实际为 1；已精确修正。另一次 op 用例因运行期间产品编辑触发 Vite 热更新而多读一次 snapshot，trace 已核实；稳定文件后原请求次数约束完整通过，没有放宽 times 或添加重试。

## 截图

最终截图复制到 `/tmp/community-admin-final-screenshots/`，已实际查看桌面和手机列表、编辑弹窗各一张：

- `desktop-community-editor-op.png`
- `desktop-community-dialog-op.png`
- `mobile-320x568-community-editor-op.png`
- `mobile-320x568-community-dialog-op.png`

同目录保留 editor 角色和 public 页截图。手机 full-page 截图包含已有固定后台页头，弹窗几何与点击可达性由浏览器断言另行确认。截图不进入仓库。

## 验证边界

未改变路由或 fallback，按计划不执行 `test:web-routing`。未运行整个普通 Web E2E 矩阵、Firefox 或 App/native device；本次浏览器证明限于社区的桌面和手机 Chromium。上传由 fixture 模拟；后端图片解码、权限、CAS 合同沿用原服务，未改 API/contracts。

源码基线没有共享 DropdownMenu；主会话批准在社区列表使用现有 Base UI Menu 原语，未新增共享 UI 或依赖。跨层 spec 更新、Trellis 生命周期和独立检查交由主会话；本次不归档。

## 独立复核

复核最终 source/diff、AC1–AC7、curated specs、Web .rules / DESIGN / theme，以及实施日志。候选副本、取消与无更改确认、原 ID 定位和重复 ID 校验、改 ID 焦点恢复、上传 token/sequence 与卸载保护、读取失败与 409 禁止覆盖、手机 Portal 菜单、唯一 DialogBody 滚动和公共空配置兼容均符合已批准设计。没有剩余阻塞项。

发现并修复：弹窗错误提示原来是双列 grid 的普通单元格，验证失败后将文本字段推到右列、图片推到下一行。错误提示改为 `col-span-full`。E2E 新增 invalid-ID 后文本字段仍在图标左侧的几何断言。临时恢复旧 class 后，桌面 op 回归退出 1（3.3s）：名称 x=696.6875、图标 x=272，几何断言明确失败；恢复修复后完整 6/6 通过。失败日志 `/tmp/community-review-error-repro.log` 中的未满足请求次数是断言提前结束的附带结果。

复核新增断言首次使用“默认图标”标签定位，实际 picker 的 aria-label 为“图标：users”，导致两项桌面测试超时；修正测试选择器，未改产品可访问名称。首次运行由 60 秒工具上限中断，不能算完整测试结果。最终稳定文件运行通过。

复核实际命令（工作区同上）：

- `pnpm --filter @imsweb/web exec prettier --write app/pages/admin/community/components/community-entry-editor-dialog.tsx tests/e2e/community-content-management.spec.ts`：退出 0。
- `pnpm --filter @imsweb/web run test:e2e tests/e2e/community-content-management.spec.ts --workers=1`：最终退出 0，6/6，45.3s，零重试；日志 `/tmp/community-review-e2e-final.log`。
- `pnpm --filter @imsweb/web run test:unit tests/unit/pages/admin/community/admin-community-page.test.tsx tests/unit/e2e/e2e-source-policy.test.ts`：退出 0，2 文件 / 15 用例，3.53s；日志 `/tmp/community-review-unit.log`。
- `pnpm --filter @imsweb/web run lint`、`pnpm --filter @imsweb/web run typecheck`：均退出 0；日志 `/tmp/community-review-lint.log`、`/tmp/community-review-typecheck.log`。
- `git diff --check`：退出 0；`git diff --cached --name-only`：空。

实施阶段完整 Web check 225 文件 / 1582 用例及 build、根 rules/boundaries 日志已核对。复核只新增局部布局 class 和浏览器断言，因此重跑受影响 lint/typecheck/unit/E2E；未重复完整 build 和根门禁。

最终截图复制至 `/tmp/community-admin-review-screenshots/`，独立打开 `desktop-community-editor-op.png`、`desktop-community-dialog-op.png`、`mobile-320x568-community-editor-op.png`、`mobile-320x568-community-dialog-op.png`。列表紧凑，手机编辑与菜单可见，弹窗底部按钮保持可达。手机 full-page 捕获显示既有固定后台 header；实际 viewport 与滚动保护另有几何断言。

验证限制保留：未运行全浏览器矩阵、Firefox、App/device、软键盘或实际服务器图片解码；超长文本/地址没有独立浏览器专用场景，100 项上限由 unit 验证。未修改共享 UI/API/contracts、主检出或其他任务；未暂存、提交、推送、部署、修改 Preview 或归档。跨层 spec 和生命周期仍由主会话处理。

## 主会话收尾复核

主会话已读取最终页面、模型、列表和弹窗源码，确认 Web facade 仅导出现有单项 schema；实际 diff 没有新增 HTTP 方法或修改 endpoint 测试。已打开复核桌面及手机弹窗截图，并更新社区配置规范中的候选确认、上传归属、ID 定位、焦点和测试要求。

规范更新后运行 `node scripts/check-agent-rules.mjs`、`node scripts/check-docs.mjs` 和 `git diff --check`，全部退出 0。一次额外完整 `check:rules` 在调用工具 45 秒上限处中断，不计为完整通过；源代码门禁采用已记录的完整通过结果，本次文档变更采用上述针对性检查。

工作提交 `f21cbbe9fba5b6e26245279b628344cbf383085c` 通过完整正常 pre-commit hook，包含合同 29 用例、迁移 99 通过/15 跳过、路由 6 用例、根规则/边界、contracts build、design lint、Web lint/typecheck 和 API syntax/architecture。候选树与已验证源码一致；主检出其他 29 个受保护路径哈希、原有暂存 patch 均保持不变。
