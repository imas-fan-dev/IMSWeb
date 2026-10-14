# 统一 API 请求响应契约设计

## 设计目标

本次迁移把所有 HTTP JSON wire shape 收敛到 `@imsweb/contracts`，同时保持现有路径、状态码、
兼容路由、错误文案、未知字段策略和非 JSON 传输行为。设计只扩展仓库已有的 API validator 与 Web
`parsed(...)` 链路，不增加第二套路由清单或每端点 descriptor。

## 所有权边界

### `@imsweb/contracts`

Contracts 是以下结构的唯一来源：

- JSON body、query 和 route params 的原始 wire schema。
- JSON success、HTTP error 和 `2xx` business-error schema。
- schema 对应的 `z.input`、`z.infer` 及索引派生类型。
- 跨域通用 success/error/page-info 组合器。
- request schema 使用的 runtime-neutral 常量。

Contracts 不拥有 Hono context、Cookie/header、repository record、`File`、`FormData`、`UploadedFile`、
stream、redirect、HTML、binary、静态资源响应或浏览器请求状态。

### API

API 只在 HTTP request validation 边界执行 contracts schema：

```text
Hono raw request
  -> jsonSchemaValidator/querySchemaValidator/paramSchemaValidator
  -> contracts schema
  -> route-local normalization and semantic validation
  -> handler input
```

`routes.ts` 可以 value-import request schema。领域 `request.ts` 保留 schema 解析后的归一化、跨字段规则和
业务输入适配，但不重新声明 wire object。handler、response、port、repository、infra 和 runtime 只能
使用 contract type，不能执行 schema，也不能直接导入 Zod。

API response builder 继续负责 repository record 到 wire DTO 的映射，但其返回类型必须是 contracts
导出的类型。JSON error 构造也必须使用 contracts type。API 生产代码不在序列化前重复 parse response；
真实 HTTP 测试负责验证输出。

### Web

Web endpoint 使用 contracts request type 构造 JSON、query 和 params，并用 contracts schema 验证所有
JSON response。Web 仅保留 UI 语义别名、页面状态、浏览器对象和 `File`/`FormData` carrier。

```text
Web request input
  -> endpoint request mapping
  -> API route schema validation
  -> local API adapter and handler
  -> contract-typed response builder
  -> Web parsed(successSchema, { errorSchema, businessErrorSchema })
  -> optional UI select projection
```

## 不引入 endpoint descriptor

现有代码已经通过 route registration、path builder 和 `parsed(schema, config)` 表达端点。再为 223 个
method/path 建 descriptor 会重复路径或 schema-to-route 关联，并扩大并行迁移冲突。

本次采用以下关联方式：

- API route 直接把 request schema 传给 schema validator。
- API handler 的 `c.json(...)` body 通过 contracts 类型别名或 `satisfies` 约束。
- Web `parsed(...)` 直接持有 success、error 和 business-error schema。
- AST/type-aware 检查从现有 route、handler 和 Web endpoint 源码派生覆盖清单。
- 非 JSON success 通过单独的受审例外表登记；其 JSON error 仍需 shared schema。

若迁移后仍无法可靠关联动态路由，才针对该注册点增加紧邻 metadata，不建立全局手写 endpoint manifest。

## Schema 组织

继续遵循 flat-first 结构。已有 domain 优先扩充原模块；只有第二个独立关注点出现时才升级为目录。

命名规则：

- Request：`fooRequestSchema`、`fooQuerySchema`、`fooParamsSchema`。
- Response：`fooSuccessResponseSchema`、`fooErrorResponseSchema`。
- 兼容分支：名称包含 `legacy`、`compatibility` 或具体 route 语义。
- 输入和解析结果不同：导出 `FooRequestInput = z.input<...>` 与
  `FooRequest = z.infer<...>`。
- Response type 使用 `FooSuccessResponse` / `FooErrorResponse`，不使用 request coercion schema 代替。

`common.ts` 提供严格的通用原子与组合器，例如 `{ error }`、`{ message }`、`{ success: false, message }`、
可选 code、rate-limit 字段、success flag 及分页信息。领域模块组合可观测的 endpoint error，不把 Wiki、
Backoffice 和 middleware 错误压成一个宽泛 union。

每个新增或调整的 contracts 模块同步以下表面：

- `package.json` exports subpath。
- `src/index.ts` camelCase namespace。
- `packages/contracts/README.md`。
- 新增的 entrypoint/runtime-classification 清单。

## Request 未知字段策略

现有行为按盘点结果显式编码：

- `reject`：严格对象，未知 key 返回当前约定的 `400`。
- `project`：显式 strip，只输出声明字段。
- `pass-through`：显式 passthrough，保留原对象。
- 新端点默认 strict；使用 strip/passthrough 必须带 legacy 意图和测试。

迁移基线为 41 个 reject、161 个 project、17 个 pass-through、64 个非对象边界。不能把默认
`z.object(...)` 的 strip 行为当作未声明的偶然结果。

必须保留：

- `producername`、`expected_revision`、multipart `cover_url`。
- Fudaba 重复 `series`，以及 `open`、`office` query。
- Wiki query/body 混合输入及 body 优先级。
- 媒体和 site-content 的可选 `v` cache-buster。
- OAuth callback 对第三方追加 query 的兼容。
- Editorial 顶层 passthrough，以及 Tiptap `bodyJson` 的递归开放结构。

Raw params schema 使用实际 Hono 名称，例如 `submissionId`、`agencyId`、`assetId`；归一化为内部 `id`
发生在 API adapter，不能把归一化名称写入 wire schema。

## API validation adapter

扩展 `apps/api/src/middleware/request-validation.ts`，在现有 `requestValidator` 之上新增接收 contracts
schema 的 JSON/query/param 包装器。包装器必须：

- 使用 `safeParse` 并返回解析后的 output。
- 保留 malformed JSON、`acceptMislabeledJson`、route-specific invalid message 和 error shape。
- 将 Zod issue 映射到当前首选错误文案，不泄漏内部 schema 结构。
- 允许 schema parse 后运行 API-local normalization 或 semantic validator。
- 不改变现有 Hono validated-data 类型推导。

multipart 与 URL-encoded carrier 保持本地解析。carrier 中嵌入的 JSON，如 Wiki `sources_json`，在提取后
使用 shared schema 验证。

## Response 精确性

所有 response schema 必须描述实际发出的 JSON：

- 对象层级默认 strict。
- 不使用 coercion、default、strip 或 transform。
- 实际可能缺失的字段用 optional，实际返回 `null` 的字段用 nullable。
- 数组成员对象和嵌套对象同样 exact。
- API conformance 测试比较原始 JSON 与 schema parse 结果的深度相等。

这会阻止非 strict schema 静默丢弃 Backoffice `token` 或 Wiki mutation 的完整实体字段。

## Web success 与 error 解析

扩展现有 `parsed(...)`，不另建客户端：

- `schema` 验证成功 JSON。
- `errorSchema` 验证非 2xx JSON，可接收领域导出的 union。
- `businessErrorSchema` 验证保留的 2xx failure payload，例如 Wiki
  `{ status: "error", msg }`。
- parse 后对 raw JSON 与 parsed output 做 JSON 结构深比较，再执行 `select`。
- object、array、scalar 和 `null` JSON 都需要 schema；只有 `204`/`205` 无 body。
- contract failure 统一抛出 `ApiError`，保留 status、payload 和 cause。

`handleApiResponse` 在提取 HTTP error message/code 前执行 `errorSchema`。生产 endpoint 禁止
`skipContractCheck`；blob/text/raw 等 success 例外仍需校验其 JSON error。

## Backoffice 兼容与授权

Canonical `/api/admin/auth/login` 接受合法 `op` 和 `editor`，包括 `editor/null`。Canonical 与兼容
响应都保留 `token`、nullable `producername`、后端当前 `dept` 范围和 nullable `adminRole`。

`/api/admin/login` 保留当前 operator gate。旧路径、deprecation/Link headers、warning log、cookie 名、
realm bridge、refresh/logout cookie cleanup 和 30 天兼容窗口均不改变。

Web 校验完整 login response，但仍使用 Cookie session，不持久化 token。`AdminLayout` 按能力显示：

- editor 可进入 Wiki 管理路由，只看到 Wiki 导航。
- editor 访问其他 admin 页面时得到 access-denied 状态。
- op/super_admin 专属控制保持原限制。

## Wiki 兼容

- Shared mutation response 扩展到 handler 当前完整 payload，不缩减 API 输出。
- 保留兼容路径、CSRF、editor 权限、legacy identity fallback、Bilibili mislabeled JSON、multipart 和
  URL-encoded 输入。
- story-link delete 分别定义 body/query schema，本地 adapter 保留 body-over-query。
- `parseWikiUpload`、文件 carrier 和 operation-specific text-field 提取继续在 API。
- `sources_json` 解码后的数组使用 shared schema。
- 共享错误 schema 保留既有 status code、`msg`、revision conflict metadata 和 business-error 形态。

## 非 JSON 例外

建立 symbol-level 例外表，只允许以下 success kind：`text`、`blob`、`arrayBuffer`、`raw`、`redirect`、
`stream`、`html`、`static`、`no-content`。每条记录包含稳定 ID、文件、symbol、kind、理由、JSON error
schema 和聚焦测试。

JSON success 永不豁免。静态/媒体 handler 即使 success 非 JSON，其 4xx/5xx JSON body 仍由 contracts
拥有。

## 静态门禁

新增独立 wire-contract 检查脚本，使用 TypeScript AST/type information，而不是在现有字符串扫描器上
堆叠正则。检查内容：

1. API request schema runtime import 只出现在 route validation 边界。
2. API JSON body 最终解析类型来自 `@imsweb/contracts`。
3. API `c.json(...)` success/error body 终止于 contracts 类型。
4. Web JSON endpoint 使用 contracts schema 的 `parsed(...)`，且声明 error schema。
5. 生产代码没有 `skipContractCheck`。
6. 非 JSON success 均有存活且受测的例外记录。
7. Contracts exports、namespace、README、entrypoint classification 和 build output 一致。
8. Zod-free entrypoint 的 source graph 与 fresh-process loader 均不加载 Zod。

检查先以 report-only 生成基线；所有业务域迁移完成后才切换为 fail-closed。动态注册必须可由 AST 展开，
否则只允许紧邻注册点的可检查 metadata，不允许目录级豁免。

## 测试策略

每个迁移域至少覆盖：

- valid request 的 HTTP success。
- invalid request、malformed JSON 和 unknown-key 既有策略。
- 每个可观测 status/error 分支。
- raw response 与 shared schema parse 深度相等。
- Web request 构造、success/error/business-error 解析。
- 非 JSON success 与 JSON error 的组合边界。

全局测试覆盖 package exports、root namespace、README、Zod-free loader、AST 反例 fixture、
Backoffice editor 权限、Wiki 完整 mutation payload 和兼容路由。

## 回滚策略

每个业务域以 schema、API aliases/adapters、Web endpoint 和聚焦测试为一个可回滚单元。回滚不删除兼容
route/cookie。静态检查在覆盖完整前保持 report-only；若最终门禁误判合法边界，只回退 fail-closed
开关，保留已迁移 contracts 和生成的审计报告。

## 明确延期

- 将 161 个 project 和 17 个 Editorial passthrough 边界统一改成 strict。
- 收紧通用 multipart/Wiki field bag。
- 移除 Backoffice 兼容路由或 Cookie。
- 删除仍调用 `410` Information 路由的 Web 功能。
- 对历史 API 做响应版本重设计。
