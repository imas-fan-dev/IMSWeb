# 名片图片统一：执行文档

> 文档类型：执行计划
> 状态：Decision（已批准执行）
> 权威来源：`apps/api/src/domains/community/fudaba/cards/`、`apps/api/src/infra/db/repositories/`、`packages/contracts/src/`、`apps/web/app/components/shared/`
> 关联调查：`docs/architecture/namecard-media-pipeline.md`

## 0. 已定结论

- 布局：`community/fudaba/cards/<cardId>/<live|pending>/<pageId>.<version>.webp`，`pageId` 为稳定槽位（`front`、`back`、`page-<uuid>`），`version` 为短 uuid。
- 数据：新建 `fudaba_card_pages` 单表，取代 `fudaba_cards` 的 5 个 key 列与 `fudaba_card_media`（归档表 `cards` 不动）。
- 缩略图：不在写路径生成；读取路由按 `?w=` 用 sharp 生成并按版本缓存（webp）。
- 取图：公开图也走 API 路由（302），客户端不再拼 `?thumb=1`。
- 兼容：只兼容仍在上线的 `community/namecards/assets/<stem>/image.webp`；其余布局由迁移改写，不做长期兼容。

## 1. 目标结构

### 1.1 对象 key

```
community/fudaba/cards/<cardId>/live/page-<uuid>.<version>.webp           线上页面
community/fudaba/cards/<cardId>/pending/page-<uuid>.<version>.webp        待审页面
community/fudaba/cards/<cardId>/<queue>/cache/page-<uuid>.<version>.<w>.webp   按需生成
```

对象一律先以私有作用域写入；只有 `publishCardPage` 会把要上线的那一页转公开。缓存对象跟随源对象的作用域。

### 1.2 表

```sql
CREATE TABLE fudaba_card_pages (
  card_id        text        NOT NULL REFERENCES fudaba_cards(id) ON DELETE CASCADE,
  queue          text        NOT NULL CHECK (queue IN ('live','pending')),
  page_id        text        NOT NULL,
  display_order  integer     NOT NULL,
  object_version uuid        NOT NULL,
  width          integer     NOT NULL,
  height         integer     NOT NULL,
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL,
  PRIMARY KEY (card_id, queue, page_id),
  UNIQUE (card_id, queue, display_order)
);
```

`page_id` 是页面身份（`page-<uuid>`），不编码角色：正面 = 顺序 1，背面 = 最后一项，其余为中间页。契约里的 `pages[].role` 由服务端按顺序推导，重排不改 key。

### 1.3 统一接口

- 写入：`storeCardPage({ cardId, queue, pageId, body, width, height, accountId })`
  → 写对象、返回 `{ pageId, version, key, width, height }`；不写缩略图，不发布。
  `publishCardPage` 单独负责把要上线的那一页转公开。
- 读取视图：`cardArtworkView({ scope, cardNumber, cardId, live, pending })`
  → `{ live: Page[], pending: Page[] | null }`，
  `Page = { pageId, role, order, url, width, height }`；`role` 由顺序推导（首=front、末=back）。
- 路由（现有路径保持，参数扩展）：
  - 公开（名片墙）：`GET /api/cards/:id/media/:side?w=`（`side` 兼容 `front|back|middle-N`）
  - 公开（交换墙，按卡片 UUID）：`GET /api/community/exchange/cards/:cardId/media/:pageId?w=`（新增，页面行缺失时 404）
  - 属主：`GET /api/community/exchange/me/cards/:cardId/media/:side?w=`（Bearer）
  - 后台：`GET /api/admin/cards/:id/media/:live|draft/:side?w=`（Cookie）
  - 审核：`GET /api/admin/community/exchange/card-reviews/:cardId/media/:side?w=`，取消视觉改版前先与后台路由共用实现。
- 尺寸：`w ∈ {160, 400, 800, 1400}`（渲染宽度 × DPR），默认 800；命中缓存直接返回，未命中 sharp 生成并写回同作用域缓存。版本化 key 的响应带 `immutable`；旧 key 只缓存 5 分钟。
- 前端：一个 `CardImage` 组件（传 `src`，自动识别属主 Bearer blob；公开/后台/审核 URL 直接渲染），其余 5 个 `<img>` 实现全部改为调用它。

## 2. 阶段与任务（与实际执行同步）

### P0 基础设施（已完成）

| 任务 | 实际落点 |
| --- | --- |
| 迁移 DDL | `apps/api/migrations/postgresql/20261107180000_fudaba_card_pages.sql`；表**不含 sha256**（存储层已记录），保留宽高 |
| key 规则 | `business-object-keys.ts`：`cardPageObjectKey`、`cardPageCacheObjectKey`、`parseCardPageObjectKey`、`isCardPageObjectKey`；`CARD_PAGE_WIDTHS = [160,400,800,1400]` |
| 写入封装 | `cards/artwork-store.ts`：`storeCardPage`（私有落盘、不产缩略图）、`publishCardPage`、`readSizedCardPage`（sharp + 同作用域缓存） |
| 视图 | `cards/artwork-view.ts`：输出 `pages[]`，`role` 由 `display_order` 推导（首 front、末 back） |
| 仓储 | `listCardPages`、`findPublishedCardPageKey`、私有 `writeCardPages` / `syncCardPages`（替换与后台更新共用） |
| 媒体路由 | 不新增路径：扩展现有 `GET /api/cards/:id/media/:side`，`side` 兼容旧值并支持 `page-<uuid>`；新增 `?w=`，旧 key 回退 5 分钟缓存 |

验收已达成：`?w=160/400/800/1400` 返回 200 `image/webp`，越界宽度 400，旧 key 的请求仍走原 307。

**P0 验收标准**

- 迁移在全新库与已有库各跑一次，`fudaba_card_pages` 结构与约束正确，重复执行无副作用。
- 手工插入一条页面行后，`?w=160/400/800/1400` 返回 200 `image/webp` 且宽度正确；`w=600` 返回 400。
- 私有页面（`pending`）的缓存对象同样是私有作用域；未登录访问属主/后台路由被拒。
- 现有读取路径不受影响：旧 key 的 307 行为、列表与详情不变。

### P1 写入切换（已完成）

| 写入点 | 状态 | 实际实现 |
| --- | --- | --- |
| 新建 | 完成 | 每页 `page-<uuid>`，`live` 队列；页面行与卡片行同一事务（`createCardForOwner.pages`） |
| 保存整套（上传） | 完成 | 已发布 → `pending`，否则 `live`；`replaceCardMediaForOwner.pages` + `syncCardPages` |
| 旋转（属主保存） | 完成 | `rotateSlot` 读旧对象 → 旋转 → `storeCardPage`；旧布局槽位首次旋转即迁移到稳定槽位 |
| 后台旋转 | 完成 | `updateCardAsAdmin.pages` + `syncAdminCardPages`，队列由 `review_status` 决定 |
| 认领复制 | 完成 | 通过 `storeCardPage` 写统一页面对象与 `fudaba_card_pages`，不再写 canonical 旧布局；审批时同步完整 live 页集 |
| 认领/补充旋转 | 完成 | `rotateReviewedArtwork` 改用 `storeCardPage`（`live` 队列）；`ClaimedCardMediaInput.pages` 让两个完成事务顺手同步页面行 |
| 单面上传 | 保留到 P4 | 前端无调用者，但现有测试覆盖它的媒体权限重置与对账，删除与测试一起做 |

页面行同步规则（替换、旋转、后台更新共用）：

- 新页插入带版本与尺寸；已知页仅更新 `display_order`；
- 最终页集**全部**可解析成新布局才删除页集外的行，混有旧 key 时跳过，等 P3 补齐；
- 旧对象仍只在「新对象已发布」后删除。

**P1 验收标准**

- 新建：每页生成 `page-<uuid>.<version>`，页面行顺序/dim 与上传一致；不产生缩略图。
- 保存整套：
  - 换图：新页插入、`display_order` 正确、旧页行被移除（仅当全套可解析）；
  - **调换顺序**：只改 `display_order`，对象 key 与版本不变；
  - **加页**：新行插入到目标位置，已有页顺序顺延；
  - **删页**：对应行删除，其余页顺序重排，对象不被新逻辑引用；
  - 已发布卡：全部落 `pending`，线上列与线上行不动；未发布卡落 `live`。
- 旋转：正面/背面/中间页各转 90°/270°，页面行版本更新、宽高交换、`revision` 只 +1、不进复审；`live` 旋转发布成功后才删旧对象。
- 认领/补充审核带旋转：批准后正反面行同步、对象发布；驳回不动行。
- 失败路径：对象写入失败或事务回滚后，页面行与列指向的版本一致，孤儿对象可被 GC 识别。

### P2 读取切换（已完成）

| 任务 | 说明 |
| --- | --- |
| 契约 `cardPageSchema` + `pages[]` | 六个接口同时输出 `pages[]`（`pageId/role/order/url/width/height`），旧字段保留一个版本 |
| 六个列表 | 墙、主页、管理页、投稿审核、认领审核、反馈审核/信息补充 |
| 已完成 | 交换墙、收藏列表返回 `pages[]`（`thumbUrl` 400 / `url` 800），`listCardPagesBatch` 批量取行；新增 UUID 媒体路由 |
| 已完成 | 名片墙 `/api/cards` 与用户主页 `/api/users/:handle/cards`：`pages[]` + `listCardPagesBatchByNumbers`，URL 走 `/api/cards/<编号>/media/page-<uuid>?w=`；媒体参数校验放行 `page-<uuid>` |
| 已完成 | 属主列表 `/api/community/exchange/me/cards`：`pages[]` 用 owner 作用域 URL；属主媒体路由支持 `page-<uuid>`（`draft=1` 取待审），匿名请求 401 |
| 已完成 | 页面视图拆成三档：`url`（原图，全屏用）、`previewUrl`（800，画廊）、`thumbUrl`（400，瓦片）；前端 `namecardPages`、`publicMediaSlotsFromCard` 与墙瓦片优先消费 `pages`，旧字段仅回退 |
| 迁移期规则 | 页面行只覆盖部分面（例如正面已迁移、背面仍是旧 key）时，前端**整套回退**旧字段，避免丢掉未迁移的那一面；只有页面数与旧集合一致才按 `pages` 渲染 |
| 已完成 | 后台投稿/管理列表（`/api/admin/cards`）：`pages[]` 使用 admin 作用域（`…/media/live|draft/<page>?w=`），有 `review_status=pending` 时给待审页面；后台媒体路由与仓储 `cardMediaKey` 支持 `page-<uuid>` 与 `?w`；后台列表瓦片优先用 `pages[].thumbUrl` |
| 已完成 | 审核 diff（`/api/admin/cards/:id/diff`）与反馈队列返回 `pages[]`；`slotsFromSide` 优先用页面（`previewUrl`，`index=order-1` 保持 `media_order` 语义） |
| 已完成 | 管理窗 `slotsFromSide` 与前端其它预览一样在页面不齐时整套回退，避免 #801 这类「只迁移了正面」的卡丢背面；属主卡新增可选 `pendingPages`（URL 带 `draft=1`） |
| 已完成 | 认领/补充队列行与列表瓦片带 `pages`（admin 作用域），瓦片优先 `thumbUrl`；队列按卡号逐条取页面行（量大时改批量） |
| 已完成 | 删除 `withThumbnail` 与 `?thumb=1`（P4）；剩余 V11 六列表截图与顺序/加页/删页抽检 |
| 已完成 | 删除 key 反推：`namecardMediaUrl`、`adminMediaUrl`、`legacyMediaUrl`、`resolveNamecardThumbnailUrl` 的布局分支 |
| 已完成 | 缩略图拼接层整体删除；媒体小图统一 `?w=160|400|800|1400` |
| `CardImage` | **完成**。`apps/web/app/components/shared/card-image.tsx` 统一 5 个 `<img>` 实现（`NamecardPreview`、`SlotImage`、`OwnerCardImage`、`NamecardMediaPreview`、`DiffArtwork`）；属主 URL 自动走 `useOwnerCardMedia` blob，其余直接渲染。 |
| 去重页面同步 | **完成**。`fudaba-repository` 与 `core-repository` 已统一调用 `namecard-page-sync.ts` 的 `syncNamecardPages`；排序偏移、页集删除、写入与旧行续排共用一份实现。 |

**P2 验收标准**

- 六个列表逐个切换后：卡片数量、顺序、正反面角色与切换前一致；**调换顺序、加页、删页**后列表与详情立即反映，且与编辑器内预览一致。
- 私有资源：未登录看不到 `pending` 图；属主与后台各自可见；公开路由只服务已发布卡。
- 详情/全屏预览仍用原图；列表与缩略图条使用 `?w`，无 `withThumbnail` 遗留。
- 删除 `withThumbnail` 与 key 反推后全站无 404/花图；旧字段仍能返回一个版本（兼容期）。

### P3 数据迁移（已完成）

脚本 `ops:namecards:migrate-pages`：

1. 逐卡读旧列与 `fudaba_card_media`，得到 live/pending 两套页序；
2. 统一复制对象到新布局（**不再编码缩略图**），用 sharp 读宽高，插入页面行；
3. 已有页面行且对象存在则跳过（幂等），支持 `--card`、`--dry-run`、断点续跑；
4. 不删除旧对象；单卡失败即停并输出可重跑报告。

**P3 进度**

- `ops:namecards:migrate-pages` 已实现：逐卡迁移 live/pending 两套页面，复制旧对象到新布局、用 sharp 取宽高、写页面行；同时回填 `front/back/pending_*` 列作为兼容缓存，不再写 `fudaba_card_media`（该表仅被脚本只读解析）；
- 开发库做过一次全量验证（示例：22 张卡、复制 37 个对象；实际数量随库内数据）；二次 dry-run 复制 0（幂等）；`/api/cards` 与 `/api/users/:handle/cards` 每卡 `pages` 数与旧集合一致；
- 抽查卡复核：两页（front/back）时列与行指向同一 key，`?w=400` 返回 200；迁移后再旋转一次，仅对应页行换版本，另一页不动，墙仍返回两页；
- 属主详情 `/me/cards/:id` 也返回 `pages`/`pendingPages`。

**P3 验收标准**

- 迁移前后逐卡比对：页面数量、顺序、角色、宽高、可访问性一致（含只有一面、0 中间页、多中间页、有待审版本四类）。
- 幂等：重复执行不新增行、不改版本；`--card` 单卡重跑结果一致。
- 迁移不删除任何旧对象；对缺对象/尺寸异常的卡片输出报告并停止，可修复后续跑。
- 迁移后，即便旧列被忽略，六个列表也完全可用（以页面行为唯一来源）。
- 专门覆盖：迁移期间发生**调换顺序 / 加页 / 删页 / 旋转**的卡片，迁移脚本以页面行为准，不覆盖新改动。

### P3 路径决策

P3 只决策对外路径，不执行退役。结论：

| 项 | 决策 |
| --- | --- |
| 公开读取 | 保留 `cards` 与 `exchange` 两个活跃路径；不合并成单一路径 |
| exchange 媒体 | 保留 `/api/community/exchange/cards/:cardId/media/:side`；交换墙/收藏仍按 UUID |
| owner 媒体 | 保留 `/api/community/exchange/me/cards/:cardId/media/:side`；不改卡号 |
| admin 媒体 | 保留 `/api/admin/cards/:cardNumber/media/:variant/:side` |
| review 媒体 alias | 不删除；按 P4 剩余任务先迁移 `fudabaRegisteredCardReviewView` 输出，再退役 |
| `publicRoute` | 继续强制显式；URL ↔ 路由对账在 P4 完成 |

本轮不新增媒体路由，不改 owner/公开路径，也不删除兼容路径。P3 完成后进入 P4 退役准备。

### P4 退役（代码层完成，物理删除待观察一版）

已完成：

- 删 `?thumb=1`（`fudabaMediaQuerySchema` 不再接受）、`preferThumbnail`、
  `ensureNamecardThumbnails`、`storeArtworkThumbnail`、`fudabaCardMediaThumbnailKey`；
  上传与审核不再生成 `.thumbnail.jpg`，前端 `withThumbnail` 一并删除。
- 删 `PUT /uploads/:side`、`updateCardMediaForOwner`、旧上传 handler、
  `namecard-thumbnail-backfill` 与 `ops:namecards:thumbnails` 脚本及其测试。
- 删 `resolveNamecardThumbnailUrl`；旧名片交付的 `image*_thumbnail_url`
  直接等于解析后的原图地址。
- 中间页只读 `fudaba_card_pages`（`listCardMiddleMediaFrom`、`listMiddleKeys`、
  列表中间页数量都按 live 页行推导）；仓储不再写 `fudaba_card_media`。
- 删除被旧名片媒体路由遮蔽的重复公开页面路由（`directory/serve-public-card-page.ts`）。
- 旧名片媒体解析（`cardMediaKey`）优先读页面行，页面缺失才回退列。
- 已发布卡的修订通过时，`publishStagedRevision` 会把 pending 页整组提升为 live（含复审回归用例）；
  驳回/锁定只改审核状态，待审页清理由验收用例 C19/C21 跟踪。
- 旧名片交付的 `image*_url` / `middle_image_urls` / 认领审核预览改为直接输出媒体路由地址，
  不再反推对象 key。
- P4 第一刀：
  - review 媒体 alias `/card-reviews/:cardId/media/:side` 已从路由删除；
  - `fudabaRegisteredCardReviewView` 改为输出 `/api/admin/cards/:cardNumber/media/live/...`；
  - `legacyMediaUrl` helper 已删除；
  - 新增并执行 `20261112120000_namecard_media_retire.sql`，`fudaba_card_media` 已 DROP；
  - 最终 migration dry-run `copied=0`（报告见 `data/verification` 下的 P4 dry-run 记录）；
  - public 媒体 resolver 已移除 `findPublishedCardMediaKey` 回退，公开图只用页面行；
  - `approve-namecard` 删除旧布局拷贝/重写，只接受 `community/fudaba/cards/...` 页面键；
  - admin `cardMediaKey` 删除旧列回退，正/反/中间页只查 `fudaba_card_pages`；
  - `fudaba_card_pages` 增加 `object_queue`；属主暂存写完整 pending 页集，未变化页指向 live、变化页指向 pending；owner resolver 页面行 only；
  - 剩余：`fudaba_cards` 旧 key 列、旧 URL 字段/生成器的最终清理。

观察一版后执行（需先确认迁移报告 0 缺失、媒体无异常 404）：

- DROP `fudaba_card_media`，删除 `fudaba_cards` 的四个 key 列与仓储/迁移脚本中的列回退。
- 删除兼容读取 `community/namecards/assets/<stem>/image.webp`（`approve-namecard` 的拷贝重写、
  `ttl-purge` 的 key 反推需要一并改为页面行）。

#### P4 剩余任务：兼容 API/URL 退役

这部分属于 P4 的“代码/兼容面退役”，不属于 P5；P5 只做对象 GC。

| 任务 | 具体落点 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| review 媒体 alias 退役 | 先保留 `/api/admin/community/exchange/card-reviews/:cardId/media/:side` 作为 Moderator handler 的薄 alias；确认 `fudabaRegisteredCardReviewView` 不再把 `frontImageUrl/backImageUrl` 覆盖成该路径、前端全部消费 `pages[]` 后删除路由 | 路由清单、契约测试、L4/L5/L6/L7 队列与弹窗无 404 | **done**：响应改 admin 媒体路径，GET/HEAD alias 已删；L4–L7 回归待随下一刀执行 |
| 旧媒体 URL 生成器退役 | 删除 `legacyMediaUrl`、仅用于旧正/反/中间字段的 `adminNamecardMediaPath` 拼接；有页面行时统一走 `cardArtworkView` | 无页面行回退是唯一使用场景，测试覆盖旧卡回退 | **done**：`legacyMediaUrl` 与旧侧路由构造器 `namecardMediaPath`/`adminNamecardMediaPath` 已删，全仓无生产引用；有页面行时统一走 `cardArtworkView`，保留 `cardPageMediaPath`/`adminCardPageMediaPath` 等真实页面媒体路由构造器 |
| 旧 key helper 清理 | 删除 `namecardClaimMediaObjectKey`、旧布局 key 反推和对应测试 | 全仓无生产引用；仅剩迁移历史测试的显式断言 | **done**：`namecardCardMediaObjectKey`、`namecardClaimMediaObjectKey`、`namecardOriginalUrlFromObjectKey` 及测试已删除，无生产引用 |
| 完整 pending 页集 / object_queue | 属主暂存写完整 pending 页行；每行记录 `object_queue`（未变化页指向 live，变化页指向 pending）；owner 媒体按页集解析 | pending 预览不依赖旧列；审批提升后 object_queue=live | **done**：`object_queue` migration 已加；`syncNamecardPages` 写完整 pending 快照；owner resolver 页面行 only；审批提升写入 live object_queue |
| 旧列/旧表读取退役 | `findPublishedCardMediaKey`、`findCardMediaKey`、owner/review 的旧列分支、`fudaba_card_media` 解析全部移除；删除 `fudaba_cards` 的五个 key 列及仓储/迁移脚本列回退 | 页面行是唯一读源；历史卡无 404/花图 | **done**：生产代码已无旧列引用；drop-column migration 已执行，五个列已从本地 DB 删除；API/web typecheck + namecard/handler/fudaba/migration tests pass。仅 `scripts/migration/fudaba-metadata.js` 作为历史迁移存档保留旧 schema 文本，不再可执行 |
| 旧 URL 字段兼容退役 | `image*_url` / `middle_image_urls` / `image*_thumbnail_url` 不再作为主图来源；只保留契约兼容值 | 六个列表、L1–L7 全部优先 `pages[]` | **done**：contracts/API/web 已无 `image1_url`/`image2_url`/`middleImageUrls`/`middle_image_urls`/`image*_thumbnail_url` 生产引用（仅历史文档与生成清单保留旧文本）；六个列表、L1–L7 统一消费 `pages[]`，typecheck 通过 |
| 旧布局对象 key 兼容读取退役 | 删除 `community/namecards/assets/<stem>/image.webp` 兼容读取；`approve-namecard` 的拷贝重写、`ttl-purge` 的 key 反推改为页面行 | 全仓无该旧布局 key 的生产读取；审批/清理仍覆盖历史对象 | **done**：生产旧 upload key/thumbnail helpers 与 delivery routes 已删；node-security fixture 已改为页面行，旧 URL 仅保留 404 断言 |
| URL ↔ 路由对账 | 为每个 `(audience, route)` 组合生成路径，断言路由清单中存在；`cardArtworkView` 的 `publicRoute` 显式必填 | 契约测试覆盖 public/owner/admin/review 和 exchange alias | **done**：route inventory 已更新并通过 19 项 compiler test；publicRoute 仍显式必填 |
| 旧 Fudaba 迁移脚本族退役 | `scripts/migration/fudaba-command|extract|import|media|metadata|media-sync|reconcile.js`；同步删 `syntax` / `migration:fudaba` 入口 | 不再可执行；历史说明归档到文档而非运行入口 | **done**：`migration:fudaba*` 入口已删；脚本仅作历史归档，无 package 入口 |
| 旧页面迁移 CLI 退役 | `scripts/operations/namecards/migrate-card-pages.ts`、`scripts/migration/namecard-card-pages.js` 及 package entry | 五列已 drop 后不再需要回填工具；保留只读审计或删除 | **done**：文件、package entries 和 deploy 自动执行步骤均已删除 |
| node-security 历史上传夹具收窄 | `tests/node-security/fixture.js` 的旧 upload URL 常量/文件生成；保留纯页面路由 404 断言 | 测试只覆盖当前页面路由权限，不再构造旧 upload | **done**：旧 upload 文件目录/写入与 path helpers 已删；旧 URL 常量只用于“已退役路由 404”断言 |
| 旧 thumb/契约残留 | `?thumb=1` / `preferThumbnail` / `.thumbnail.jpg` 文档与测试；旧 image URL 断言 | 全仓无旧 thumb 生成/消费；测试不保留旧字段快照 | **done**：production 无旧 thumb 生成；剩余 `thumbnail.jpg` 仅 P5 GC 模式和历史迁移测试使用 |
| 验收覆盖记录 | 受影响观测面写完 `covered-by <surface>`；旧路径删除后重新跑受影响 required entries | acceptance 记录不依赖已删除 URL | **plan ready**：P4 最小回归方案已写入文档；六条 UI 链与自动门禁待执行 |

执行顺序：

1. 先完成 P4 观察期与 C1–C22/L1–L7 验证；
2. 迁移报告 0 缺失后删除旧列/旧表读取；
3. 旧表/旧列删除后再删除 review alias 与旧 URL 生成器；
4. 最后跑 URL/路由对账、全量 API/Web/浏览器测试和预览 SHA 核对。

#### P4 最小回归测试方案

P4 不重跑 T1–T10 全量。按改动面拆成自动门禁、六条 UI 链和 P5 dry-run。

**L7 / L8 是独立观测面，不互相覆盖：**

- L7：`/admin/cards/manage` 默认反馈队列 + 反馈管理窗；只验证反馈绑定、单页无幽灵背面。
- L8：`/admin/cards/manage?tab=advanced` 信息修改 tab + `NamecardManageDialog`；验证完整字段、媒体、状态与版本状态。

| 链 | 夹具 | 操作 | 必看入口 | 覆盖 |
| --- | --- | --- | --- | --- |
| R1 媒体生命周期 | #823 已发布 | 属主替换正面、新增中间页、旋转中间页 → pending | L1 编辑画廊、L4 diff、L1/L2/L3 | T2、T3、C5–C7 |
| R2 L8 信息修改 | #823 | `?tab=advanced` 打开，旋转/删除页并保存 | L8-tile、L8-dialog、L4、L1/L2/L3 | T9、L8 独立面 |
| R3 L7 反馈 | 新建单页卡 + fresh feedback | 提交反馈 → L7 队列打开反馈窗 → 保存/结掉 | L7-tile、L7 管理窗、L2 | T7、C13、L7 绑定 |
| R4 T4 可见性与删除 | #821 已发布 | visible false/true；属主删除；后台恢复 | L1、L2、L3、L4 | T4、C9/C10 |
| R5 T10 生命周期 | #823 | 文本 pending 通过；图片 pending 驳回/锁定；恢复 live 集合撤回；重提通过 | L1、L4、L2/L3、L8 | T10、C17–C22、完整 pending/object_queue |
| R6 L5/L6 单页 | 单页老卡 + 单页补充卡 | L2 认领/补充提交 → L5/L6 审核通过 | L5、L6、L2 | T5、T6、无幽灵背面 |

当前夹具状态：

- #823：published，3 个 live 页面，无 pending，可用于 R1/R2/R5。
- #821：published、visible，2 个 live 页面，无 pending；可用于 R4，但不满足 R3 的单页要求。
- L7 反馈 #17 已 accepted，队列为空；R3 需新建单页卡并提交 fresh feedback。
- R6 需要另备单页老卡与单页补充卡。

自动门禁：

```text
contracts build
API typecheck
Web typecheck
check:rules
route inventory

API: namecard.test.ts, fudaba.test.ts, handler.test.ts,
     namecard-public-routes.test.ts, postgres-migrations.test.js,
     namecard-media-gc.test.ts
Web: media-urls, namecard-pages, namecard-preview, claim-review-tab,
     namecard-manage-dialog, namecard-review-dialog, admin-cards-manage-page,
     namecard-feedback-queue, community-cards-page, account-me-workspace
```

每条 UI 链的判定：

- 图片必须 `<img complete=true>` 且 `naturalWidth>0`；不能只看接口 200/src。
- L2/L3 检查页数、顺序、front/back 角色；L3 图片可由 L2 覆盖。
- L4 tile/review、L7 tile/window、L8 tile/dialog 分别记录。
- pending 版本：draft 页集完整，未变化页 `object_queue='live'`，变化页 `object_queue='pending'`。
- 删除/驳回/锁定后，L2/L3 不出现待审图，L4 不再有待审入口。
- 文本修订通过时，页面行数和 object_version 不变。

P5 dry-run（Postgres 可用后）：

```bash
pnpm --filter @imsweb/api ops:namecards:media-gc -- --dry-run --older-than=7d --json
```

检查引用 key 不进入 deletion、`approving` 卡片 skipped、只列旧布局/旧 thumb/孤儿缓存；报告留存后才考虑 `--apply`。

#### P4 启动状态

- P3 路径决策已完成：保留 public `cards`/`exchange`、owner UUID、admin 卡号；review alias 留到 P4。
- 人工验收 T1–T10 已完成并记录在验收任务的 `execution.md`。
- P4 开始前必须保留可回滚版本，并确认迁移报告 0 缺失、媒体无异常 404。
- **迁移基线已确认**：P3 迁移完成时为 `copied=0`；后续 dry-run 的 `copied=2` 是 T9/T10
  前端删除页面留下的 `fudaba_card_media` 残留，不是迁移漏项。
- **P4 第一刀已完成**：`fudaba_card_media` 已 DROP；删除表后最终 dry-run 为 `copied=0`
  review 媒体 alias 和
  `legacyMediaUrl` 已删除，review 视图改用 `/api/admin/cards/:cardNumber/media/live/...`。
- 剩余退役：`fudaba_cards` 旧 key 列、旧列读取回退、旧 URL 字段/生成器的最终清理。
- 退役回归按受影响入口执行，不重跑无变化链路：
  - 删除旧列/旧表读取：L1/L2/L3/L4/L5/L6/L7 的媒体读取与历史卡访问；
  - 删除 review alias：L4/L5/L6/L7 队列与弹窗；
  - 删除旧 URL 生成器：六个列表、L1–L7 的 `pages[]` 优先与旧卡回退；
  - URL ↔ 路由对账：所有 public/owner/admin/review、exchange/cards 组合。
- 每一步删除后在同一阶段完成对应回归；不得以 API 200、对象存在或源码无引用代替 UI 检查。

**P4 验收标准**

- 删除旧列与 `fudaba_card_media` 后，新建、保存、旋转、审核、认领、补充全部通过既有测试。
- 删除 `PUT /uploads/:side` 与 `updateCardMediaForOwner` 及其测试，无残留引用。
- 兼容读取移除后，历史卡片仍可访问（对象已迁移）；迁移未覆盖的卡片会被脚本报告而不是静默 404。

### P5 清理（GC 脚本已实现，待 dry-run/接入部署）

目标：迁移完成、观察一个版本后，随时可以把旧布局、旧缩略图、无引用的缓存和孤儿对象清干净。清理脚本按「引用集 + 年龄」工作，不依赖执行时间点，可重复运行。

**待清理内容清单**

| 类别 | 前缀 / 形态 | 判定 |
| --- | --- | --- |
| 旧卡片根目录布局 | `community/fudaba/cards/<id>/{front,back,middle-*}.webp` | 不在 `fudaba_card_pages` 引用集 |
| 旧版本目录布局 | `community/fudaba/cards/<id>/versions/<uuid>/{media,front,back,middle-*}.webp` | 同上 |
| 兼容资产布局 | `community/namecards/assets/<stem>/image.*` | 同上，且迁移已把对象搬到新布局 |
| 旧上传路径 | `uploads/namecard/original/*` | 同上（迁移完成后的残留） |
| 写时缩略图 | 任意目录的 `thumbnail.jpg`、`<stem>.thumbnail.jpg`、`uploads/namecard/thumbnail/*.jpg` | 新流程不再写入；不在引用集即删 |
| 孤儿缓存 | `cards/<id>/<queue>/cache/<page>.<version>.<w>.webp` | 版本已不在页面行 |
| 无人待审的 pending 目录 | `cards/<id>/pending/**` | 该卡没有 `queue='pending'` 的行 |
| 无 live 行的卡片目录 | `cards/<id>/live/**` | 该卡没有 `queue='live'` 的行（软删/清退） |

**脚本**：`ops:namecards:media-gc`

- 参数：`--dry-run`（默认输出清单）、`--older-than=7d`（默认 7 天，覆盖在途请求）、`--card=<number>`、`--prefix=`、`--limit=`、`--json`；
- 引用集：`fudaba_card_pages` 全部 `(card_id, queue, page_id, object_version)` 计算出的 key + 缓存 key；
- 安全规则：引用集内绝不删除；`publication_status='approving'` 的卡片整卡跳过；删除走既有的 `deleteObjectWithCompensation`（失败进补偿队列）；
- 幂等、可断点续跑，输出 `{scanned, kept, deleted, failed, skipped}`。

**执行顺序**：P3 迁移、T1–T10 验收与观察一版均已完成；`ops:namecards:media-gc` 已实现并通过 21 项单元测试，先 `--dry-run --json` 人工过清单，再实际删除。

**P5 当前状态**：

- 观察期：按 P4 启动条件视为已满足；
- `ops:namecards:media-gc`：**已实现**（`src/operations/namecard-media-gc.ts` + CLI + 21 tests）；
- 部署：**不会**自动执行 P5；GC 需要独立 job 或手动运行。

**P5 验收标准**

- `--dry-run` 输出的清单不含任何 `fudaba_card_pages` 引用中的 key（含缓存 key 与在途版本）。
- 实际清理后：墙、主页、管理页、六个 dialog 的图片全部可加载；抽检 10 张调换过顺序、加过页、删过页的卡片，角色与顺序仍正确。
- 重复运行结果稳定（第二次 `deleted=0`）；`approving` 状态的卡片未被触碰。

## 3. 验证矩阵与执行计划

矩阵每行都绑定「哪个阶段、用什么手段、当前状态」，避免写完不看。

| # | 场景 | 验证点 | 阶段 | 手段 | 状态 |
| --- | --- | --- | --- | --- | --- |
| V1 | 新建：单面 / 双面 / 带中间页 | 页面行数量与顺序、key 布局、无缩略图 | P1 | `fudaba.test.ts` 创建用例 + 实机建卡查库 | 已通过 |
| V2 | **调换顺序** | 仅改 `display_order`，页面版本与 key 不变；列表角色正确 | P1/P2 | PG 用例 `keeps page rows stable across reorder, add and delete` | 已通过 |
| V3 | **加页** | 新行插入目标位置，已有页顺序顺延，旧页版本不变 | P1/P2 | 同上用例的 add 段 | 已通过 |
| V4 | **删页** | 对应行删除，其余重排；对象不再被引用 | P1/P2 | 同上用例的 delete 段 | 已通过 |
| V5 | 旋转（正/背/中间页） | `revision` 只 +1、不进复审、行版本与尺寸更新、live 发布后删旧对象 | P1 | 既有旋转用例 + 实机 `rev 45→46→47` | 已通过 |
| V6 | 有待审时保存 | live 列/行不变，pending 行更新 | P1 | `fudaba.test.ts` 暂存用例 | 已通过 |
| V7 | 审核通过 / 驳回 | pending 行提升或丢弃，对象发布或不发布 | P1 | `fudaba.test.ts` 审核用例 | 已通过 |
| V8 | 认领复制 / 补充旋转 | 新行生成、旧布局不再被读取 | P1 | `fudaba.test.ts` 认领/补充用例 | 已通过（认领无旋转/部分复制测试） |
| V9 | 私有访问 | 未登录不可读 owner/admin；公开只服务已发布 | P0/P2 | 路由测试 + curl 401/404 | 部分（公开 `?w` 已验，属主/后台待接线后验） |
| V10 | 缩略图/尺寸 | 四档 200、越界 400、命中缓存、私有缓存不公开 | P0 | 实机 curl + 缓存对象检查 | 部分（四档与越界已验；缓存需新布局数据） |
| V11 | 六个列表一致性 | 数量、顺序、角色与切换前一致；详情原图 | P2 | 逐列表截图对比 + 抽检三张做过 V2/V3/V4 的卡 | 待 P2 |
| V12 | 迁移等价性 | 迁移前后逐卡比对；迁移期间改动不被覆盖 | P3 | `migrate-pages --dry-run` 报告 + 逐卡比对脚本 | 待 P3 |
| V13 | 清理安全性 | dry-run 不含引用 key；二次运行 `deleted=0`；`approving` 跳过 | P5 | `media-gc --dry-run --json` + 实跑 | 待 P5 |

执行顺序：V2–V4 在 P1 收尾时补成 PG 用例（顺序/加页/删页各一条），P2 每个列表切换后跑 V11 的截图对比，并在抽检卡上同时覆盖 V2–V4 的 UI 表现。

## 4. 回滚## 4. 回滚

- P1 阶段双写旧列：随时切回旧读取实现（保留一个开关常量），新表不影响旧逻辑；
- P2 阶段每切换一个列表即独立提交，可单独回退；
- P3 迁移只新增对象与行，不删旧数据，回滚只需切回旧读取；
- P3 的页面回填 CLI（`scripts/migration/namecard-card-pages.js` 与
  `src/operations/namecard-pages-migration.ts`）已退役，部署脚本不再执行它；
- P5 清理只在 P3 完成且观察期结束后执行。

## 5. 风险

| 风险 | 对策 |
| --- | --- |
| sharp 生成的 CPU 峰值 | 与上传转码共享并发上限；只允许三档宽度；缓存对象常驻 |
| 迁移期间双写不一致 | 新表为唯一读取源之前，以旧列为准；提供逐卡比对脚本 |
| 审核中的 pending 被并发覆盖 | 版本 token 保证已发出 URL 不变；通过 revision 拦截 |
| 大对象迁移带宽 | 逐卡限速、断点续跑、`--dry-run` 先估算总量 |

## 6. 进度

| 项 | 状态 |
| --- | --- |
| `fudaba_card_pages` 迁移（`20261107180000`） | 完成，迁移测试与 PG 套件通过 |
| key builder `cardPageObjectKey` / `cardPageCacheObjectKey` | 完成 |
| `ImageProcessor.resizeWebp` | 完成（sharp，等比、不放大） |
| `storeCardPage` / `publishCardPage` / `readSizedCardPage` | 完成 |
| 仓储 `listCardPages`、`findPublishedCardPageKey` | 完成 |
| 视图 `cardArtworkView` | 完成 |
| 公开媒体路由 `?w=160/400/800/1400`（未迁移的卡回退旧 key） | 完成，实测 200/`image/webp`，越界宽度 400 |
| 新建名片切换到 `storeCardPage` + 页面表（live 队列） | 完成：key 为 `.../live/front.<uuid>.webp`，行含尺寸与顺序，写路径不再产缩略图 |
| 保存整套（`replace-owned-media` 上传） | 完成：上传落 `pending`（已发布卡）或 `live`，页面行随保存同步；页集混有旧 key 时保守跳过删除 |
| 旋转分支（`rotateSlot`） | 完成：读旧对象 → 旋转 → `storeCardPage`（按保存面决定 `live`/`pending`）→ 同步页面行；旧布局槽位在第一次旋转时顺带转成新布局，身份取稳定槽位 |
| 后台旋转（`update-admin-namecard` + `updateCardAsAdmin`） | 完成：改用 `storeCardPage`，按 `review_status` 写 `pending`/`live`，页面行随整卡保存同步；旧对象仍是发布成功后才删 |
| 认领 / 补充的旋转写入 | 已完成：`rotateReviewedArtwork` 写页面对象并回传 `pages`；`completeCardClaimReview` / `completeCardSupplementReview` 收到 `pages` 后同步页面行 |
| 删除 `PUT /uploads/:side` 与 `updateCardMediaForOwner` | 已完成（P4） |
| 契约 `cardPageSchema` 与六个接口的 `pages[]` | 待做（P2） |
| 路由/URL 整合 P0：exchange UUID 媒体路由与 URL 对账 | 完成：新增 `/api/community/exchange/cards/:cardId/media/:side`，`cardArtworkView.publicRoute` 显式化 |
| 路由/URL 整合 P1：resolver / response / review handler | 完成：`card-media-resolver.ts`、`card-media-response.ts`，review 支持页面行与 `?w` |
| 路由/URL 整合 P2：L5/L6/L7 `pages[]` 优先 | 完成：L5/L6 队列保留页面视图；L7 反馈队列返回页面行，`NamecardMediaPreview` 优先消费 `pages` |
| 待审版本的媒体管理规则 | 完成：`review_status='pending'` 时管理端只允许改版本状态，整卡状态/资料/图片/归属由后端拒绝 |
| P1 写入切换、P2 读取切换、P3 迁移脚本、P4 代码层退役 | 已完成 |
| P4 物理删除（DROP 表/列、兼容读取）与 P5 清理 | 待观察一版后执行 |
