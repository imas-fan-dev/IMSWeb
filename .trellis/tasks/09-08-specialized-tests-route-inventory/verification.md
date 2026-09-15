# 专项测试与 Route Inventory 验证

Date: 2026-09-09

## Platform 测试归属

四个 Platform profile wire-contract 测试原样移动到 `apps/api/tests/server/platform-profile-wire-contract-conformance.test.ts`。Wiki suite 保留三个 Wiki-owned 测试，标题和断言语义没有改变。

提交：`e4f82db7`。

## Route Inventory

- `scripts/contracts/current-wire-contract-inventory.json` 是唯一追踪的机器产物。
- Markdown 只由 `compile-route-inventory.mjs --report` 按需输出，不参与 freshness。
- semantic freshness 忽略注释、格式和无关源码位移，同时对 route、carrier、policy、response 与 non-JSON linkage 变化失败关闭。
- 两次连续生成得到相同机器产物。
- 基线保持 315 registrations、230 request-consuming routes、306 carriers、608 responses，unresolved diagnostics 为 0。

提交：`fd740ace`。

## Node 安全测试职责

- `node-security.test.js` 现在是 23 行薄聚合器，本身不注册测试。
- 一个共享 fixture 管理一套 PostgreSQL database、compiled listener 和 filesystem tree；连接与 listener 在 force-drop 前由 allocator 关闭，失败句柄保留用于重试。
- 七个 owner 模块分别注册 compiled listener/static adapter、auth、Fudaba、Chronicle/Event、News、Information 和 compiled entry/environment 测试。
- 36 个原测试标题保持唯一且各执行一次；机械对比保留 121 个原断言调用。
- 没有删除测试或行为断言。对 compiled entry 的三个潜在重复项未证明在 process、listener、cwd 与 export 维度完全等价，因此保留。
- 四条 non-JSON manifest 引用改为真实 owner 文件；focused tests 补齐敏感路径 text body/type、namecard 原图字节、Chronicle pending GET/HEAD/404，以及 admin redirect status/location。
- evidence checker 现在拒绝只验证 `typeof callback === "function"` 的伪行为证据，包括 assert 与 expect 写法。

提交：`da401e61`。

## 验证

- owner syntax：9 个模块通过。
- 标题审计：36 expected、36 registered、36 unique，无 skip/todo。
- focused `node-security`：36 passed。
- 正式启用 `test:node`：68 passed、0 skipped。
- `IMS_TEST_POSTGRES_ENABLED=false test:node`：32 passed、36 expected skips。
- PostgreSQL lifecycle：13 passed；孤儿数据库查询为空。
- non-JSON checker：30 manifest entries、29 registered handlers；4 个负向 fixture 通过。
- Platform/Wiki focused tests、完整 API、root runner、rules、boundaries、syntax、typecheck、Hono architecture 和 `git diff --check`：通过。
- `pnpm run test`：API 711 passed、Web unit 1,032 passed。
- `pnpm run check`：通过，route inventory totals 未变化。

## 范围

本子任务没有修改业务 handler、公开 JSON contract、页面 UX、R2 配置或生产数据。Node 变更只涉及测试、共享 fixture 和精确 non-JSON manifest 证据。
