# Wiki 动态内容与管理架构

## 当前状态

Wiki 的企划、栏目、内容页、栏目归档关系、剧情分类、剧情卡片、内容类型、来源平台和媒体构图均由
数据库驱动。React 不维护企划或内容页名单，也不根据名称重建栏目关系；Hono 通过
`StoryRepository` 读取和修改业务数据，通过 `ObjectStorage` 保存图片字节。

当前 PostgreSQL 最低 schema 版本为 `0017_wiki_entry_types`。`0011` 至 `0017` 已在
代码、SQLite 等价 schema 和测试夹具中落地，但代码合入或本地迁移成功不代表生产数据库已完成
迁移，生产边界见“迁移与发布”。

```text
公开 /wiki、/story（含 classic 视图）
  -> /api/wiki/catalog、/api/wiki/stories
  -> Hono Wiki handlers -> StoryRepository -> PostgreSQL

后台 /admin/stories
  -> /api/admin/wiki/catalog、/api/admin/wiki/stories
  -> 企划/栏目/内容页 CRUD 与剧情写接口
  -> StoryRepository + ObjectStorage
```

## 关系模型

```text
Agency
  |-- Section *           (wiki_groups，兼容名)
  |     `-- ContentPage * (idols + wiki_group_members，多对多)
  |-- ContentPage *
  `-- Category *
          `-- IdolCategory *
                  `-- StoryCard *
                          `-- StoryLink *
                                |-- ContentType 1
                                `-- SourcePlatform 1
```

| 业务对象 | 运行时写源                                | 关键关系                                   |
| -------- | ----------------------------------------- | ------------------------------------------ |
| 企划     | `agencies`                                | 拥有栏目、内容页和分类                       |
| 栏目     | `wiki_groups`                             | 必须归属一个企划，仅负责组织内容页           |
| 归档关系 | `wiki_group_members`                      | 内容页与栏目多对多，保存栏目内顺序           |
| 内容页   | `idols`                                   | 必须归属企划，可加入多个栏目并保存页面类型    |
| 分类     | `wiki_categories`、`wiki_idol_categories` | 企划级定义，按内容页启用并排序               |
| 剧情卡片 | `wiki_story_cards`                        | 归属内容页与分类，保存卡名、字幕、图片和构图 |
| 卡片内容 | `wiki_story_links`                        | 多种内容与多条来源可归入同一张卡片         |
| 内容类型 | `wiki_story_content_types`                | 剧情、语音、电话、文本专栏等动态目录       |
| 来源平台 | `wiki_story_source_platforms`             | 平台名称、主页、说明、启用状态与版本       |
| 图片字节 | `ObjectStorage`                           | 数据库只保存对象逻辑键和构图元数据         |

### 动态目录、栏目与内容页

`0011_wiki_dynamic_catalog` 完成以下约束调整：

- 移除 `wiki_group_members.idol_id` 的全局唯一约束；主键仍为
  `(group_id, idol_id)`，所以同一内容页可加入多个栏目，但不能在同一栏目内重复。
- 成员关系同时保存 `agency_id`，并通过同企划外键阻止跨企划关联。
- 企划名称全局唯一；内容页名称和 `folder_name` 在企划内唯一；栏目代码和名称在企划内唯一。
- 企划、栏目代码及内容页目录标识使用小写字母、数字、下划线或连字符；颜色使用六位十六进制值。

新增企划时，Repository 会在同一批次创建一个初始 `other` fallback 栏目；该栏目与其他栏目一样
可以删除。新增或编辑内容页时提交无重复的 `groupIds`，空数组表示暂不归档；服务端验证所有非空
栏目 ID 均属于该内容页的企划。编辑内容页时只增删发生变化的归档关系：保留未变化关系的
`display_order`，并将新加入栏目的关系追加到该栏目末尾。

`PUT /api/admin/wiki/agencies/:agencyId/layout` 用于保存完整栏目布局。请求必须覆盖该企划的全部
现存栏目，同一栏目内不能重复内容页，但同一内容页可以出现在多个栏目中；未出现在任何栏目成员
列表中的内容页保持未归档状态。`expectedRevision` 与 `agencies.layout_revision` 实现乐观锁，冲突返回
`409`。

`0017_wiki_entry_types` 在兼容表 `idols` 上新增 `entry_kind` 和 `entry_subtype`。界面把所有记录称为
“内容页”，再以 `idol`、`unit`、`story`、`other` 区分偶像、组合、剧情专题和其他内容；剧情专题
必须进一步选择 `main`、`event`、`special` 或 `other`。既有记录默认保留为偶像，SideM 的组合栏目
成员回填为组合，特殊剧情栏目成员回填为特殊剧情。数据库约束保证非剧情内容没有剧情子类型。

本阶段只改变业务叫法和增加类型元数据。`idols`、`idolId`、公开查询参数 `idol=` 以及既有对象存储
路径仍是兼容契约，避免破坏书签、外部客户端和已有媒体；新代码不得根据内容页类型改写这些标识。

### 规范化剧情

`0012_wiki_normalized_stories` 新增 `wiki_story_cards` 和 `wiki_story_links`。运行时查询和写入均使用
这两张表，不再按企划选择不同的剧情表：

- 卡片由 `agency_id + idol_id + category_id + card_name` 唯一确定。
- 卡片保存共享的字幕、图片、构图与展示顺序；来源保存发布者、标题、URL、内容类型、来源平台和卡内顺序。
- 一次新增请求可以原子创建一张卡片及 0 至 20 条来源；分类不存在时会创建企划级分类及对应
  内容页关联。向已有卡片追加来源使用卡片 ID 和媒体版本精确定位，不再按名称隐式创建卡片。
- 卡片可以在尚无可用剧情链接时先保存资料、封面和构图；删除最后一条来源会保留空卡片，后续可
  继续按卡片 ID 追加来源。公开页和管理工作台都会显示空卡片。
- 分类和卡片使用稳定 ID 独立编辑：分类名称是企划级共享定义，卡片保存自己的名称、字幕、图片与
  构图；来源仍以来源 `id` 精确定位。移动卡片分类不会修改其来源行。

迁移会把七张历史 `*_stories` 表回填到规范化表，并用双向 `EXCEPT`、行数和卡片数检查保证投影
一致。历史行的 `legacy_table`、`legacy_id`、`legacy_subtitle`、`legacy_image_file` 仅用于迁移
对账和兼容既有 API ID。七张历史表保留为只读迁移证据，不是运行时读写源，也不能继续新增数据。

`0014_wiki_story_source_catalogs` 把内容类型和来源平台从来源文本中拆成可管理目录。同一张卡片可由
多条 `wiki_story_links` 同时关联剧情、语音、电话或文本专栏；每条链接另行关联来源平台，发布者
仍保留为该链接自己的署名。既有链接默认回填为“剧情”，Bilibili URL 归入 Bilibili，其余归入
“其他来源”。目录项可停用，停用不影响历史显示；仍被链接引用的目录项受外键保护，不能删除。

`0015_wiki_story_cover_assets` 新增企划级 `wiki_story_cover_assets` 素材目录，并允许剧情卡片通过
`cover_asset_id` 复用其中一张封面。共享素材和卡片自己的 `image_file` 互斥；素材只能被同企划卡片
引用，仍有引用时不能删除。素材替换只更新一个版本化对象键，引用它的全部卡片会在下次读取时使用
新图，而每张卡片仍保留自己的构图参数。

`0016_wiki_soft_deletion` 为内容页、剧情卡片和剧情来源增加 `deleted_at`。删除内容页时，三层记录在
同一事务中标记为已删除，并从公开与管理读取中隐藏；栏目成员、分类关联、页面图片、剧情图片及
共享素材引用均保留，避免一次操作物理移除大量关联数据。删除使用页面图片媒体版本作为乐观锁，
并递增企划布局版本。目前不开放恢复入口，但数据结构保留了后续恢复能力。

## 图片与构图

`0013_wiki_image_transforms` 为企划图标、栏目图标、内容页图片和剧情卡片图片增加统一构图字段：

| 字段语义      | 允许值                  |
| ------------- | ----------------------- |
| 适配方式      | `cover` 或 `contain`    |
| 水平/垂直焦点 | `0` 到 `1`              |
| 缩放          | `1` 到 `3`              |
| 旋转          | `0`、`90`、`180`、`270` |
| 媒体版本      | 非负整数                |

管理端可上传 PNG、JPEG、WebP、AVIF 或 GIF；服务端校验内容并统一转换为 WebP。上传使用带 UUID
版本的对象键，数据库提交成功后才清理旧对象；数据库失败或版本冲突时清理新对象，避免孤儿文件。
API 不向浏览器暴露对象存储 key。

图片上传和仅调整构图都提交 `expected_revision`。Repository 以实体的
`icon_media_revision`、`avatar_media_revision` 或卡片的 `image_media_revision` 做比较并原子递增；
并发编辑冲突返回 `409` 和当前版本。剧情卡可选择企划共享素材、独立图片或无封面；同一卡片的全部
来源共享所选图片与构图。

公开页和后台预览都通过 `ObjectStorage.createPublicReadUrl` 把数据库中的逻辑对象键解析为
OSS、R2 或本地 MinIO 的公开直链，并复用同一组 `imageTransform`，因此裁满/完整显示、焦点、
缩放和旋转在编辑预览与 Wiki 展示中的层级和效果一致。读取不经 Hono 转发图片字节；上传、替换、
删除和构图保存仍只允许通过鉴权后的管理 API 完成。

## API 契约

公开读取无需登录；管理读取和所有写入要求有效 access JWT。写请求还要求 JWT claim 匹配的
`X-CSRFToken`，角色必须为 `editor` 或 `op`。

### 公开与管理读取

| 方法与路径                                        | 用途                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| `GET /api/wiki/catalog?agency=...`                | 有序企划及所选企划的栏目、内容页、类型与构图    |
| `GET /api/wiki/stories?agency=...&idol=...`       | 分类 -> 卡片 -> 来源的公开剧情树                |
| `GET /api/admin/wiki/catalog`                     | 全量企划、唯一内容页、各栏目成员 ID 与媒体版本   |
| `GET /api/admin/wiki/stories?agency=...&idol=...` | 单个内容页的分类、卡片来源和可编辑字段           |
| `GET /api/admin/wiki/agencies/:agencyId/story-cover-assets` | 企划共享封面、状态与引用计数          |
| `POST /api/admin/wiki/agencies/:agencyId/story-cover-assets` | 上传企划共享封面                      |
| `PATCH /api/admin/wiki/story-cover-assets/:assetId`          | 编辑名称、状态或替换图片              |
| `DELETE /api/admin/wiki/story-cover-assets/:assetId`         | 仅删除未被卡片引用的素材              |
| `GET /api/admin/wiki/story-source-catalog`        | 全量内容类型与来源平台目录                      |

公开 catalog 的 `entryCount` 按内容页 ID 去重；`idolCount`、`groups`、`idols` 和
`ungroupedIdols` 作为兼容字段继续返回。同一内容页可在多个栏目分支中展示，但不重复计数；没有
任何栏目关系的内容页通过 `ungroupedIdols` 返回，并在全部栏目之后展示。

### 企划、栏目与内容页写入

| 方法与路径                                       | 当前行为                                         |
| ------------------------------------------------ | ------------------------------------------------ |
| `POST /api/admin/wiki/agencies`                  | 新增企划并创建 fallback 栏目                     |
| `PATCH /api/admin/wiki/agencies/:agencyId`       | 编辑企划名称、颜色、标题和 Wiki 可见性           |
| `POST /api/admin/wiki/agencies/:agencyId/groups` | 在指定企划下新增栏目                             |
| `PATCH /api/admin/wiki/groups/:groupId`          | 编辑栏目代码、名称和颜色                         |
| `DELETE /api/admin/wiki/groups/:groupId`         | 删除栏目并保留内容页、剧情和其他归档关系         |
| `POST /api/admin/wiki/agencies/:agencyId/idols`  | 新增内容页，写入类型及零个或多个 `groupIds`      |
| `PATCH /api/admin/wiki/idols/:idolId`            | 编辑内容页资料、类型、可见性和多个栏目关系       |
| `DELETE /api/admin/wiki/idols/:idolId`           | 软删除内容页及其卡片、来源，保留媒体与关联记录   |
| `PUT /api/admin/wiki/agencies/:agencyId/layout`  | 以 `layoutRevision` 保存完整栏目成员顺序         |

当前没有企划删除接口。创建后不可通过当前编辑表单修改企划代码或内容页 `folderName`，避免改变稳定
业务标识和媒体路径。删除栏目只删除栏目及其归档关系；失去最后一个栏目关系的内容页进入未归档区。

### 媒体与剧情写入

| 方法与路径                                     | 当前行为                                   |
| ---------------------------------------------- | ------------------------------------------ |
| `PUT /api/admin/wiki/agencies/:agencyId/icon`  | 上传/替换企划图标或只更新构图              |
| `PUT /api/admin/wiki/groups/:groupId/icon`     | 上传/替换栏目图标或只更新构图              |
| `PUT /api/admin/wiki/idols/:idolId/avatar`     | 上传/替换内容页图片或只更新构图            |
| `POST /api/wiki/add_story`                     | 原子新增卡片及 0 至 20 条来源              |
| `POST /api/admin/wiki/cards/:cardId/sources`   | 按卡片 ID 和版本原子追加 1 至 20 条来源    |
| `POST /api/wiki/edit_story`                    | 按来源 ID 编辑兼容客户端中的来源字段       |
| `DELETE /api/admin/wiki/stories/:storyId`      | 删除单条来源；最后一条删除后保留空卡片     |
| `POST /api/admin/wiki/agencies/:agencyId/idols/:idolId/categories` | 为内容页显式新增空分类     |
| `PATCH /api/admin/wiki/categories/:categoryId` | 重命名企划级共享分类并保留素材目录         |
| `PATCH /api/admin/wiki/cards/:cardId`          | 编辑卡片分类、名称、字幕、图片和构图       |
| `POST /api/wiki/delete_story`                  | 删除指定分类下的整张卡片及其来源           |
| `POST /api/wiki/delete_category`               | 删除该内容页的分类关联及其剧情             |
| `POST /api/wiki/parse_bilibili`                | 解析 Bilibili 标题、UP 和规范 URL          |

内容与来源目录使用以下管理接口；新增和编辑结果会由工作台重新读取，目录编辑使用 `revision` 防止
静默覆盖：

| 方法与路径                                                | 当前行为                       |
| --------------------------------------------------------- | ------------------------------ |
| `POST /api/admin/wiki/story-content-types`                | 新增内容类型                   |
| `PATCH /api/admin/wiki/story-content-types/:optionId`     | 编辑名称、说明与启用状态       |
| `DELETE /api/admin/wiki/story-content-types/:optionId`    | 仅删除未被任何来源引用的类型   |
| `POST /api/admin/wiki/story-source-platforms`             | 新增来源平台                   |
| `PATCH /api/admin/wiki/story-source-platforms/:optionId`  | 编辑名称、主页、说明与启用状态 |
| `DELETE /api/admin/wiki/story-source-platforms/:optionId` | 仅删除未被任何来源引用的平台   |

剧情写接口保留在现有 `/api/wiki/*` 路径以兼容客户端，但和 `/api/admin/wiki/*` 一样受管理写权限
与 CSRF 保护。旧的企划图标和内容页媒体兼容接口仍存在于路由层；新的工作台使用上表三个按实体 ID
寻址、带构图和版本控制的 `PUT` 接口。

## 管理工作台

`/admin/stories` 直接呈现 Wiki 内容工作台，层级与公开剧情页一致：

```text
企划 -> 栏目 -> 内容页 -> 分类 -> 卡片 -> 来源
```

- 顶部切换企划；左侧树按栏目展开内容页，未归档内容固定在末尾；桌面为双栏，移动端使用侧边
  Sheet。
- 同一内容页出现在多个栏目时以同一个内容页 ID 选中，右侧仍只有一份资料和剧情内容。
- 企划、栏目、内容页共用实体编辑 Dialog；内容页通过分段控件选择类型，并可归入多个栏目。
- 实体编辑器内可上传图片，并实时预览适配方式、焦点、缩放和 90 度旋转。
- 右侧按分类 -> 卡片 -> 内容来源折叠展示；每条来源显示内容类型、来源平台和发布者，卡片汇总内容
  类型数与来源数。分类和卡片均有独立二次编辑入口；新增卡片时可不添加来源，也可在同一个 Dialog 中添加多种
  内容与多条来源，已有卡片可继续批量添加，单条来源也可独立编辑或删除。
- 顶部“类型与来源”打开数据库目录管理；目录项可新增、编辑、停用或在无引用时删除。
- 顶部“企划素材库”进入 `/admin/stories/assets` 专用页面；素材按企划上传、搜索、编辑、停用和删除，
  卡片编辑器可在共享素材、独立上传和无封面之间切换。
- 当前企划和内容页写入 URL 查询参数 `agencyId`、`idolId`，刷新或分享后台地址时可恢复工作位置。

写入成功后工作台重新读取 catalog 或当前内容页 stories，服务端读模型始终是最终显示依据。

## 一致性边界

- 企划拥有栏目和内容页；归档关系只允许连接同一企划的实体。
- 内容页可以不属于任何栏目，也可属于多个栏目；栏目内不能重复，公开计数按内容页 ID 去重。
- 完整布局写入必须覆盖全部现存栏目；没有出现在成员列表中的内容页保持未归档状态。
- 同一企划内的实体名称、代码或目录标识按数据库约束保持唯一。
- 剧情层级只写规范化卡片/来源表；历史表只用于对账。
- 共享封面只允许同企划卡片引用，并与卡片独立图片互斥；引用计数非零时删除返回 `409`。
- 分类重命名携带当前名称，卡片追加来源以及栏目、来源删除携带当前媒体版本；过期写入返回 `409`，
  不覆盖其他管理员的修改。
- 非空媒体逻辑键必须能由 `ObjectStorage` 回读；对象存在本身不反向创建业务关联。
- 媒体和布局均使用 revision 防止静默覆盖并发修改。

## 迁移与发布

### 本地开发

先执行只读诊断，再使用统一开发入口；`pnpm dev` 会启动本地 PostgreSQL/MinIO、幂等应用全部
migration，然后启动 API 和 Web：

```sh
pnpm run dev:doctor
pnpm dev
```

仅需对已运行的本地 PostgreSQL 应用 migration 时，可在确认目标连接为本地回环数据库后运行：

```sh
pnpm run migration:postgresql
```

API 启动会检查 `ims_schema_migrations` 是否包含 `0017_wiki_entry_types`；缺失时拒绝启动并
提示迁移。已经执行的 migration 不得修改或删除。

### 生产环境

生产迁移是独立发布操作，不由代码合入、本地测试或 `pnpm dev` 代替。执行前必须确认生产数据库
URL、备份、维护窗口和对象存储目标；执行后保存以下证据：

1. `0011` 至 `0017` 均记录在 `ims_schema_migrations`，checksum 无漂移。
2. `0012` 的历史行数、卡片数和双向投影检查全部通过。
3. 企划、栏目、内容页、页面类型及多栏目归档关系可从管理 catalog 回读。
4. 非空媒体逻辑键可从目标 S3/MinIO 回读，上传替换不会遗留新对象。
5. 公开 catalog/stories 与后台工作台完成实际 HTTP 和浏览器检查。

本次 schema 不删除七张历史剧情表，因此可保留迁移证据；但回滚旧代码前必须确认旧版本不会继续
向历史表写入，否则会与规范化运行时数据分叉。生产迁移和切换需要独立审批，本地门禁通过不等于
生产切换完成。

## 验证命令

从仓库根目录使用 Node.js `>=22.13.0` 和 pnpm 11：

```sh
# schema、Repository、路由与迁移契约
pnpm --filter @imsweb/api run typecheck:server
pnpm --filter @imsweb/api run test:migration
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:server

# 工作台、公开视图和 API 客户端
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run build

# 仓库级发布门禁
pnpm run test:web-routing
pnpm run check
pnpm run test
```

涉及真实媒体或迁移切换时，自动化测试之外还必须用目标环境的 PostgreSQL、对象存储和浏览器完成
回读；fixture、空 SQLite 或仅构建成功不能作为生产数据验收证据。
