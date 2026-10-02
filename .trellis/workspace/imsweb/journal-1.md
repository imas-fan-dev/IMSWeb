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


## Session 7: 统一测试执行到 Vitest 并接入报表与覆盖率
<!-- trellis-session: v=2 fp=9ae00a215ca843ef -->

**Date**: 2026-09-19
**Task**: 统一测试执行到 Vitest 并接入报表与覆盖率
**Package**: web
**Branch**: `release/v1.1`

### Summary

把 API 与根契约/治理两个执行域从 Node 内置 test runner 迁到 Vitest，让三个执行域共用一套 runner 形态；同时从零接入 JUnit XML 与 v8 覆盖率：三域配置各自同形，CI 上传报告 artifact，API 与 Web 设以实测基线起步的阈值门禁，仓库契约与治理域只产 JUnit。Python unittest 与 Playwright 未动。分支 chore/vitest-test-unification 以 squash 方式并入 release/v1.1。

### Main Changes

- API 域：新增 apps/api/vitest.config.mts（node 环境、fork 隔离、@ 指向 src），134 个用例文件迁到 Vitest；CJS 测试文件 ESM 化，3 个迁移测试按需带 tsx/cjs 加载器；PostgreSQL 适配器上移到 tests/postgres-test-database.ts，TestContext 的 t 参数换成 onTestFinished 与 ctx.skip。
- 类型门禁合并为一条：新增 apps/api/tsconfig.tests.json 覆盖 src 与 tests/**，取代 tests/server 与 tests/wiki 各自的 tsc；apps/api/tests/tsconfig.json 只为编辑器保留；API plan 收敛为 build + syntax + architecture + 一次 Vitest 全量，apps/api 的 package script 仍为 43 个。
- 仓库域：9 个根 node:test 文件迁到 Vitest，由 apps/api 宿主（根 package.json 只能声明 husky），根域配置保持无 import 的普通对象导出；run-test-owner.mjs 的冻结 plan 形状与逐文件清单不变，--config 传绝对路径。
- 报表与覆盖率：三域同形配置，CI 产出并上传 reports/junit-<domain>.xml；覆盖率由 IMS_TEST_COVERAGE_ENABLED 打开，只设在两个衡量整个域的 CI 步骤上（若按 CI 判定，App lane 的单文件 Web 运行与 integration lane 的 test:assets 会撞上全域阈值）；阈值取实测基线下取整且只能上调（API 79/66/84/76、Web 73/67/67/70）；仓库域只产 JUnit，因为三次调用共用一份 scripts/** 分母，最小口径 1.36%，而 CPU 密集的 contracts 要多付约 40s。
- 治理与文档：新增 tests/vitest-reporting.test.mjs 守住三域配置不变量与 CI 旗标位置；docs/development/testing.md 新增“报告与覆盖率”并重测 pre-commit 耗时；api 与 web 的 testing spec 同步；父任务与三个子任务的 prd/design/implement/verification 随本次合并进入仓库。
- 合并操作：主检出先删除此前为集中 Trellis 状态建立的 .trellis/tasks 符号链接，再 git merge --squash；主检出需先 pnpm install（vitest 声明在 apps/api），否则 pre-commit 的 contracts owner 找不到 vitest 而失败。

### Git Commits

| Hash | Message |
|------|---------|
| `f9a1358f` | test: run the whole suite on Vitest with JUnit reports and coverage gates |

### Testing

- [OK] [OK] pnpm run test 退出 0，364s：governance 4 文件/64 用例 + Python Ran 123、contracts 3/29、delivery root 3/27 + Python Ran 2、delivery integration test:assets 2/10、API 134 文件/884 用例、Web 220 文件/1534 用例。
- [OK] [OK] pnpm run check 退出 0，208s（含 Web lint/typecheck/build 与 API architecture 381 模块）；pnpm run check:pre-commit 退出 0，166s，首次作为单条命令跑通。
- [OK] [OK] 覆盖率双向验证：CI 旗标下 API 76.66/66.15/84.03/79.74 与 Web 70.5/67.85/67.32/73.43 均过阈值并退出 0；单文件运行（vitest run --coverage tests/wiki）打印四条 ERROR: Coverage for 并退出 1。
- [OK] [OK] PostgreSQL 关闭路径 218 个跳过与迁移基线一致；三份 JUnit 文件逐份解析（884/1532/5 个 testcase，classname 为测试文件路径）。
- [OK] [OK] 合并后树的 git diff 与分支内容为空，即通过全部验收的树就是落地的树；提交哈希 f9a1358f。

### Status

[OK] **Completed**

### Next Steps

- 迁移无待办项。若要收紧覆盖率，在 API 与 Web 的实测值上小幅上调阈值即可，仓库域要先合并三次调用的覆盖率收集再考虑门禁。分支 chore/vitest-test-unification 仍在本地且已 squash，仅作审计用，不需要粒度历史即可删除。


## Session 8: Vitest UI 面板与全仓测试归类（test.describe）
<!-- trellis-session: v=2 fp=2a505ae610c62a45 -->

**Date**: 2026-09-20
**Task**: Vitest UI 面板与全仓测试归类（test.describe）
**Branch**: `chore/vitest-ui-and-test-taxonomy`

### Summary

把本地 Vitest UI 面板接到三个测试域，并把 API、根域、e2e 与 Web 单测的用例按主体归类到 describe；API 侧同时把同族文件合并到 72 个文件。

### Main Changes

- 面板：根 vitest.config.mts 用对象式 test.projects 挂载三个域配置，显式钉住各 workspace root、为三个 project 设不同 groupOrder、并加只服务面板的 cwd 桥 setupFiles——Vitest 4.1.11 的字符串式 project 会把 root 落到配置文件目录、跨 project 混用 maxWorkers 会被拒、forks worker 的 cwd 停在面板启动根，这三点必须绕开；根 devDependencies 由 husky 扩到 husky+vitest+@vitest/ui，根脚本上限 57→58，新增 6 个用例的漂移守卫 tests/vitest-projects.test.mjs。
- API 归类：apps/api/tests 按「顶层主体 + 连续 ≥2 条共享 ≥3 词字面前缀才开二级」归类，626 条全名无损（判据细化为「旧全名是新全名的字面尾段且唯一」），约定写进 spec/api/backend/testing.md 的 File and suite layout。
- API 合并：同族文件合并到 72 个文件（20 个族、82 个成员并入），每个原文件的 describe 保留在独立词法块内；合并器处理跨模块同名绑定（可证明的 re-export 保留 barrel 导入，否则按成员改名），非 JSON 边界分析器的 callee 白名单接受 postgresTest。
- 根域/e2e/Web 归类：根域 9 文件、e2e 41 spec、Web unit 5 文件；根域与 e2e 一律不加二级，因为 Playwright 的层级分隔符是空格而非「 › 」之外的写法、吸收短语会让旧标题路径不再是新路径的字面尾段。
- 顺序依赖缺陷：node-security 的 chronicle 夹具在 --sequence.shuffle 下因 metadata 目录不存在而失败，复现于归类与合并之前的旧版本，修在 tests/node-security/fixture.js。
- 收敛评估：Web 单测不做文件合并——干线只有 7/29 个族通过，被拒理由大部分是合并器在 Web 形状上不可信（跨行 vi.mock 工厂让逐行 import 解析把 ) 与 href 当标识符，进而把 vitest/testing-library 的同名全局算成两个符号），结论与数据留在任务 design §7 与 evidence。

### Git Commits

| Hash | Message |
|------|---------|
| `874d4e6f` | feat(test): add a root Vitest panel across the three test domains |
| `1c446a60` | test(api): group the first server batch under subject describes |
| `f5a23cdf` | test(api): group the second server batch under subject describes |
| `2e7d919d` | test(api): group the third server batch under subject describes |
| `27828b24` | test(api): group the wiki, migration, asset and top-level suites |
| `d65a0c25` | test(api): group the fourth server batch under subject describes |
| `17d4172f` | test(api): merge same-family suites into subject files |
| `1ddcee10` | test(api): nest the two runs the first batch left flat |
| `51d9d41e` | test(api): keep the event chronicle fixture directory present |
| `5c1a61b9` | docs(trellis): record the API test layout conventions |
| `26f5f36c` | test(repository): group the root suites under subject describes |
| `128b1f3a` | test(web): give each Playwright spec a named flow |
| `9094facc` | test(web): group the larger Web unit suites by behaviour |
| `da7778f5` | docs(trellis): record the Web and root suite layout conventions |

### Testing

- [OK] 面板与三域独立运行逐项对齐：365 文件 / 2544 用例（api 134/884、web 220/1534、repository 11/126）。
- [OK] API：PG 关闭路径 884 用例中 666 passed / 218 skipped 与迁移前一致；--sequence.shuffle 种子 20260920、7、99、12345 全绿；四个提交的 pre-commit 链全绿。
- [OK] 归类后验收：governance 5/71 + Python Ran 123 OK、contracts 3/29、delivery root 3/27 + Python Ran 2、delivery repository 1/6、Web unit 220/1534、Playwright Web 配置 122 passed/11 skipped 与 App 配置 58 passed/9 skipped。
- [OK] 合并后验收：apps/api 72 文件 / 884 用例（PG 关闭 666 passed / 218 skipped）、墙钟 32.10s → 28.06s；test:migration 11 文件 / 114 用例。

### Status

[OK] **Completed**

### Next Steps

- 父任务 09-19-vitest-ui-and-test-taxonomy 只剩 09-19-root-vitest-ui 的 AC6（推送后 CI 全绿）未验证，另两个子任务已归档。
- 分支 chore/vitest-ui-and-test-taxonomy 未推送、未合并；是否 squash 合并到 release/v1.1 与是否推送由用户决定。
- 若要让 Web 单测的二级分组彻底完整，把「单 describe ≥10 用例」的采样阈值下调并重放同一机械判据即可（残留 6 个候选段已逐条记录）。
- .trellis/tasks 下的任务目录与会话日志按惯例留到合并收尾时作为最后一次文档提交入库。
