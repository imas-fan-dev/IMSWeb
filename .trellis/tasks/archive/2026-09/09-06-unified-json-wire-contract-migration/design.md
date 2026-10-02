# 全量 JSON Wire 契约迁移设计

## Authority

父任务的 `prd.md` 与 `design.md` 定义产品行为、contracts 所有权、API/Web 数据流、compatibility、
unknown-key policy 和静态门禁。本文件只定义单子任务下的并行执行拓扑与合并边界，不重复设计另一套
contract 架构。

## 执行拓扑

```text
Phase A: baseline and shared foundation (serial)
  -> Phase B: domain work packages (Terra, isolated worktrees, parallel)
  -> Phase C: sequential integration and shared surfaces
  -> Phase D: fail-closed enforcement and full verification (serial)
```

所有 agent prompt 使用相同 Active task：

```text
.trellis/tasks/09-06-unified-json-wire-contract-migration
```

## Phase A: Shared foundation

单一 Terra implementation agent 修改共享基础设施：

- contracts common request-policy/error/response primitives。
- API `request-validation.ts` schema adapter。
- Web `parsed.ts`、`response.ts` 和相关 meta type。
- runtime entrypoint classification 与 Zod-free loader probe。
- report-only wire inventory 和规则 fixture。
- `.rules`、相关 Trellis spec 与基础测试。

Phase A 必须保持旧 `jsonValidator` / `queryValidator` / `paramValidator` 和 `parsed(...)` 调用兼容，使尚未
迁移的业务域继续编译。三个代表端点通过后才进入并行阶段：strict JSON、project query、非 JSON
success + JSON error。

## Phase B: Parallel domain work packages

### B1 Backoffice 与 Admin

拥有 Backoffice auth/session/refresh/logout、admin accounts/audit、相关 contracts 模块、API handler/tests。
Web `admin.ts` 和 root export surfaces 延后到 Phase C。必须保留 canonical editor/op、legacy op gate、token、
Cookie 和 deprecation headers。

### B2 Wiki

拥有 Wiki contracts、API Wiki JSON request/response/error、Web Wiki endpoint 和 Wiki tests。不得重写
multipart carrier；只对 carrier 解码后的 JSON 使用 shared schema。必须保留完整 mutation payload、
body-over-query、legacy identity fallback 和 business-error。

### B3 Platform Identity

拥有 platform auth/account-security/profile/OAuth/provider contracts、API/Web endpoint 和 tests。OAuth
callback query 保持开放，媒体 `v` 显式允许，API 既有 email/Unicode 语义为迁移基线。

### B4 Fudaba 与 Namecards

拥有 Fudaba directory/map/locations/cards/offices/claims/moderation/guest submissions/reactions 及 Namecards
相关 contracts、API/Web endpoint 和 tests。保留重复 `series`、legacy aliases、reaction response 双形态与
runtime-neutral constants。

### B5 Content 与 Editorial

拥有 About、Chronicle、Events、Homepage Links、Information、Live、News、Producer Map 和 Editorial
contracts/API/Web 独立 endpoint/tests。Web 共享 `admin.ts` 延后。必须显式保留 17 个 Editorial passthrough
body 和开放 Tiptap document。

### B6 Delivery 与 Site Packages

拥有 media/site/site-package JSON metadata/error、API handlers/tests 及独立 Web callers。stream、redirect、
HTML、binary、static success 不迁入 contracts；每个 JSON error 必须有 shared schema。保留 `v` query。

## Protected shared files

Phase B agents不得直接提交以下共享文件的最终修改：

- `packages/contracts/package.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/README.md`
- `packages/contracts/entrypoints.json`
- `apps/web/app/lib/api/endpoints/admin.ts`
- `scripts/check-source-rules.mjs` 或新的全局 wire-check script
- `.rules` 和 `.trellis/spec/**`

如果业务模块需要新 export，agent 在结果中提交 surface delta：subpath、source module、root namespace、
README entry 和 runtime class。为本地验证而修改上述文件时，commit 必须把这部分单独列出，供集成者
人工合并，不能覆盖其他 agent 的版本。

## Worktree contract

每个 Phase B agent：

1. 从 Phase A 集成 commit 创建独立 worktree。
2. 只处理一个 work package，不跨域修复。
3. 先运行该域现有聚焦测试，记录基线。
4. 同时迁移 contracts、API、Web 和测试，避免留下单边 contract。
5. 运行 contracts build、API/Web typecheck 和聚焦测试。
6. 创建一个可审查 commit，并报告 touched files、surface delta、测试与遗留风险。

Agent 不直接合并分支。主会话逐个检查 diff 后按依赖顺序合并。

## Phase C: Integration

集成阶段按以下顺序处理：

1. 合并 B1 至 B6 的领域 commits；每次合并后运行 contracts build 和相关 typecheck。
2. 汇总所有 contracts exports、root namespaces、README 和 entrypoint classifications。
3. 一次性迁移 Web `admin.ts`，接入 B1/B5/B6 的 shared schemas。
4. 解决共享 type/schema 命名冲突，禁止通过宽泛 union 或 passthrough 掩盖冲突。
5. 刷新完整 route/request/response/exception inventory。
6. 运行业务 wave tests，修复仅由跨域组合暴露的问题。

## Phase D: Enforcement

独占执行最终门禁：

- 将 report-only AST/type-aware checks 切换为 fail-closed。
- 验证每个 API JSON request/response terminal type 来自 contracts。
- 验证每个 Web JSON call 使用 contracts success/error schema。
- 验证生产 `skipContractCheck` 为零。
- 验证非 JSON success exception 存活并有测试。
- 验证 Zod-free entrypoint 的 source graph 和 fresh-process loader。
- 运行 root `check`、`test` 和 `test:web-routing`。

## Merge conflict policy

- 不使用自动冲突偏向选项覆盖一侧。
- 同一 schema 名称冲突时，以实际 wire shape 和父任务 inventory 为准。
- 同一共享文件包含多个 surface delta 时，由集成者逐项重建，不直接采用任一分支整文件。
- 任何 agent 修改了不属于其 work package 的业务文件，该部分不合并并重新派发。
- 合并后立即运行该 commit 声明的聚焦测试；失败则回退该 commit，不让后续批次建立在失败状态上。

## Rollback

Phase B 的每个 commit 是一个业务回滚单元。Phase A 基础保持向后兼容，可在业务迁移回滚后继续存在。
Phase D 门禁单独提交，误判时只回退阻断行为。兼容路由、Cookie、status、error body 和 non-JSON success
不作为回滚清理对象。
