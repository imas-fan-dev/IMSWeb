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


## Session 6: 对齐 Trellis spec 与仓库 docs 到已落地代码
<!-- trellis-session: v=2 fp=d79e46e7b852162f -->

**Date**: 2026-09-19
**Task**: 对齐 Trellis spec 与仓库 docs 到已落地代码
**Branch**: `release/v1.1`

### Summary

按已落地代码校正两层文档。.trellis/spec 作为 AI 可执行契约：修正五处与实现冲突的陈述，补齐账号管理、app OAuth 深链与一次性码交换、管理端平台用户、CI 证据留存等缺失契约。docs/ 作为人阅读层：标出两份文档里“已设计但从未实现”的内容（账号注销、注销时匿名化、platform_email_change_requests 表），修正一批被代码推翻的陈述，并补齐缺失的运维与导航说明。

### Main Changes

- 修正 5 处与代码冲突的陈述：OAuth request schema 的 strict 断言改为带豁免的默认、打包 App 的 localStorage token custody、路由清单迁移到 app/route-metadata.ts、api/backend 范例改指 identity/platform-auth、边界 ratchet 只断言 root 57 / api 43 / web 21。
- 新增 .trellis/spec/api/backend/authentication.md：cookie 与 bearer 双会话通道、app OAuth 回跳与一次性码交换（含先消费后比对与重放拒绝）、provider 证书信任策略、绑定安全事件同事务写入。
- 补齐头像对象存储投递、平台用户审计动作词汇、邮件 worker 运行时、Playwright 失败证据留存与 deploy.yml job 图、文档元数据门禁、.rules 优先的权威模型。
- docs/architecture/platform-account-security.md：加入实现状态表，标出注销与写入式匿名化未实现（并列出已就绪的 CHECK 约束、配对约束与 403 拒绝），决策三换绑邮箱改写成实际设计（共享验证码表 + 域分离 HMAC，只需当前密码与新邮箱验证码）。
- docs/ 修正被代码推翻的陈述：验证码已事务入队而非同步等 SMTP、限流窗口已迁到 Valkey、schema 下限、缓存的错误路径与 cooldown 字段、script 计数 57/43/21、config 权威路径、node --test 无法执行的命令、六个资产 SHA-256。
- docs/ 补齐：邮件 worker 与其队列、app 深链常量与回跳通道（provider 配置无需变动）、缺失的 editorial 域与 admin platform-users、deep-link 注册与 PKCE verifier 保管。
- 统一文档语气：新增内容不含 em dash，与 docs/ 每千行 4.5 处的既有密度一致。

### Git Commits

| Hash | Message |
|------|---------|
| `squashed` | docs: align the specs and repo docs with the landed work |

### Testing

- [OK] pnpm run check:rules 通过：source rules 895 文件、wire audit 0 violations、route inventory 244 条、docs rules 25 文件。
- [OK] .trellis/spec 全部 22 个 Markdown 文件与 docs/ 全部 25 个文件零断链、零断锚，且不含日期快照或 retired path。
- [OK] pre-commit 钩子全绿：contracts 29、api migration 114、web routing 4 测试，加 web lint、typecheck 与 Hono architecture 381 模块。
- [OK] trellis-check 独立核验 spec 层，修正 3 处事实错误（email worker 脚本归属、wiki README 高扇入标注、loopback 例外自相矛盾）。
- [OK] docs 层由三个只读审计子代理逐文件对账代码，报告中的每条陈述均在改写前打开源文件复核；审计自身的一处错误（声称 script 计数无人守护）也被反查纠正。

### Status

[OK] **Completed**

### Next Steps

- 无：两层文档已与当前代码对齐，后续新契约随实现同批补齐。
