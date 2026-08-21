# API Domain Index

这里按“产品板块 -> domain -> capability -> action”组织代码：物理目录第一层是五个
产品板块（`identity/`、`admin/`、`content/`、`community/`、`delivery/`），第二层是
business domain，第三层是 capability。`admin/` 承载管理后台专属能力，后续可独立维护。`handlers/`、`request.ts` 和 `response.ts` 是
capability 内的技术角色。

当前快照：5 个板块、20 个 domain、279 个 TypeScript 模块、144 个 handler。数量只用于
发现规模，能力边界以本索引和各 domain 的 `README.md` 为准。

结构原则是“整体偏扁平”：domain 默认扁平（`routes.ts` + `handlers/` + 命名模型文件）；
只有较大的复杂业务模块（约 20+ 模块或多个独立参与者/生命周期）才建 capability
目录。当前仅四个：`fudaba`(56)、`wiki`(38)、`namecards`(25)、`platform-auth`(24)。

## 产品领域导航

| 产品领域 | Domain | 用途 | 目标 capability |
| --- | --- | --- | --- |
| Identity | `platform-auth` | 平台登录、注册、OAuth、密码找回 | `sessions` `registration` `password-reset` `oauth` |
| Identity | `platform-profile` | 个人资料和头像 | `profile` `avatar` |
| Admin | `backoffice-auth` | 后台操作员会话 | `sessions` |
| Admin | `admin-accounts` | 后台账号管理 | `accounts` |
| Admin | `audit` | 后台审计写入和查询 | `write` `read` |
| Content | `wiki` | 企划、内容页、剧情、来源目录和素材 | `catalog` `stories` `media` |
| Content | `information` | 资讯公开阅读、后台编排与素材 | 扁平（10 个 handler） |
| Content | `news` | 新闻发布和公开列表 | `news` |
| Content | `events` | 活动生命周期和媒体 | `events` |
| Content | `chronicle` | 编年史活动、媒体审核与服务 | 扁平（11 个 handler） |
| Content | `about` | 关于页和图片 | `page` `media` |
| Content | `producer-map` | 制作人地图和图片 | `map` `media` |
| Content | `live-schedule` | 直播日程读取 | `schedule` |
| Content | `homepage-links` | 首页链接编排 | `links` |
| Content | `brand-assets` | 品牌静态资源 | `assets` |
| Community | `fudaba` | 社区交换站目录、卡片、办公室、位置和审核 | `directory` `cards` `offices` `locations` `claims` `moderation` |
| Community | `namecards` | 名片投稿、公开名片、表情反应和审核 | `public-cards` `submissions` `moderation` `reactions` |
| Delivery | `media` | 跨域媒体读取与授权 | `public-objects` |
| Delivery | `site` | 站点入口与静态资源渲染 | `rendering` |
| Delivery | `site-packages` | 站点包发布、归档和读取 | 扁平（S，2 个 handler） |

产品板块已是物理目录：import 路径统一为 `@/domains/<板块>/<domain>/...`，`app.ts` 只
挂载各 domain 根 `routes.ts(x)`。`reactions` 已并入 `namecards` 成为其 capability，因为
表情反应始终作用于名片。

## 局部入口

- `community/fudaba/README.md`：社区交换能力拆分。
- `identity/platform-auth/README.md`：平台认证能力拆分。
- `content/wiki/README.md`：Wiki 目录、剧情、媒体和素材能力。
- 完整原则、目录模板、迁移顺序和验证门槛：`docs/architecture/domain-capabilities.md`。

## 编写规则

- Domain 根 `routes.ts(x)` 是稳定组合入口，只注册路由，不写 inline handler。
- 一个 action 一个 `handlers/<action>.ts`，文件名使用 kebab-case。
- 请求解析、响应序列化、领域策略分别放在命名明确的文件中。
- L/M domain 按独立参与者、权限、生命周期或路由前缀建立 capability 目录；S domain
  保持扁平，不为技术角色制造空目录。
- capability 之间不能直接导入对方的 handler 或 route；共享内容必须是有限且有名字的
  `contracts/`。
- 新代码不新增 `handler-support.ts`、`helpers.ts`、`utils.ts`、万能 `service.ts` 或
  业务 barrel `index.ts`。现存的 `wiki/service.ts` 与 `wiki/handler-support.ts` 是冻结的
  遗留聚合点，只减不增。
- handler 依赖的能力封装按四层归位，不建泛化桶：
  1. 领域无关的纯函数 → `src/utils/<主题>/<名称>.ts`（如 `utils/crypto/sha256.ts`、
     `utils/storage/business-object-keys.ts`），无副作用、不读 runtime。
  2. 跨进程/运行时能力 → `src/ports/` 契约 + runtime 注入（如 CacheStore、
     ObjectStorage、repositories），业务代码只依赖 port；port 有行为、有多实现，
     其参数/返回的 Record 类型随 port 留在 `ports/` 内。
  3. 跨端线格式契约 → workspace 包 `@imsweb/contracts`（`packages/contracts/`）：
     zod schema 是唯一事实源，静态类型由 `z.infer` 派生；Web 用同一 schema
     解析响应，API 用它们做响应类型与运行时符合性测试
     （tests/wiki/wire-contract-conformance.test.ts）。`src/contracts/` 已废弃，
     架构检查禁止回潮。
  4. 领域内业务封装 → domain 根或所属 capability 内的“用途命名”模块：动作名
     （`write-audit.ts`）、名词角色（`link-payload.ts`、`media-assets.ts`、
     `chronicle-records.ts`、`submission-guards.ts`）或带主语的 service
     （`live-schedule-service.ts`）；名字必须能回答“它封装什么”。
- 业务代码只依赖 `@/ports/*` 和注入的运行时能力，不依赖 `infra`、`runtime` 或具体
  provider。

capability 组合有两种形式，根 route 都只组合、不直接绑定 handler：

- **挂载式子路由**（URL 前缀统一）：`platform-auth`、`fudaba`、`namecards`。capability
  `routes.ts` 用 `createCapabilityRouter()` 声明相对路径，根用
  `app.route(prefix, factory())` 挂到稳定前缀，前缀只声明一次。
- **registrar 组合**（历史 URL 异构，如 `/icon/*`、`/image/*`）：`wiki`。capability
  `routes.ts` 导出 `registerXxxRoutes(app, resolveServices)` 注册绝对路径，根先注册
  共享鉴权中间件再依次组合。

跨 capability 共享的解析器与视图住在 domain `contracts/` 或域根共享模型文件。架构
检查器同时校验板块分类、根 route 与 capability route 的 handler 边界；结构契约测试
锁定四个 capability domain 的组合关系。
