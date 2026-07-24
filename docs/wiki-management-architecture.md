# Wiki 动态数据与管理架构

## 目标与当前阶段

Wiki 管理端不再内置企划、偶像或剧情样本。React 管理页只负责交互，通过同源 API 读取和
修改 Hono 持有的数据；Hono 通过 `StoryRepository` 访问 SQLite 或 PostgreSQL，并通过
`ObjectStorage` 管理剧情图片。

公开 `/wiki` 与 `/story` 已迁移到 React Router。公开页面只读取匿名 JSON API，管理页使用
受保护的行级读模型，并复用已经过补偿测试的 Wiki 写接口。两类前端都不读取数据库结构或
拼接对象存储键。

Web 同时提供 `/wiki/classic` 与 `/story/classic` 作为旧模板交互兼容视图。两套公开视图
读取相同的匿名 API；企划组合、属性与角色编排由 Web 展示配置维护，API 不返回重复的界面
结构数据。无法匹配现有组合的动态角色会进入“事务所人员与其他”，避免新数据被隐藏。

```text
React public /wiki, /story and classic variants
  -> same-origin /api/wiki/catalog and /api/wiki/stories
  -> Hono Wiki read handlers

React admin
  -> same-origin /api/admin/wiki/*
  -> Hono Wiki handlers
  -> StoryRepository -> SQLite or PostgreSQL
  -> ObjectStorage   -> filesystem or S3-compatible storage

Hono media /image, /icon and /css
  -> ObjectStorage with legacy asset fallback
```

## 数据所有权

| 数据 | 唯一写源 | 对外形态 |
| --- | --- | --- |
| 企划 | `agencies` | 公开与管理目录 API |
| 偶像 | `idols` | 公开与管理目录 API |
| 剧情链接与卡片字段 | 七张 `*_stories` | 公开聚合视图与管理行级视图 |
| 剧情与头像图片 | `ObjectStorage` | `/image/...` 稳定 URL |
| 系列图标 | `ObjectStorage` | `/icon/agencies/...` 版本化 URL |
| 默认空分类 | Hono Wiki 企划规则 | 剧情 API 的 `categories` |

前端不得复制这些记录为静态常量。默认空分类目前仍是后端兼容策略；已有剧情中的自定义分类会
从数据库自动合并进响应。若后续要求空分类本身可新增、排序和持久删除，应新增归一化分类表和
版本化 PostgreSQL migration，不能继续扩展前端状态或让 `save_story_layout` 保持空实现。

## 公开读取 API

公开接口无需登录，只返回浏览页面需要的数据，不包含数据库表名、对象存储 key 或管理字段。

### `GET /api/wiki/catalog?agency=...`

返回七个受支持企划的摘要、可选系列图标，以及当前企划的角色和已解析头像。系列图标从固定
对象存储前缀一次列出，并用对象 ETag 生成版本参数；省略 `agency` 时返回第一个企划。切换企划
只解析该企划的角色头像，避免首页请求整个 Wiki 的角色素材状态。未上传管理版本时，Web 使用
既有 Wiki 系列静态图标；删除管理版本后也会回到该默认图标。

### `GET /api/wiki/stories?agency=...&idol=...`

返回当前角色、头像和按分类、卡片聚合的剧情来源。同一卡片的多个数据库行会保留为多个
`links`；卡片图片和头像均使用稳定的 `/image/...` 或兼容资产 URL。前端只允许打开
`http`/`https` 来源链接。

## 管理读取 API

两个接口都要求 Cookie JWT，角色必须为 `editor` 或 `op`。GET 不要求 CSRF；所有写请求仍
要求 JWT claim 对应的 `X-CSRFToken`。

### `GET /api/admin/wiki/catalog`

返回数据库中的受支持企划与偶像，并一次列出系列图标对象。该接口不逐个探测角色素材，适合
页面首次加载。

```json
{
  "status": "success",
  "agencies": [
    {
      "id": 6,
      "code": "sc",
      "name": "闪耀色彩",
      "color": "#8dbbff",
      "iconUrl": "/icon/agencies/sc.webp?v=etag",
      "idols": [
        {
          "id": 6,
          "name": "樱木真乃",
          "folderName": "sakuragi_mano",
          "color": "#ffbad6"
        }
      ]
    }
  ]
}
```

### `GET /api/admin/wiki/stories?agency=...&idol=...`

只读取当前选择的偶像，避免一次传输整个 Wiki。`stories` 是可编辑的数据库行；同一卡片可以有
多个不同 `id` 的链接。`categories` 合并后端默认分类与实际数据库分类。

```json
{
  "status": "success",
  "agency": { "id": 6, "code": "sc", "name": "闪耀色彩", "color": "#8dbbff" },
  "idol": { "id": 6, "name": "樱木真乃", "folderName": "sakuragi_mano", "color": "#ffbad6" },
  "categories": ["enza主线", "enzaP卡"],
  "stories": [
    {
      "id": 101,
      "category": "enzaP卡",
      "cardName": "【示例卡片】",
      "upName": "投稿者",
      "videoTitle": "第一话",
      "url": "https://www.bilibili.com/video/BV...",
      "subtitle": "剧情备注",
      "imageFile": "enza_pcard/example.webp",
      "imageUrl": "/image/.../enza_pcard/example.webp"
    }
  ]
}
```

缺少查询参数返回 `400`；企划或偶像不存在返回 `404`。响应中的 `imageUrl` 已经过路径分段编码，
前端不应自行生成对象键。

## 管理写接口

过渡阶段继续使用现有安全写契约，前端统一封装在 `app/shared/api/endpoints/`，不要在组件中手写
Cookie 或 CSRF header。

| 操作 | 接口 | 主要字段 |
| --- | --- | --- |
| 新增剧情链接 | `POST /api/wiki/add_story` | `agency`、`idol`、`category_name`、`card_name`、`up_name`、`video_title`、`url`、可选 `image` |
| 编辑剧情链接 | `POST /api/wiki/edit_story` | 新增字段加 `story_id`、`old_category_name`、`old_card_name` |
| 删除整张卡片及其链接 | `POST /api/wiki/delete_story` | `agency`、`idol`、`category_name`、`card_name` |
| 删除分类及其剧情 | `POST /api/wiki/delete_category` | `agency`、`idol`、`category_name` |
| 解析 Bilibili | `POST /api/wiki/parse_bilibili` | JSON `{ "url": "..." }` |
| 上传或替换系列图标 | `POST /api/wiki/agency-icon` | `agency`、`image` |
| 移除系列图标 | `DELETE /api/wiki/agency-icon` | JSON `{ "agency": "..." }` |

`story_id` 是新增的精确编辑键。服务端按该 ID 读取原始分类和卡片名，不信任客户端提交的旧
分组字段；未提供 `story_id` 时继续兼容旧客户端按卡片查找第一条链接的写入行为。

## 一致性与验证

- 剧情图片先写对象存储，再提交数据库；数据库失败时清理新对象。
- 替换或删除在数据库提交后清理旧对象；清理失败进入补偿机制，不回滚已经提交的业务记录。
- 分类删除只清理规范化目录前缀，不能跨到名称相近的兄弟目录。
- 动态读接口不返回对象存储内部 key、数据库表名或认证信息。
- 独立门禁：`pnpm --filter @imsweb/api run test:wiki`。
- SQLite Repository 门禁：`pnpm --filter @imsweb/api run test:server`。

## 管理端对接顺序

1. 页面加载时请求 catalog，并选择第一个可用企划与偶像。
2. 选择变化时只请求对应 stories；用请求状态防止旧响应覆盖新选择。
3. 表单按 `story.id` 编辑单条链接；删除按钮必须明确“整张卡片”或“整个分类”的影响范围。
4. 写成功后重新获取当前 stories，服务端响应始终作为最终状态。
5. 覆盖加载、错误、空列表、成功和移动端布局，并保留打开公开 `/story` 的入口。

公开目录使用 `/api/wiki/catalog`，角色剧情使用 `/api/wiki/stories`；`/wiki` 与 `/story`
由 Web 预渲染产物提供，不能再注册为 Hono HTML handler。
