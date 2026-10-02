# 全量 JSON Wire 契约迁移执行计划

## 0. 启动前

- [x] 确认父任务最终规划已由用户批准。
- [x] 父任务和本子任务的 `prd.md`、`design.md`、`implement.md` 均通过 convergence review。
- [x] `implement.jsonl` 与 `check.jsonl` 包含真实 spec/research context。
- [x] 运行 `task.py start` 使父任务与本执行子任务进入 `in_progress`。
- [x] 读取 `trellis-before-dev`，记录 Node、pnpm、git、local data 和服务前提。
- [x] 记录基线命令及退出状态。

基线命令：

```sh
node --version
pnpm --version
pnpm run dev:doctor
pnpm run check:rules
pnpm run check:boundaries
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
```

## 1. Phase A: Shared foundation

- [x] 更新仓库/API/contracts 规则，允许 schema runtime import 仅存在于 request-validation 边界。
- [x] 更新 Trellis contracts/API/Web spec，删除“error body API-local”和“API contract import 全部 type-only”旧规则。
- [x] 在 contracts 增加 strict response/error primitives。
- [x] 增加显式 strict/legacy-strip/legacy-passthrough request object 构造方式。
- [x] 保证 common success/page-info 组合器生成 exact response object。
- [x] 扩展 API validator，支持 contracts schema、现有错误文案、mislabeled JSON 和 parse 后 adapter。
- [x] 扩展 Web `parsed(...)`，支持 HTTP error 和 2xx business-error schema。
- [x] 增加 raw/parsed JSON 深比较，覆盖 object、array、scalar 和 `null`。
- [x] 建立 runtime entrypoint classification 和 Zod-free loader tests。
- [x] 建立 report-only wire inventory 和正反 fixture；type-aware fail-closed 分析留到 Phase D。
- [x] 以 strict、project/passthrough 和 non-JSON success + JSON error 的聚焦边界测试验证基础层。
- [x] 独立 Terra check agent 审查并修复 Phase A。
- [x] 形成 foundation commit `c9860b5`，作为所有并行 worktree 的共同基线。

Phase A 验证：

```sh
pnpm --filter @imsweb/contracts run build
pnpm run check:rules
pnpm run check:boundaries
python3 -m unittest tests/test_source_rules.py
TSX_TSCONFIG_PATH=apps/api/tsconfig.server.json node --import tsx --test \
  apps/api/tests/server/request-validation-boundaries.test.ts \
  apps/api/tests/server/handler-model-contract.test.ts
pnpm --filter @imsweb/web run test:unit tests/unit/lib/api/api.test.ts
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
```

## 2. Phase B: Terra parallel work packages

所有实现 agent 使用 `model: terra`、独立 worktree 和同一个 Active task。一次并行派发 B1 至 B6。

### B1 Backoffice 与 Admin

- [x] 迁移 login/session/refresh/logout request/success/error。
- [x] 区分 canonical 与 legacy op-only error contract。
- [x] 迁移 admin accounts/audit 及 API-only JSON wire。
- [x] 修复 handler response alias 和 HTTP raw-equality tests。
- [x] 增加 editor/null、op、token、Cookie、deprecation headers 回归。
- [x] 输出 Web `admin.ts` surface delta，留给集成阶段。

### B2 Wiki

- [x] 扩展 mutation schema 到完整 handler payload。
- [x] 迁移 Wiki JSON params/query/body/error contracts。
- [x] 分离 story-link delete body/query schema并保留 precedence adapter。
- [x] 以 shared schema 验证解码后的 `sources_json`。
- [x] 迁移 Web Wiki success/error/business-error parsing。
- [x] 覆盖 compatibility paths、mislabeled JSON、CSRF、editor 和 multipart 行为。

### B3 Platform Identity

- [x] 迁移 platform auth/session/email verification/reset/account-security/profile wire。
- [x] 迁移 OAuth link/callback/provider management wire。
- [x] 将 email、Unicode length、provider path、scope、timestamp 统一到既有 API 语义。
- [x] 保留开放 OAuth callback query。
- [x] 为媒体 query 声明可选 `v`。
- [x] 保留所有现有 strict 负例。

### B4 Fudaba 与 Namecards

- [x] 迁移 directory/map/locations/cards/offices/claims/moderation/guest submissions/reactions。
- [x] 抽取 Zod-free reaction tuple 和 map predicate constants。
- [x] 保留 query aliases、重复 `series`、coordinate/revision/control-char 行为。
- [x] 区分 legacy `{ success: true }` 与 current `{ ok: true }` mutation。
- [x] 为 card/office/moderation media 声明可选 `v`。
- [x] 补齐 mounted-route HTTP conformance。

### B5 Content 与 Editorial

- [x] 迁移 About、Chronicle、Events、Homepage Links、Information、Live、News、Producer Map。
- [x] 替换 API-local success/error interface 和 Web-local response generic/schema。
- [x] 迁移 Editorial article/post/event/chronicle/assets/spotlight/revision/status wire。
- [x] 显式保留 17 个 passthrough body。
- [x] 保留开放 Tiptap `bodyJson` 和 API-local semantic validation。
- [x] 迁移三个未 parsed 的 Web Editorial calls；共享 `admin.ts` 只输出 delta。
- [x] 保留退役 Information `410` 行为。

### B6 Delivery 与 Site Packages

- [x] 迁移 media/site/site-package JSON metadata 和 JSON error。
- [x] 分离 site-package create 与 create-revision exact response schemas。
- [x] 保留 stream、redirect、HTML、binary 和 static success 本地边界。
- [x] 为 site-content 声明可选 `v` query。
- [x] 为每个非 JSON success 准备 exception record 与聚焦测试证据。
- [x] 输出新增 package surface delta。

每个 worktree 最低验证：

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm run check:boundaries
```

另运行该业务域 API/Web 聚焦测试。每个 agent 必须提交一个 commit，并返回 touched files、surface delta、
命令结果和未解决风险。

## 3. Phase C: Sequential integration

- [x] 审查 B1 至 B6 的实际 commit 与 touched files，不仅依赖 agent 摘要。
- [x] 逐个合并；每次合并后运行 contracts build 和受影响 workspace typecheck。
- [x] 汇总 `packages/contracts/package.json` exports。
- [x] 汇总 `packages/contracts/src/index.ts` root namespaces。
- [x] 汇总 `packages/contracts/README.md` 和 entrypoint runtime classification。
- [x] 一次性迁移 Web `app/lib/api/endpoints/admin.ts`。
- [x] 解决重复 schema/type 名称，不用宽泛 union 或 passthrough 掩盖冲突。
- [x] 清理剩余本地 JSON wire declarations 和生产 `skipContractCheck`。
- [x] 刷新完整 route、request、response 和 non-JSON exception inventory。
- [x] 运行 domain-wave tests；失败时回退最近合并 commit并修复。

重点回归：

```sh
TSX_TSCONFIG_PATH=apps/api/tsconfig.server.json node --import tsx --test \
  apps/api/tests/server/backoffice-auth-boundary.contract.test.ts \
  apps/api/tests/server/request-validation-boundaries.test.ts \
  apps/api/tests/wiki/wire-contract-conformance.test.ts \
  apps/api/tests/wiki/security-crud.contract.test.ts

pnpm --filter @imsweb/web run test:unit \
  tests/unit/lib/api/api.test.ts \
  tests/unit/lib/api/endpoints/admin.test.ts \
  tests/unit/lib/api/endpoints/wiki.test.ts \
  tests/unit/layouts/admin-layout.test.tsx
```

## 4. Phase D: Enforcement

- [x] 对所有 API JSON validator 和 `c.json(...)` emitter 启用 fail-closed contract ownership 检查。
- [x] 对所有 Web JSON endpoint 启用 shared success/error schema 检查。
- [x] 禁止生产 `skipContractCheck`。
- [x] 核对 non-JSON exception 的 stable ID、symbol、kind、reason、error schema 和 test。
- [x] 检查 package exports、root namespace、README、entrypoint classification 和 dist output 一致。
- [x] 运行 fresh-process Zod-free loader probe。
- [x] 用负例 fixture 证明门禁会拒绝本地 wire shape 和非法 runtime schema import。
- [x] 运行独立 Terra check agent；只保留已验证 finding。

## 5. Final verification

```sh
pnpm --filter @imsweb/web run format
pnpm run check
pnpm run test
pnpm run test:web-routing
```

- [x] `lens_diagnostics mode=all` 无 edited-file blocking error。
- [x] 父任务每条 Acceptance Criterion 映射到文件和测试。
- [x] 未知字段策略与 41/161/17/64 基线一致。
- [x] 223 method/path 和 283 request carrier 无遗漏。
- [x] 所有并行 worktree commit 已审查、合并或明确拒绝。
- [x] 更新相关 Trellis spec，记录可执行规则而非迁移过程。
- [x] 按 Conventional Commit 提交父任务与执行子任务变更。

## Stop-the-line

- 任何 status、错误文案、Cookie、CSRF、redirect、compatibility 或 unknown-key 行为变化。
- 任何 response schema parse 后与 raw JSON 不等。
- API handler/domain/repository/infra/runtime 执行 contracts schema或直接加载 Zod。
- Web error 未经 shared schema 校验。
- 动态 route 只能靠宽泛豁免通过。
- 并行 agent 越界修改另一个 work package 或受保护共享文件。
- 聚焦测试无法证明 Backoffice editor 或 Wiki payload 约束。
