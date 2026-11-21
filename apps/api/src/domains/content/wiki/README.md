# Wiki Domain

## 范围

Wiki 负责企划目录、栏目与内容页、剧情卡片和来源、来源目录、企划/实体媒体及共享
剧情封面素材。它不负责前端页面路由、数据库连接池或对象存储 provider。

## Capability 结构

```text
wiki/
  routes.ts             # 只注册 /api/admin/wiki/* 鉴权中间件并组合四个 capability
  request.ts            # 跨能力共享的请求校验器（validateWiki*）
  response.ts           # 跨能力共享的响应投影
  models.ts             # Wiki 领域模型类型
  service.ts            # 共享数据访问聚合点（高扇入，禁止继续扩张）
  handler-support.ts    # 鉴权与 services resolver（高扇入，禁止继续扩张）
  image-transform.ts    # 图片转换策略
  catalog/
    routes.ts           # 企划/栏目/内容页/分类 CRUD、布局、公开与后台目录、随机读取
    handlers/           # 9 个 action（含 manage-catalog 的 8 个实体 CRUD handler）
  stories/
    routes.ts           # 剧情读写、卡片、来源、内容类型与来源平台目录、B 站解析与批量解析
    handlers/           # 11 个 action
  media/
    routes.ts           # 实体图标/偶像图片/封面素材的上传、删除、服务与退役静态资源拒绝
    handlers/           # 11 个 action
  documents/
    routes.ts           # 增强 Markdown 文档的读取、保存、预览与图片上传
    enhanced-markdown-compiler.ts  # 纯函数：Markdown -> 版本化 AST + plainText + 行号告警
    document-assets.ts             # `cover:<id>`/`doc:<id>` 引用解析、封面引用集合、公开读 URL 口径
    document-request.ts            # 该 capability 的请求模型
    handlers/           # 4 个 action：读取、保存、预览、上传文档图片
```

文档图片没有独立的公开读取路由：上传与共享封面都通过
`ObjectStorage.createPublicReadUrl` 得到公开读 URL，AST 里只出现该 URL（或 `null`），
从不出现对象键。

按实际承载内容归并：剧情目录选项（content-types/source-platforms）与 B 站来源解析
（单条与文档工具栏使用的批量解析）都复用同一个解析服务，归入 `stories`；实体图标、偶像媒体、封面素材与 `/icon/*`、`/css/*`
退役资源拒绝同属媒体服务面，归入 `media`；随机背景/偶像读取目录数据，归入 `catalog`；
增强 Markdown 文档是独立的编辑与编译生命周期，归入 `documents`。

根 `routes.ts` 是泛型 registrar 组合：每个 capability 导出
`registerWiki<Capability>Routes<E extends Env>(app, resolveServices)`，根只注册共享的
后台鉴权中间件再依次组合，不直接绑定任何 handler。

## 边界

- `service.ts` 与 `handler-support.ts` 是遗留共享聚合点：新增能力内职责时优先落在
  capability 目录内的命名模块，不要向这两个文件添加跨能力函数。
- 所有 `/api/wiki/*`、`/api/admin/wiki/*`、`/icon/*`、`/image/*`、`/css/*` 路径、认证
  策略及故事响应结构保持不变；capability 之间不得直接导入对方 handler。
