# Journal - imsweb (Part 1)

> AI development session journal
> Started: 2026-09-03

---

## Session 1: 修复移动端 GPS 定位
<!-- trellis-session: v=2 fp=254ab737f091bd69 -->

**Date**: 2026-09-03
**Task**: 修复移动端 GPS 定位
**Branch**: `release/v1.1`

### Summary

接入 Tauri geolocation，补齐 Android/iOS 权限与一次性定位适配，完成自动化验证、Release 产物检查及 A059 和 iPhone-texas 双端真机验收。

### Git Commits

| Hash | Message |
|------|---------|
| `2a02f633` | fix(web): restore mobile geolocation |

### Status

[OK] **Completed**

## Session 2: 社区动态移动端适配
<!-- trellis-session: v=2 fp=01d827c543aaadcd -->

**Date**: 2026-09-03
**Task**: 社区动态移动端适配
**Package**: web
**Branch**: `release/v1.1`

### Summary

完成首页、社区动态列表与详情的移动端 Web 和 Tauri App 适配，并补齐多视口回归与原生模拟器验证。

### Main Changes

- 适配 HomeFeed、ActivityHighlights、Events 列表和详情的窄屏布局、触控信息与 App 安全区。
- 固定列表行与骨架为 176px，约束长文本和 CMS 富文本，保留 Web/App 返回行为差异。
- 新增 Web 与 App 社区动态端到端流程，覆盖刷新、分页、封面预览和安全区几何。

### Git Commits

| Hash | Message |
|------|---------|
| `763dd43` | feat(web): adapt community updates for mobile |
| `195031b` | chore(task): archive community-updates-mobile |

### Testing

- [OK] Web lint、typecheck、836 个完整单元测试、生产构建与 build:app 通过。
- [OK] Web Playwright 6/6、App 五视口 Playwright 5/5 通过。
- [OK] app:doctor 通过；iOS 与 Android 模拟器均完成构建、安装和启动。

### Status

[OK] **Completed**

## Session 3: 优化社区动态响应式布局
<!-- trellis-session: v=2 fp=47433fc0181f4860 -->

**Date**: 2026-09-03
**Task**: 优化社区动态响应式布局
**Branch**: `release/v1.1`

### Summary

将公开社区动态列表统一收紧为 144px 固定行高，重排右侧标题、分类与元信息，并同步虚拟列表、骨架和响应式回归测试。

### Main Changes

- 社区动态条目、骨架和虚拟列表估高统一为 144px。
- 分类标签移到右侧标题下方，发布者、日期与可选联系方式保持独立纵向行。
- 补充固定高度、中心对齐、文本可读性、溢出和图片加载稳定性的 Web/App 覆盖。

### Git Commits

| Hash | Message |
|------|---------|
| `57face2` | fix(web): refine community update list layout |
| `2e6f301` | chore(trellis): archive community feed layout task |

### Testing

- [OK] Events 单元测试 14/14 通过。
- [OK] Web Playwright 2/2、App Playwright 5/5 通过。
- [OK] 规则检查、LSP、lint、类型检查和生产构建通过。

### Status

[OK] **Completed**

## Session 4: Split CI by affected workspace
<!-- trellis-session: v=2 fp=c90eda7aa7984cff -->

**Date**: 2026-09-03
**Task**: Split CI by affected workspace
**Branch**: `release/v1.1`

### Summary

将 ci.yml 单一 validate 任务按变更路径拆分为检测器与五个条件校验任务及聚合结果任务，新增可单元测试的受影响工作区检测器，并先修复 App Playwright 基线再将其设为必需门禁。

### Main Changes

- 新增 scripts/ci/detect-affected-workspaces.mjs 与 tests/ci-affected-workspaces.test.js，覆盖 merge-base/push 基线、NUL 分隔 name-status、有序路径分类、删除与重命名、fail-open 语义。
- ci.yml 拆分 changes/repository/app/web/api/integration/result；PostgreSQL 仅属于 api 任务；result 保留 Validate repository 显示名并校验选中与跳过一致性。
- App 端 Wiki dial 弹层改为安全内边距锚点，普通 Web 保持原左下裁剪布局；app-shell E2E 导航断言更新为 社区动态。
- 新增 .trellis/spec/repository/ci.md，固化受影响工作区 CI 的可执行契约。

### Git Commits

| Hash | Message |
|------|---------|
| `squashed` | feat(ci): split validation by affected workspace |

### Testing

- [OK] 受影响检测 26/26、workflow 契约 13/13、test:infra 60 Node + 87 Python、Web check 838 测试与生产构建、App Playwright CI 模式 29 通过 16 预期跳过、完整 API 数据库套件本地通过。

### Status

[OK] **Completed**


## Session 5: 完成 CMS 文章标题回填
<!-- trellis-session: v=2 fp=1b8566714d53e25c -->

**Date**: 2026-09-04
**Task**: 完成 CMS 文章标题回填
**Branch**: `release/v1.1`

### Summary

实现默认 dry-run、显式 apply 的 CMS 中文方括号标题回填；事务内同步文章与活动标题，保留并前置正文，生成 0600 审计报告。专项测试 9/9、完整 migration 套件 111/111 通过；本地备份后更新 9 条并以第二次 apply 验证幂等。

### Git Commits

| Hash | Message |
|------|---------|
| `1dd6ffb` | feat(api): add CMS article title backfill |

### Status

[OK] **Completed**
