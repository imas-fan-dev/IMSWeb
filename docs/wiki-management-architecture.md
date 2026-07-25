# Wiki 数据库驱动内容与管理架构

## 实施状态

代码侧第一批切换已完成：`0007_wiki_catalog_metadata` 保存一次性历史种子，SQLite 提供等价表与
约束，API/Web 已切换到数据库分组、结构化分类和媒体逻辑键，旧角色名单、预设分类、Legacy 媒体
回退及通用静态 Wiki 路由已移除。布局保存使用 `layout_revision` 乐观锁；分组与分类定义的完整
管理界面仍属于后续管理能力，不影响当前读模型切换。

阶段 2 的工具入口为 `pnpm run wiki:metadata:audit`。活动 PostgreSQL 与 MinIO/S3 尚未在仓库代码
施工中自动写入或宣告切换；生产发布前仍须按本文门禁执行清单同步、`--apply --strict` 回读审计，
并保存报告作为外部切换证据。

## 架构决策

Wiki 的企划、偶像、展示分组、成员顺序、预设分类、展示颜色和媒体关联均以关系数据库为
唯一写源。React 页面只负责交互，通过同源 API 读取 Hono 返回的完整读模型；不得根据企划名、
偶像名或 `folder_name` 在浏览器内重建业务关系。

公开 `/wiki` 与 `/story` 已迁移到 React Router。公开页面只读取匿名 JSON API，管理页使用
受保护的行级读模型，并复用已经过补偿测试的 Wiki 写接口。两类前端都不读取数据库结构或
拼接对象存储键。

Web 同时提供 `/wiki/classic` 与 `/story/classic` 作为旧模板交互兼容视图。两套公开视图
读取相同的匿名 API，并直接渲染 API 返回的分组、成员顺序和分类顺序。Classic 只是一种视觉
呈现，不拥有另一份数据配置。

图片、CSS 构建产物等二进制内容不写入关系数据库。数据库只保存业务实体、关系、显示元数据
和对象存储逻辑键；图片字节继续由 `ObjectStorage` 保存，S3 模式下由现有 `s3_*` 控制面表维护
逻辑键到物理版本的映射。

以下内容仍属于程序规则，不进入数据库：

- Cookie JWT、CSRF、角色权限、路径穿越防护和请求状态码；
- 上传大小、允许的 MIME/图片格式和对象键规范化规则；
- 通用加载、错误、空状态等界面文案；
- 旧七张剧情表在 SQL 适配器内的受控表名映射，直至剧情表归一化完成。

当前待清理的运行时数据债务包括：

- Web `wiki-groups.ts` 中的组合、成员、图标、Banner 和顺序；
- API `legacy-media.ts` 中的旧头像、系列 Logo 和背景路径；
- API `service.ts` 中的亮色文字名单、企划顺序、预设分类、分类目录名和随机背景候选；
- `SUPPORTED_AGENCY_CODES` 对公开目录的内容过滤。

```text
React public /wiki, /story and classic variants
  -> same-origin /api/wiki/catalog and /api/wiki/stories
  -> Hono Wiki read handlers -> StoryRepository

React admin
  -> same-origin /api/admin/wiki/*
  -> Hono Wiki handlers
  -> StoryRepository -> SQLite or PostgreSQL
  -> ObjectStorage   -> filesystem or S3-compatible storage

Hono media /image and /icon
  -> database logical key -> ObjectStorage
```

## 目标数据模型

| 数据 | 唯一写源 | 对外形态 |
| --- | --- | --- |
| 企划身份与展示元数据 | `agencies` | 公开与管理目录 API |
| 偶像身份与展示元数据 | `idols` | 公开与管理目录 API |
| 展示分组与成员顺序 | `wiki_groups`、`wiki_group_members` | 目录 API 的有序 `groups` |
| 分类定义与偶像分类顺序 | `wiki_categories`、`wiki_idol_categories` | 剧情 API 的有序 `categories` |
| 剧情链接与卡片字段 | 七张 `*_stories` | 公开聚合视图与管理行级视图 |
| 媒体业务关联 | 上述实体的 `*_object_key`、剧情 `image_file` | 稳定同源媒体 URL |
| 媒体字节与版本 | `ObjectStorage`、`s3_*` 控制面表 | `/image/...`、`/icon/...` |

### `agencies` 增量字段

| 字段 | 约束与用途 |
| --- | --- |
| `wiki_enabled` | `BOOLEAN NOT NULL DEFAULT TRUE`，决定是否进入 Wiki 目录 |
| `display_order` | `INTEGER NOT NULL`，企划稳定排序 |
| `banner_title` | `TEXT NOT NULL`，Classic 与新版共同使用的展示标题 |
| `icon_object_key` | 可空逻辑键；空值表示没有系列图标，不回退到代码路径 |
| `fallback_artwork_object_key` | 可空逻辑键；没有可用剧情图片时的企划视觉 |
| `layout_revision` | `BIGINT NOT NULL DEFAULT 0`，管理端布局写入的乐观锁版本 |

### `idols` 增量字段

| 字段 | 约束与用途 |
| --- | --- |
| `wiki_enabled` | `BOOLEAN NOT NULL DEFAULT TRUE` |
| `display_order` | `INTEGER NOT NULL`，分组内默认排序 |
| `text_color` | `TEXT NOT NULL`，替代按偶像名维护的亮色例外名单 |
| `avatar_object_key` | 可空头像逻辑键；空值由 UI 显示中性占位，不回退旧站资源 |
| `avatar_fit` | `TEXT NOT NULL CHECK (avatar_fit IN ('cover', 'contain'))` |

`idols` 需要补充 `(id, agency_id)` 唯一约束，供成员关系建立同企划复合外键。

### `wiki_groups`

每行表示一个企划内的展示组合或业务分区：

```text
id, agency_id, code, name, color, icon_object_key,
display_order, is_fallback
```

- `(agency_id, code)` 唯一；同一企划最多一个 `is_fallback=true` 分组。
- `(id, agency_id)` 唯一，供成员表建立同企划复合外键。
- `display_order` 非负且在企划内唯一。
- `color` 使用六位十六进制颜色；`icon_object_key` 可空。
- fallback 分组也是数据库记录，不由 Web 临时创建“其他”分组。

### `wiki_group_members`

```text
agency_id, group_id, idol_id, display_order
```

- `(group_id, idol_id)` 为主键，`idol_id` 唯一，确保一个偶像只进入一个展示分组。
- 通过 `(group_id, agency_id)` 与 `(idol_id, agency_id)` 复合外键阻止跨企划成员关系。
- `display_order` 在分组内唯一；新增偶像必须显式分配到该企划的 fallback 分组。

### `wiki_categories` 与 `wiki_idol_categories`

`wiki_categories` 保存企划内可复用的分类定义：

```text
id, agency_id, name, storage_slug, background_eligible
```

`wiki_idol_categories` 保存某偶像启用的分类及其顺序：

```text
agency_id, idol_id, category_id, display_order, show_when_empty
```

- `(agency_id, name)` 唯一；`storage_slug` 经过与对象键相同的安全校验。
- `wiki_categories` 的 `(id, agency_id)` 唯一；关联表分别通过
  `(idol_id, agency_id)` 和 `(category_id, agency_id)` 复合外键阻止跨企划分类。
- `show_when_empty` 替代 `getPresetCategories()`，决定空分类是否出现在读模型中。
- 新增剧情时，写服务必须在同一数据库事务中解析或创建分类定义与偶像关联。
- 旧剧情表仍保存分类名称；读取时未匹配的历史分类追加到结果并产生审计告警，迁移验收要求告警为零。
- `background_eligible` 替代 `randomBackground()` 内按企划写死的候选分类。

`theme_colors` 当前只是未被运行时消费的 `name -> color` 表，缺少实体外键和顺序语义。迁移时可
作为颜色回填输入，但不能作为新的通用配置表；确认无其他消费者后再单独决定是否退役。

## Repository 与服务边界

`StoryRepository` 负责批量返回数据库记录，不返回 URL，也不接触对象存储。Wiki service 只把
记录中的逻辑键解析成稳定同源 URL。目标端口至少提供：

- 按可选企划选择器读取有序企划、分组、成员和媒体逻辑键；
- 按偶像读取有序分类及剧情行；
- 原子保存企划展示元数据、分组、成员顺序和分类顺序；
- 原子设置或清除系列图标、组合图标和偶像头像逻辑键；
- 从数据库选择符合 `background_eligible` 的随机剧情图片。

目录读取必须使用有界批量查询，不能按每个偶像或每个分组执行一次 SQL。对象存在性不通过目录
扫描推断；业务表中的逻辑键是关联事实，`ObjectStorage` 只负责按键读取和版本管理。

## 公开读取 API

公开接口无需登录，只返回浏览页面需要的数据，不包含数据库表名、对象存储 key 或管理字段。

### `GET /api/wiki/catalog?agency=...`

返回 `wiki_enabled=true` 的有序企划摘要，以及当前企划的完整有序分组。分组内已经包含角色，
Web 不再调用 `groupWikiIdols()`。省略 `agency` 时选择 `display_order` 最小的企划；查询参数同时
接受数据库中的企划 `code` 或名称。

媒体 URL 由数据库逻辑键解析。逻辑键为空时返回 `null` 或空 URL，由前端显示中性占位；不得回退
到 `classicAgencyIcons`、`legacyAvatarMedia` 或任意 `/assets/images/...` 路径。

目标响应形态：

```json
{
  "status": "success",
  "agencies": [
    {
      "id": 6,
      "code": "sc",
      "name": "闪耀色彩",
      "color": "#8dbbff",
      "bannerTitle": "283 Production",
      "iconUrl": "/icon/agencies/6.webp?v=etag",
      "idolCount": 28
    }
  ],
  "selection": {
    "agency": { "id": 6, "code": "sc", "name": "闪耀色彩" },
    "layoutRevision": 4,
    "groups": [
      {
        "id": 31,
        "code": "illumination-stars",
        "name": "illumination STARS",
        "color": "#ffd700",
        "iconUrl": "/icon/wiki-groups/31.webp?v=etag",
        "idols": []
      }
    ]
  }
}
```

### `GET /api/wiki/stories?agency=...&idol=...`

返回当前角色、头像和按分类、卡片聚合的剧情来源。同一卡片的多个数据库行会保留为多个
`links`。分类顺序和空分类可见性来自 `wiki_idol_categories`；卡片图片和头像均使用稳定的
同源 URL。前端只允许打开 `http`/`https` 来源链接。

## 管理读取 API

两个接口都要求 access JWT Cookie，角色必须为 `editor` 或 `op`。access JWT 过期时，Web
客户端通过 refresh Cookie 自动轮换会话并重放原请求。GET 不要求 CSRF；所有写请求仍要求
JWT claim 对应的 `X-CSRFToken`。

### `GET /api/admin/wiki/catalog`

返回数据库中的 Wiki 企划、展示元数据、分组、成员顺序和媒体状态。该接口不逐个扫描对象存储，
适合页面首次加载；对象是否关联以业务表逻辑键为准。

```json
{
  "status": "success",
  "agencies": [
    {
      "id": 6,
      "code": "sc",
      "name": "闪耀色彩",
      "color": "#8dbbff",
      "bannerTitle": "283 Production",
      "displayOrder": 6,
      "layoutRevision": 4,
      "iconUrl": "/icon/agencies/6.webp?v=etag",
      "groups": [
        {
          "id": 31,
          "code": "illumination-stars",
          "name": "illumination STARS",
          "displayOrder": 1,
          "idols": [
            {
              "id": 6,
              "name": "樱木真乃",
              "folderName": "sakuragi_mano",
              "color": "#ffbad6",
              "textColor": "#333333",
              "displayOrder": 1
            }
          ]
        }
      ]
    }
  ]
}
```

### `GET /api/admin/wiki/stories?agency=...&idol=...`

只读取当前选择的偶像，避免一次传输整个 Wiki。`stories` 是可编辑的数据库行；同一卡片可以有
多个不同 `id` 的链接。`categories` 返回分类 ID、名称、存储 slug、顺序、空分类可见性和随机
背景资格，不再合并后端名称规则。

```json
{
  "status": "success",
  "agency": { "id": 6, "code": "sc", "name": "闪耀色彩", "color": "#8dbbff" },
  "idol": { "id": 6, "name": "樱木真乃", "folderName": "sakuragi_mano", "color": "#ffbad6" },
  "categories": [
    {
      "id": 81,
      "name": "enzaP卡",
      "storageSlug": "enza_pcard",
      "displayOrder": 4,
      "showWhenEmpty": true,
      "backgroundEligible": true
    }
  ],
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

所有新增写接口统一放在 `/api/admin/wiki/*`，要求 `editor` 或 `op` access JWT Cookie 与匹配
的 CSRF claim。refresh token 只由 `/api/refresh` 和 `/api/logout` 使用。前端统一封装在
`app/shared/api/endpoints/`，不要在组件中手写 Cookie、CSRF header 或数据库字段。

| 操作 | 接口 | 主要字段 |
| --- | --- | --- |
| 编辑企划展示信息 | `PATCH /api/admin/wiki/agencies/:agencyId` | `bannerTitle`、`color`、`displayOrder`、`wikiEnabled` |
| 新增展示分组 | `POST /api/admin/wiki/groups` | `agencyId`、`code`、`name`、`color`、`isFallback` |
| 编辑/删除展示分组 | `PATCH/DELETE /api/admin/wiki/groups/:groupId` | 分组展示字段；删除前必须迁移成员 |
| 保存完整分组布局 | `PUT /api/admin/wiki/agencies/:agencyId/layout` | `expectedRevision`、有序分组和成员 ID |
| 新增/编辑分类 | `POST/PATCH /api/admin/wiki/categories` | `agencyId`、`name`、`storageSlug`、`backgroundEligible` |
| 保存偶像分类顺序 | `PUT /api/admin/wiki/idols/:idolId/categories` | 有序分类 ID、`showWhenEmpty` |
| 上传或移除企划/分组/偶像媒体 | `/api/admin/wiki/media/*` | 业务实体 ID 与图片，不接受客户端对象键 |
| 新增剧情链接 | `POST /api/wiki/add_story` | `agency`、`idol`、`category_name`、`card_name`、`up_name`、`video_title`、`url`、可选 `image` |
| 编辑剧情链接 | `POST /api/wiki/edit_story` | 新增字段加 `story_id`、`old_category_name`、`old_card_name` |
| 删除整张卡片及其链接 | `POST /api/wiki/delete_story` | `agency`、`idol`、`category_name`、`card_name` |
| 删除分类及其剧情 | `POST /api/wiki/delete_category` | `agency`、`idol`、`category_name` |
| 解析 Bilibili | `POST /api/wiki/parse_bilibili` | JSON `{ "url": "..." }` |

`story_id` 是新增的精确编辑键。服务端按该 ID 读取原始分类和卡片名，不信任客户端提交的旧
分组字段；未提供 `story_id` 时继续兼容旧客户端按卡片查找第一条链接的写入行为。

布局保存必须在一个数据库事务内验证以下条件后整体提交：请求覆盖该企划所有启用偶像、每个
偶像只出现一次、所有分组属于该企划、顺序不重复且恰有一个 fallback 分组。服务端用
`expectedRevision` 与 `agencies.layout_revision` 做比较；版本不一致返回 `409`，成功后递增版本。

媒体上传先写入受管理的逻辑键，再在数据库事务中设置实体的 `*_object_key`；数据库提交失败时
清理新对象。移除媒体时先清空业务关联并提交，再按预期对象版本删除，失败进入补偿队列。公开
接口和媒体 handler 永远不接受或返回原始对象键。

## 一致性与验证

- 剧情图片先写对象存储，再提交数据库；数据库失败时清理新对象。
- 替换或删除在数据库提交后清理旧对象；清理失败进入补偿机制，不回滚已经提交的业务记录。
- 分类删除只清理规范化目录前缀，不能跨到名称相近的兄弟目录。
- 每个 `wiki_enabled` 偶像必须恰好属于一个同企划分组。
- 每个企划必须恰好有一个 fallback 分组，且企划、分组、成员和分类顺序均无重复值。
- 每个历史剧情分类必须能解析到同企划的 `wiki_categories` 和当前偶像的分类关联。
- 所有非空 `*_object_key` 必须能由 `ObjectStorage` 回读；对象存在不反向推导业务关联。
- 动态读接口不返回对象存储内部 key、数据库表名或认证信息。

## 数据迁移与切换

### 阶段 0：活动数据盘点

迁移前必须连接活动 PostgreSQL 与目标 MinIO/S3，记录以下基线；工作区中的空 SQLite 文件不能
代替活动数据证据：

- `agencies`、`idols`、七张剧情表和 `theme_colors` 的行数与关键字段摘要；
- 当前公开 catalog/stories 的企划、分组、成员与分类顺序快照；
- 旧头像、企划图标、分组图标、企划视觉和剧情图片的对象存在性及 SHA-256；
- 无匹配分组偶像、重复成员、未知分类和缺失对象列表。

任何未知偶像或缺失业务媒体都必须显式决定目标分组或空媒体状态，不能由迁移器静默猜测。

### 阶段 1：版本化 schema 与业务数据回填

新增 PostgreSQL `0007_wiki_catalog_metadata` post-data migration。之所以使用 post-data，是因为
首次 SQLite 导入会先写入 `agencies`、`idols` 和剧情行，migration 才能按稳定 ID/业务键建立
关系。SQLite Schema Strategy 与 Story migration 同步提供等价表、约束和测试夹具。

该 migration 在一个事务中：

1. 先添加可空企划/偶像展示字段并创建四张 Wiki 元数据表和索引；
2. 将当前 `wiki-groups.ts` 的分组/成员、`service.ts` 的分类/顺序和 `legacy-media.ts` 的业务关联
   转换为一次性种子数据；
3. 按 `agency.code + idol.folder_name` 解析成员，按现有剧情行补齐未列出的分类；
4. 验证全量成员、分类与顺序约束，再设置 `NOT NULL`/唯一约束；任一不满足则回滚整个
   migration。

版本化 migration 中的种子是不可变的历史初始化记录，不是运行时配置。切换后新增或调整数据只
通过管理 API/数据库事务完成，不再修改 migration 或重新引入 TypeScript 常量。

### 阶段 2：媒体关联回填

提供 `wiki:metadata:migrate` 工具，默认只生成 `data/migration/` 下被忽略的 JSON 报告；只有
显式 `--apply` 才写入。工具通过 `StoryRepository` 和 `ObjectStorage` 工作，不直连 provider：

1. 将仍需保留的旧媒体同步到语义化 Wiki 对象键；
2. 回读大小、MIME、ETag/SHA-256 后设置对应实体的逻辑键；
3. 对缺失对象保留 `NULL` 并报告，不写入旧站 URL；
4. 应用后重新读取数据库和对象存储，确保报告中的待处理项为零或已有显式豁免。

### 阶段 3：API 与 Web 同步切换

- Repository 新增数据库驱动的目录、分类、布局与媒体关联方法；
- 公开与管理 API 同步升级 schema，直接返回 `groups` 和结构化 `categories`；
- 新旧 Wiki 视图同时改为渲染 API 分组；删除 Web 端二次分组逻辑；
- 随机背景仅从数据库标记的候选分类和对象键选择；没有候选时返回空 URL；
- 切换版本不提供运行时双读。迁移未通过时拒绝发布，而不是回退 TypeScript 常量。

### 阶段 4：退役旧实现

只有数据库/对象存储审计和新读模型门禁全部通过后，才删除：

- `apps/web/app/pages/wiki/wiki-groups.ts` 及对应单元测试；
- `apps/api/src/domains/wiki/legacy-media.ts` 与 `import-legacy-idol-media` handler/路由；
- `getPresetCategories()`、企划顺序/颜色、亮色文字名单、分类目录映射和随机背景候选常量；
- `/css/*` Wiki 路由和通用旧 `/icon/*` 静态 fallback，仅保留数据库实体媒体路由；
- 无持久化行为的 `save-story-layout` 兼容 handler。

不可删除已经执行的 migration。旧静态文件从运行时树移除后仍可从 Git 历史恢复，但不再参与发布。

## 验收门禁

数据级验收必须全部为零：未分组启用偶像、重复成员、跨企划成员、缺少 fallback 的企划、重复
顺序、未知剧情分类、无效颜色、非法对象键和非空但不可读的媒体键。

行为级验收要求迁移前后企划/分组/偶像/分类的集合与顺序一致；允许的差异只有已记录的缺失媒体
改为空占位。还必须证明运行时源代码不再包含角色名单、预设分类名单或 `/assets/images/...` Wiki
回退路径。

实现阶段至少运行：

```sh
pnpm --filter @imsweb/api run check
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/web run check
pnpm run test:web-routing
pnpm run check
pnpm run test
```

迁移工具另需覆盖 dry-run 无写入、重复执行幂等、事务回滚、未知成员、未知分类、缺失对象和应用后
回读对账。生产切换证据必须包含活动 PostgreSQL 查询与 MinIO/S3 回读，不能用 fixture 或空本地库
代替。

## 回滚边界

schema migration 采用增量表/列，不在首次切换中删除原剧情表或旧字段。代码发布失败可以回滚到
切换前版本；数据回填必须幂等。完成阶段 4 后的回滚仍应读取数据库元数据，不得恢复 Web 静态
配置或 API legacy fallback。生产数据迁移和外部切换需要独立审批，本地门禁通过不等于生产完成。

## 管理端交互顺序

1. 页面加载时请求管理 catalog，保留当前 `layoutRevision`，并选择第一个可用企划与偶像。
2. 分组拖放只修改本地草稿；保存时提交完整布局与 `expectedRevision`，`409` 后重新加载而不是
   覆盖他人修改。
3. 选择变化时只请求对应 stories；用请求状态防止旧响应覆盖新选择。
4. 分类管理按分类 ID 写入定义与偶像关联；删除按钮必须区分“仅取消该偶像关联”和“删除分类及
   剧情”。
5. 剧情表单按 `story.id` 编辑单条链接；删除按钮必须明确“整张卡片”或“整个分类”的影响范围。
6. 写成功后重新获取当前服务端读模型，并覆盖加载、错误、空列表、冲突、成功和移动端状态。

公开目录使用 `/api/wiki/catalog`，角色剧情使用 `/api/wiki/stories`；`/wiki` 与 `/story`
由 Web 预渲染产物提供，不能再注册为 Hono HTML handler。
