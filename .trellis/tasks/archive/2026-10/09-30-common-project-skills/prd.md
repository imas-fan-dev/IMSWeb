# IMSWeb 核心开发 Skill

## Goal

创建去重后的 IMSWeb 项目专属常用 skill 集合，覆盖浏览器测试、测试选择与回归、开发环境、App 设备交付、规则文档检查和发布前验证。用户要求本任务全部完成，包含 skill 文件创建和验证。

## Background

权威流程分布在 `docs/development/testing.md`、`.trellis/spec/web/frontend/testing.md`、`docs/development/app-device-delivery.md`、`apps/web/.rules`、根 `AGENTS.md` 和 workspace scripts。`.agents/skills/` 已有 Trellis 通用流程 skill。另有个人项目 skill：`imsweb-android-preview-install` 管理已发布 Android preview APK，`imsweb-ios-personal-team-install` 管理当前源码的 iPhone personal-team 安装；新建项目仓库 skill 应明确链接/委托它们，不复制成冲突指引。

## Requirements

- R1. 创建精简且覆盖原十项候选的核心 skill 集合，按单一职责划分，列明名称、触发条件、操作边界、权威文档、命令选择与验证证据。
- R2. E2E skill 明确区分普通 Web Playwright、App WebView 浏览器测试与真机/模拟器原生验证；遵守 fixture/API dispatcher、零 retry、禁固定等待等现有规范。
- R3. 测试回归 skill 用 `docs/development/testing.md` 和实际 scripts 路由 Web unit、API、仓库 owner、集成与 CI 命令，不发明别名。
- R4. 开发环境 skill 按 `dev:doctor`、`dev`、`dev:down` 的既有生命周期执行；停止服务前确认归属，不删除数据卷。
- R5. App 交付 skill 使用 `app:doctor`、`app devices`、`app ios/android` 唯一封装；区分本地构建与已发布 artifact，要求精确设备、origin 和验证；不得擅自卸载、清数据、重签或发布。
- R6. 质量、规则及文档验证合并为一项聚焦验证 skill，按改动范围选择 `check:rules`、`check:pre-commit`、workspace checks、完整 `check`/owner 测试；说明检查覆盖边界。
- R7. 发布准备内容纳入验证 skill，检查产物、版本、测试和签名准备，但发布动作必须另获用户明确授权。
- R8. 保留现有 Android Preview 安装与 iOS Personal Team 安装 skill，不覆盖；在 App 交付 skill 中提供明确委托入口及范围区分。
- R9. skill 文档可从对应触发描述中找到，步骤可按现有命令验证；不得含虚构命令或与权威规范冲突的独立副本。

## Acceptance Criteria

- [x] AC1. `.agents/skills/` 中新增五项去重后的项目核心 skill；每份均含有效 frontmatter 与 When to Use、Procedure、Pitfalls、Verification 段落。结构检查通过。
- [x] AC2. 十项候选归属已列于 `design.md`：E2E 合并为 Playwright；unit/API 合并为测试路由；开发检查为本地环境；平台安装归 App 交付；质量/文档/发布准备归质量与发布准备。
- [x] AC3. E2E skill 区分 Web、App WebView 与原生设备证据；App 交付 skill 要求确认设备和风险，禁止将浏览器结果等同原生验证。
- [x] AC4. 新 skill 引用现有 scripts、测试 owner 和文档规则；高风险发布动作须明确授权。
- [x] AC5. 两项既有个人安装 skill 未修改；App 交付 skill 按已发布 Android preview 和 iOS personal-team 场景委托。
- [x] AC6. `pnpm run check:rules` 通过；Trellis 清单结构核验通过；命令语法经脚本/权威文档核实。评审发现的 doctor 调用已改正并核实为 `pnpm run app doctor --platform <ios|android>`。

## Out of Scope

- 不修改产品源码、测试、CI、package scripts、发布流程或设备工具链。
- 不在本任务中实际安装 App、签名、卸载、清理数据或发布。

## Open Questions

无。用户已确认创建去重后的核心 skill，并要求本轮全部完工。
