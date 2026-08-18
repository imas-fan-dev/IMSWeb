# Domain 能力分层与编写结构

## 目标与范围

当前 API 的 `src/domains/` 已经形成了稳定的业务边界，但部分 domain 继续承载新的
用例后，目录只按 `handlers/`、`request.ts`、`response.ts` 等技术角色展开，读者很难
从目录判断一个能力的范围、参与者和生命周期。本设计采用“产品领域 -> domain ->
业务能力 -> action”的四层视图，解决导航和边界可见性问题。

本设计先约束结构和迁移顺序，不在本阶段改变公开 URL、HTTP method、认证策略、响应
字段、数据库 schema 或对象键。目录迁移必须按能力逐步完成，并以现有契约测试作为回归
依据。

术语约定：

- **产品领域**：用于导航和归类的标签，例如 `identity`、`content`、`community`，不
  要求立即成为物理目录。
- **Domain**：拥有相对稳定业务不变量、生命周期和端口边界的业务单元，例如 `wiki`、
  `fudaba`、`namecards`。
- **业务能力（capability）**：domain 内可独立说明参与者、权限、状态或路由前缀的一组
  用例，例如 Fudaba 的 `offices`、`claims`。
- **Action**：一个明确的 HTTP 用例；一个 action 对应一个 handler 文件。

## 当前盘点

当前快照包含 5 个产品板块、20 个 API domain、277 个 TypeScript 模块和 144 个 handler。
`reactions` 已并入 `namecards` 成为其 capability。

产品板块已是物理目录：`src/domains/<板块>/<domain>/`，板块取值固定为
`identity`、`admin`、`content`、`community`、`delivery`，由架构检查器校验注册表；
`admin/` 承载管理后台专属 domain，便于后续独立维护：

| 产品领域 | Domain | 一眼可见的业务范围 | 目标能力组 | 级别 |
| --- | --- | --- | --- | --- |
| identity | `platform-auth` | 平台账号访问 | sessions、registration、password-reset、oauth | M |
| identity | `platform-profile` | 平台个人资料与头像 | profile、avatar | S |
| admin | `backoffice-auth` | 后台操作员会话 | sessions | M |
| admin | `admin-accounts` | 后台账号生命周期 | accounts | S |
| admin | `audit` | 后台审计记录写入与查询 | write、read | 横切 |
| content | `wiki` | 企划、内容页、剧情与素材 | catalog、story-content、story-catalog、entity-media、story-assets、tools | L |
| content | `information` | 资讯公开阅读与后台编排 | public-content、admin-content、assets | M |
| content | `news` | 新闻发布与公开列表 | news | S |
| content | `events` | 活动生命周期与媒体 | events、media（增长后再拆） | S |
| content | `chronicle` | 编年史活动与媒体审核 | activities、moderation、media | M |
| content | `about` | 关于页内容与图片 | page、media（增长后再拆） | S |
| content | `producer-map` | 制作人地图内容与图片 | map、media（增长后再拆） | S |
| content | `live-schedule` | 直播日程读取 | schedule | S |
| content | `homepage-links` | 首页链接编排 | links | S |
| content | `brand-assets` | 品牌静态资源 | assets | S |
| community | `fudaba` | 社区交换站目录、卡片、办公室与审核 | directory、cards、offices、locations、claims、moderation | L |
| community | `namecards` | 名片投稿、公开名片、表情反应与审核 | public-cards、submissions、moderation、reactions | M |
| delivery | `media` | 跨域媒体读取与授权 | public-objects | 横切 |
| delivery | `site` | 站点入口与静态资源渲染 | rendering | S |
| delivery | `site-packages` | 站点包发布、归档与读取 | publishing、delivery、archive | M |

`S/M/L` 是拆分决策提示，不是按文件数机械切割：只有当参与者、权限、状态机或路由
前缀也能说清楚时，才建立 capability 目录。

## 结构原则

### 1. 业务能力优先，技术角色居内

目录第一层回答“这组代码服务什么业务”，第二层才回答“它是请求解析、响应序列化还是
处理器”。不要把所有领域的 `models/` 或 `services/` 汇总到全局目录，也不要按数据库
表名拆目录。

### 2. Domain 入口保持稳定

`app.ts` 只认识 `domains/<domain>/routes.ts(x)`。根 `routes.ts(x)` 是组合器，只负责：

- 挂载 capability route 注册函数；
- 声明 URL、middleware 顺序和权限边界；
- 不包含 inline handler 或跨能力业务判断。

迁移后推荐的调用关系：

```text
app.ts
  -> domains/fudaba/routes.ts
       -> directory/routes.ts
       -> cards/routes.ts
       -> offices/routes.ts
       -> locations/routes.ts
       -> claims/routes.ts
       -> moderation/routes.ts
```

外部路径仍由根入口统一注册，调用方不需要知道内部目录变化。

### 3. Capability 是垂直切片

一个 capability 应能独立回答以下问题：

- 谁可以调用它（公开用户、平台用户、后台操作员或系统任务）？
- 它维护哪些状态和不变量？
- 它有哪些读写 action 和冲突策略？
- 它依赖哪些 port，以及哪些测试负责它？

只有共享的稳定业务契约才进入 domain 内的 `contracts/`；单个 capability 专用的类型和
规则留在 capability 内，不因为被两个文件使用就提升为“共享工具”。

### 4. 小域不为整洁而过度拆分

S 级 domain 保持当前扁平结构即可：

```text
<domain>/
  routes.ts
  handlers/
    create-<resource>.ts
    list-<resource>.ts
  request.ts
  response.ts
  <named-policy>.ts       # 只有确有领域规则时才存在
```

M/L 级 domain 使用直接可读的能力目录，不额外增加无语义的 `capabilities/` 层：

```text
<domain>/
  routes.ts
  contracts/               # 可选，只放跨 capability 的稳定契约
  <capability>/
    routes.ts              # 有独立路由/权限面时保留
    handlers/
      <action>.ts
    request.ts              # 该能力有多个请求模型时拆成命名文件
    response.ts             # 该能力有多个响应模型时拆成命名文件
    <named-policy>.ts
    <named-service>.ts
```

### 5. 文件职责和命名

| 文件 | 只负责 | 不负责 |
| --- | --- | --- |
| `routes.ts` | URL、middleware、handler 绑定 | 业务流程、匿名回调处理器 |
| `handlers/<action>.ts` | 一个 HTTP action 的编排 | 另一个 action 的隐式分支 |
| `request.ts` / `*-request.ts` | 解析和校验请求模型 | 数据库读取、响应拼装 |
| `response.ts` / `*-response.ts` | 领域结果到 HTTP DTO | 权限判断、写入副作用 |
| `<named-policy>.ts` | 状态转换、权限规则、值对象 | Hono context 或具体 adapter |
| `<named-service>.ts` | 跨多个 action 的完整业务流程 | 无语义的万能 service |
| `contracts/<name>.ts` | 跨 capability 的稳定类型/错误/命令 | 所有工具函数和临时 DTO |

新代码不使用 `handler-support.ts`、`helpers.ts`、`utils.ts`、`models.ts` 或无法说明
职责的 `<domain>-service.ts`。现有文件在被修改或迁移时按实际不变量拆成有名字的模块；
不要求为了命名整洁进行一次性重写。

handler 依赖的能力封装按四层归位，不建泛化桶：

1. **领域无关纯函数** → `src/utils/<主题>/<名称>.ts`（如 `utils/crypto/sha256.ts`、
   `utils/storage/business-object-keys.ts`）；无副作用、不依赖 Hono context 或 runtime。
2. **跨进程/运行时能力** → `src/ports/` 契约 + runtime 注入；业务代码只依赖 port，
   判别法：port 接口**有行为（方法）**、存在多实现（PostgreSQL/Memory、
   Valkey/Memory、S3/文件系统），由 `src/infra/` 实现。port 参数/返回里的
   Record 类型属于能力契约本身，随 port 放在 `ports/` 内，不是线格式契约。
2.5 **跨端线格式契约** → workspace 包 `@imsweb/contracts`（`packages/contracts/`）：
   zod schema 是 API↔Web 传输面的唯一事实源，静态类型由 `z.infer` 派生，
   两端通过 `workspace:*` 消费同一个运行时对象：Web 用 schema 解析响应，
   API 用派生类型标注 response 序列化并在
   `tests/wiki/wire-contract-conformance.test.ts` 里用同一 schema `parse` 真实路由
   输出；fudaba、platform、namecards 的线契约（包内 `fudaba`、
   `fudaba/card-claims`、`fudaba/location-review`、`platform`、`namecards` 子路径）
   则在既有 HTTP 路由测试的响应读取点内联 `parse` 执法。包内采用 flat-first
   分级：单文件域平铺，多文件大业务用文件夹（见
   `packages/contracts/README.md`）。漂移在结构上不可能，而非靠复制检查拦截；旧的生成管线与
   `src/contracts/` 已移除，架构检查禁止回潮。handler 的 response 序列化仍
   负责把 ports 的 Record 映射为契约形状，持久层与线契约互不 import。
   不直接导入 `infra`/`runtime`。
3. **领域内业务封装** → domain 根或所属 capability 内的用途命名模块：动作名
   （`audit/write-audit.ts`）、名词角色（`homepage-links/link-payload.ts`、
   `namecards/media-assets.ts`、`chronicle-records.ts`、
   `submissions/submission-guards.ts`）或带主语的 service（`live-schedule-service.ts`）。
   名字必须能回答“它封装什么”；被两处使用不是提升为泛化工具的理由。

### 6. 依赖方向

```text
capability/routes
  -> capability/handlers
  -> capability/request | response | policy | service
  -> domain/contracts
  -> ports
```

允许：

- 同一 capability 内的显式依赖；
- capability 之间依赖 `contracts/` 中的稳定契约；
- domain 依赖 `@/ports/*`、middleware 和纯 `utils`。

禁止：

- capability A 直接导入 capability B 的 handler 或 route；
- domain 或 capability 导入 `infra`、`runtime`、具体数据库/对象存储/图片库；
- 用跨域直接 import 代替端口或明确的应用命令；
- 通过一个“共享”文件绕过边界。

`audit` 当前被多个写域调用，是已知的横切例外。短期保留兼容路径；后续应先定义
`AuditWriter` port，再由 runtime 注入，最后把写入实现从业务 domain 中移出。该迁移不能
与 capability 搬迁同时进行。

## 重点 Domain 的目标归类

### Fudaba

Fudaba 已按能力目录分组，根 route 只负责组合 capability route。结构如下：

```text
fudaba/
  README.md
  routes.ts
  contracts/
    card.ts
    office.ts
    location.ts
    claim.ts
  directory/
    routes.ts
    handlers/
      list-public-series.ts
      list-public-offices.ts
      get-public-office.ts
      list-public-cards.ts
      get-map-config.ts
      list-map-offices.ts
  cards/
    routes.ts
    handlers/
      list-owner-cards.ts
      get-owner-card.ts
      create-card.ts
      update-card.ts
      delete-card.ts
      save-card-placement.ts
      remove-card-placement.ts
      upload-owned-media.ts
      serve-owner-card-media.ts
  offices/
    routes.ts
    handlers/
      list-owner-offices.ts
      get-owner-office.ts
      create-office.ts
      update-owner-office.ts
      archive-owner-office.ts
      restore-owner-office.ts
      upload-office-cover.ts
      withdraw-office-cover.ts
      serve-owner-office-media.ts
  locations/
    routes.ts
    handlers/
      get-owner-location.ts
      save-owner-location.ts
      withdraw-owner-location.ts
  claims/
    routes.ts
    handlers/
      platform-card-claims.ts
      <future-claim-action>.ts
  moderation/
    routes.ts
    handlers/
      admin-card-reviews.ts
      list-location-reviews.ts
      review-location.ts
```

`get-map-config` 和 `list-map-offices` 是公开目录投影，放在 `directory`；位置审核放在
`moderation`；卡片/办公室媒体跟随其拥有的业务能力，不建立万能 `fudaba/media`。
当前的 `card-placement.ts`、`card-claims.ts`、`office-location.ts`、
`office-management.ts`、`owner-card.ts`、`public-read.ts` 应按实际导出逐步归入上述
capability 或 `contracts/`，不能整体搬进一个新的 `support.ts`。

### Wiki

Wiki 的路由和支持代码至少按以下能力分组：

```text
wiki/
  README.md
  routes.tsx
  contracts/
    catalog.ts
    story.ts
  catalog/
    routes.ts
    handlers/
      list-public-catalog.ts
      list-admin-catalog.ts
      manage-catalog.ts
      save-wiki-layout.ts
  story-content/
    routes.ts
    handlers/
      list-public-stories.ts
      list-admin-stories.ts
      add-story.ts
      edit-story.ts
      delete-story.ts
      delete-story-link.ts
      update-story-card.ts
      add-story-sources.ts
      category-actions.ts
  story-catalog/
    routes.ts
    handlers/
      manage-story-source-catalog.ts
  entity-media/
    routes.ts
    handlers/
      upload-idol-media.ts
      delete-idol-media.ts
      list-idol-media.ts
      upload-agency-icon.ts
      delete-agency-icon.ts
      save-entity-image.ts
      serve-wiki-entity-icon.ts
      serve-wiki-idol-image.ts
  story-assets/
    routes.ts
    handlers/
      manage-story-cover-assets.ts
      serve-story-cover-asset.ts
  tools/
    handlers/
      parse-bilibili.ts
      random-idol.ts
      random-background.ts
      reject-retired-wiki-static-asset.ts
```

`handler-support.ts` 和 `service.ts` 不再继续扩张。迁移时按调用者拆成目录策略、故事
策略、媒体授权和对象键等有名模块；不要以“被多个 handler 使用”为唯一理由放回一个总
支持文件。

### 其他需要预先留出边界的 M 级 Domain

```text
platform-auth/   sessions / registration / password-reset / oauth（挂载式）
fudaba/          directory / cards / offices / locations / claims / moderation（挂载式）
namecards/       public-cards / submissions / moderation / reactions（挂载式）
wiki/            catalog / stories / media（registrar）
```

结构基线是“整体偏扁平”：domain 默认扁平，只有较大的复杂业务模块（约 20+ 模块
或多个独立参与者/生命周期）才建 capability 目录，当前仅上述四个。中等规模的
domain（如 `chronicle` 11 个 handler、`information` 10 个 handler）保持扁平，不建能力
目录；S 级 domain（如 `site-packages`，仅 2 个 handler）同样不应因为拥有
`request.ts` 和 `response.ts` 就强行创建子目录。

capability 组合有两种已落地形式，根 route 都只组合、不直接绑定 handler：

- **挂载式子路由**（URL 前缀统一）：capability `routes.ts` 用
  `createCapabilityRouter()`（`src/routing/capability-router.ts`）声明相对路径 action，
  domain 根用 `app.route(prefix, factory())` 挂到稳定 URL 前缀，前缀只声明一次。
- **registrar 组合**（历史 URL 异构，如 `/icon/*`、`/image/*`、`/css/*`）：capability
  `routes.ts` 导出 `registerXxxRoutes(app, ...)` 注册绝对路径，根依次调用组合；跨能力
  共享的鉴权中间件（如 wiki 的 `/api/admin/wiki/*`）由根在组合前注册。

## Web 端对齐

后端 URL 稳定后，Web API endpoint 以相同 capability 命名，避免一个文件重新聚合整个
业务域。现有 `fudaba-card-claims.ts`、`fudaba-location-review.ts` 已经是可复用的拆分
方向；下一步可将大文件逐步调整为：

```text
apps/web/app/lib/api/endpoints/
  fudaba/
    directory.ts
    cards.ts
    offices.ts
    locations.ts
    claims.ts
    moderation.ts
  wiki/
    catalog.ts
    story-content.ts
    story-catalog.ts
    entity-media.ts
    story-assets.ts
```

旧的 `fudaba.ts`、`wiki.ts` 和 `wiki-schemas.ts` 在所有调用方迁移完成前保留为兼容出口，
但新页面不得继续向兼容文件添加业务实现。页面按用户流程分组，根页面只做编排；例如
`community/exchange` 可将公开目录、办公室、卡片和地图分别放入子目录。

## 迁移顺序

### 阶段 0：建立索引与检查器（已完成）

- 在 `src/domains/README.md` 维护 domain -> capability 导航表；
- 为 L 级 domain 提供就近的 `README.md`；
- 记录每个 action 的 URL、权限、request parser、response、port 和测试；
- 不移动代码，不改变契约。

### 阶段 1：先改组合边界

- 保持现有 handler 路径，提取根 `routes.ts` 中的 capability 注册函数；
- 把跨能力纯规则从 `data.ts`、`service.ts`、`handler-support.ts` 拆成命名模块；
- 每一步保持路由方法、middleware 顺序和响应字段不变。

### 阶段 2：扩展架构检查器

在移动任何嵌套 handler 前，更新 `apps/api/scripts/checks/hono-architecture.js`，使其支持：

- `domains/<domain>/<capability>/routes.ts`；
- `domains/<domain>/<capability>/handlers/*.ts`；
- 递归检查 request parser 和 domain 禁止依赖；
- 只允许 domain 根入口挂载 capability routes；
- 禁止 capability 之间导入 handler/route；
- 错误信息显示完整的 `<domain>/<capability>` 路径。

### 阶段 3：按风险迁移

推荐顺序：

1. Fudaba `locations` 或 `claims`（边界最清晰）；
2. Fudaba `cards`、`offices`、`directory`、`moderation`；
3. Wiki `story-catalog`、`story-assets`、`catalog`、`story-content`、`entity-media`；
4. `namecards`、`chronicle`、`platform-auth`、`information`；
5. Web endpoint 与页面镜像拆分；
6. 清理旧兼容出口和已无调用者的总支持文件。

不要在同一个变更中同时重命名路由、改变数据库 port 和搬迁目录。Repository port 的
进一步拆分（例如 Fudaba card/office/location/claim repository）应在 capability 入口稳定
后单独进行。

## 验收门槛

每次能力迁移都必须证明：

1. 迁移前后 URL + method 集合一致；
2. 公开、平台用户、后台和 CSRF middleware 顺序一致；
3. request parser、响应字段、错误状态码和对象 URL 行为一致；
4. 旧文件 importer 降为零后才删除兼容文件；
5. 领域测试和真实 PostgreSQL persistence contract 继续通过。

建议验证命令：

```sh
pnpm run check:root
pnpm run check:boundaries
pnpm --filter @imsweb/api run syntax
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
```

完成标准不是目录数量增加，而是开发者打开任意 domain 时，可以在根入口和 capability
目录中快速回答“它服务谁、包含哪些 action、依赖什么、测试在哪里”，并且不需要阅读
一个跨能力的万能支持文件才能理解边界。
