# 名片图片：写入、取用与数据结合的完整清单（调查 + 方案）

> 文档类型：架构调查
> 状态：Decision（已被 `namecard-media-execution.md` 取代，仅保留调查记录）
> 权威来源：`apps/api/src/utils/storage/business-object-keys.ts`、`apps/api/src/domains/community/fudaba/`、`apps/api/src/domains/community/namecards/`、`apps/api/src/domains/delivery/media/`、`apps/web/app/lib/api/media-urls.ts`、`apps/web/app/components/`

> **历史文档**：本文件记录统一布局实施前的现状与方案。文中 `?thumb=1`、`withThumbnail`、
> `ensureNamecardThumbnails`、`PUT /uploads/:side`、`fudaba_card_media` 等路径均已在 P4 删除或冻结，
> 现行约定以 `namecard-media-execution.md` 与 `namecard-surfaces.md` 为准。

调查范围：`fudaba_cards` 及其关联表的全部图片写入、全部读取入口、全部前端渲染点。命名空间里还有新闻、活动、地图等其它图片，本文件不涉及。

## 1. 对象布局家族（5 种，同一张卡会经历其中多种）

| # | 布局 | 示例 | 谁写入 |
| --- | --- | --- | --- |
| L1 | 旧上传路径 | `uploads/namecard/original/<file>` + `uploads/namecard/thumbnail/<file>.jpg` | 历史迁移、旧上传资产 |
| L2 | 兼容资产（canonical） | `community/namecards/assets/<stem>/image.webp` + 同目录 `thumbnail.jpg` | 游客投稿审核、认领复制 |
| L3 | 卡片根目录 | `community/fudaba/cards/<id>/front.webp`、`back.webp` | 属主新建名片 |
| L4 | 版本目录（整面） | `community/fudaba/cards/<id>/versions/<uuid>/media.webp` | 属主替换/旋转、认领与补充审核、后台旋转 |
| L5 | 版本目录（分面） | `community/fudaba/cards/<id>/versions/<uuid>/{front,back}.webp`、`middle-<n>.webp` | 属主单面上传（`PUT /uploads/:side`） |

缩略图命名：L1 专属目录、L2 同目录 `thumbnail.jpg`、L3/L4/L5 同目录 `<stem>.thumbnail.jpg`。L2 的 stem 目录一卡一面，天然唯一；L3 一目录两面，靠 stem 区分。

## 2. 写入路径（8 条业务 + 2 条缩略图 + 迁移）

| # | 触发 | 代码 | 布局 | 写入列 | 暂存语义 | 发布 |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | 属主新建名片 | `cards/handlers/create-card.ts` | L3（正面/背面）+ L5（中间页） | `front/back_object_key` + `fudaba_card_media` | 直接写 live（新卡本就待审） | 不发布，等审核 |
| W2 | 属主保存整套图片 | `cards/handlers/replace-owned-media.ts` | L4 | 已发布 → `pending_*`；否则 live；仅旋转 → 原地 | 已发布即暂存 | 仅「只旋转且无暂存图」时发布 |
| W3 | 属主单面上传 | `cards/handlers/upload-owned-media.ts`（`PUT /uploads/:side`） | 兼容来源 L2，交换来源 L5 | 已发布 → `pending_*` 且 `review_status='pending'`；否则 live 且卡片转 `pending` | 暂存（重置审核） | 不发布 |
| W4 | 属主旋转（随保存提交） | 同 W2 的 `rotationOnly` 分支 | L4 | 有暂存图 → `pending_*`；否则 live | 不产生新版本 | live 时发布 |
| W5 | 后台旋转（随整卡保存） | `namecards/moderation/handlers/update-admin-namecard.ts` | L4 | 按 `media_order` 落 live 或 `pending_*` | 取决于 `review_status` | 仅 live 且 `status=published`；发布成功才删旧对象 |
| W6 | 游客/注册整卡审核通过 | `namecards/moderation/handlers/approve-namecard.ts` | L3/L5 → **复制成 L2** | 用 `attachCanonicalMedia` 重写 `front/back_object_key` | 发布前复制 | `ensureNamecardThumbnails` + `publishNamecardMedia` |
| W7 | 认领通过（无主旧卡） | `fudaba/moderation/handlers/admin-card-reviews.ts` `copyLegacyMedia` | → L2（`namecardClaimMediaObjectKey`） | 通过 `completeCardClaimReview` 的 `media` 写正反面 | 一次性复制 | 复制后统一 publish |
| W8 | 认领/补充通过（带旋转） | 同文件 `rotateReviewedArtwork` | L4 | 正反面列（补充走 `completeCardSupplementReview` 的 `media`） | 直接改线上 | 批准前 publish |
| T1 | 任意名片图片写入后 | `cards/artwork-thumbnail.ts` | 同目录小图 | — | — | 不发布（跟随原图） |
| T2 | 游客审核 | `card-media-assets.ts` `ensureNamecardThumbnails` | L1/L2 小图 | — | — | 随 `publishNamecardMedia` |
| M | 历史迁移脚本 | `scripts/migration/fudaba-media*.js`、`semantic-object-keys.ts` | L1→L2/L3 | 重写列 | — | 视脚本 |

结论：**同一张卡的正反面，会随「新建 → 编辑 → 审核 → 再编辑」在 L3、L4、L5、L2 之间迁移**；每次迁移都会改变对外地址的推导方式。

## 3. 与名片数据的结合方式

- 正面/背面：`fudaba_cards.front_object_key` / `back_object_key`，暂存为 `pending_front_object_key` / `pending_back_object_key`。
- 中间页：`fudaba_card_media(card_id, display_order, object_key)`；暂存为 `pending_middle_object_keys`（数组列）。
- 可见性：`publication_status`（draft/pending/approving/published/hidden/locked/withdrawn）+ `review_status`（pending/rejected/locked/null）+ `visible`。
- 卡片编号：`card_number`；公开墙按编号或 id 取图。
- 审核队列：认领读 `fudaba_card_claims.legacy_card_id` 对应的行；投稿读同一张 `fudaba_cards` 行；补充读 `fudaba_card_supplements.card_id`。
- 旧的 `cards` 归档表只读，仅迁移脚本使用。

因此「取图」必须同时知道：卡片 id / 编号、面（front/back/middle-n）、live 还是 pending、公开还是私有。目前每条读取路径各自决定这四件事。

## 4. 读取方式

### 4.1 服务端路由（返回字节或 302）

| # | 路由 | 认证 | 取 key 的来源 | thumb | 失败行为 |
| --- | --- | --- | --- | --- | --- |
| R1 | `GET /api/cards/:id/media/:side` | 公开 | `findPublishedCardMediaKey`（只认 published） | `?thumb=1` → `preferThumbnail`，缺失回退原图 | 404 |
| R2 | `GET /api/admin/cards/:id/media/:live\|:draft/:side` | 后台 | `findCardMediaKey`（live/draft 两套列） | 同上 | 404 |
| R3 | `GET /api/admin/community/exchange/card-reviews/:cardId/media/:side` | 后台 | `findRegisteredCardForAdmin` 的正反面 | 同上 | 404 |
| R4 | `GET /api/community/exchange/me/cards/:cardId/media/:side` | 平台 Bearer | `findCardForOwner`（暂存优先） | 同上 | 404 |
| R5 | `GET /uploads/namecard/...`（delivery） | 公开/私有判定 | `findCardByMediaUrl` | `preferLegacyNamecardThumbnail` | 404 |

### 4.2 服务端「直接给 URL」的接口（不经过 R1–R5）

| # | 接口 | 生成方式 | 形态 |
| --- | --- | --- | --- |
| U1 | `/api/cards`、`/api/cards/:id` | `namecardMediaUrl`：L2 反推 `/uploads/...`，其余回退 `/api/cards/<n>/media/<side>` | 混合 |
| U2 | `/api/community/exchange/cards` | `fudabaPublicCardView` → `requirePublicObjectUrl` | 绝对公开地址，任一失败 503 |
| U3 | `/api/users/:handle/cards` | `resolvePublicMediaUrl` + `resolveNamecardThumbnailUrl` | 混合 + `image*_thumbnail_url` |
| U4 | 交换视图 `exchange/media.ts` | `resolvePublicMediaUrl` / `resolveNamecardThumbnailUrl` | 混合 |
| U5 | 后台认领队列 | `fudabaAdminCardClaimView` + `legacyMediaUrl` | L2 反推或兜底路径 |
| U6 | 后台投稿队列 | `fudabaRegisteredCardReviewView` → `adminNamecardMediaPath` | `admin` 路由 |

### 4.3 前端渲染点（统一 `CardImage`）

所有名片图片只通过 `CardImage` 渲染；它按 URL 自动选择取图方式：

| 调用方 | 传给 `CardImage` 的 URL | 实际行为 | 调用处 |
| --- | --- | --- | --- |
| `NamecardPreview` | 原图 `page.url`、缩略图 `page.thumb` | 公开 URL 直接 `<img>` | 名片墙瓦片、详情窗、用户主页、分享预览 |
| `CardMediaGallery` → `SlotImage` | `slot.url` | 属主私有 URL 走 `useOwnerCardMedia`（Bearer blob），其余直接 `<img>` | 属主编辑器、管理窗、审核窗（`CardMediaPreview`）、认领/补充窗、详情窗 |
| `OwnerCardImage` | 属主图片 URL | `useOwnerCardMedia`（Bearer blob） | 属主管理页多处小图 |
| `NamecardMediaPreview` | 后台 `live\|draft` URL | Cookie 后台 URL 直接 `<img>` | 后台投稿列表、认领列表、管理页 |
| `DiffArtwork` | 审核 `slot.url` | 后台 Cookie URL 直接 `<img>` | 审核 diff |

`CardImage` 不再拼 `?w=`，也不把 admin/review 当成不同渲染类型；尺寸档位由列表契约的
`url/previewUrl/thumbUrl` 预先决定。

## 5. 操作之间的覆盖关系（谁会改掉谁的路由）

| 操作 | 影响 | 后果 |
| --- | --- | --- |
| 新建 → 编辑/旋转 | L3 → L4 | `namecardMediaUrl` 从「反推 url」变成兜底路由；`NAMECARD_PUBLIC_ORIGIN` 需要同时认 L3/L4 |
| 编辑/旋转 → 整卡审核 | L4 → L2（复制） | 只有经过 `/admin/cards/approve/:id` 才会复制；走 `/card-reviews/:cardId` 不会 |
| 后台旋转 | 任意 → L4 | live 未发布时旧对象一旦删除即断图（已加保护） |
| 单面上传 | 兼容卡 → L2，交换卡 → L5 | 同一张卡的两面可能分属 L2 与 L5 |
| 认领通过 | 旧卡 → L2 | 认领前的前端地址（U5）改变 |
| 补充通过 | 正反面 → L4 | 中间页留在 `fudaba_card_media`，可能仍是 L3/L5 |

## 6. 已发生故障与对应规则

- 幽灵背面：U5 在 key 为空时仍拼兜底路径。
- 旋转后墙读不到：W5 改布局 + 未发布即删旧对象。
- 缩略图显示成背面：L3 同目录 `thumbnail.jpg` 覆盖。
- 主页 500：U3 的缩略图函数只认 L1/L2，L3/L4 抛错。
- 墙整页 503：U2 任一 key 不可公开即整表失败。

## 7. 布局定案讨论

### 7.1 `<cardId>/<queue>/<side>.webp` 够不够？

队列只有 live / pending 两套，这个判断是对的：名片在任意时刻最多只有「线上那一套」和「待审那一套」。但把面写死成固定 key 会丢三样东西：

1. **写入失败的原子性。** 存储层对同一个逻辑 key 会生成新对象、切换索引，失败时 `abortUpload` 只会把这次上传记为 deleted，**没有恢复上一版的接口**。固定 key 下，DB 事务回滚后对象内容仍是被替换后的新图，数据库描述的图片和实际字节不一致；版本 token 下最坏只是孤儿对象。
2. **审核窗口的快照。** 审核进行中属主再次保存会覆盖 pending 的固定 key，审核员已打开的 diff 会被悄悄换图（revision 能阻止通过，但「看到的」和「通过的」可能不是同一张）。版本 token 让已发出的 URL 永远指向当时那张图。
3. **中间页的身份。** 中间页的页序是数据（`fudaba_card_media.display_order`），拖动只是改顺序。如果 key 里有 `middle-3` 这种位置信息，重排就必须复制/重写对象；固定位置名还会和实际页序长期不一致。

结论：**队列放进路径（好用于回收与审计），但不能省掉版本 token**。

### 7.2 建议的布局

```
community/fudaba/cards/<cardId>/<live|pending>/<pageId>.<version>.<ext>
community/fudaba/cards/<cardId>/<live|pending>/<pageId>.<version>.thumb.jpg
```

- `pageId`：正面 `front`、背面 `back`、中间页 `page-<slotId>`（建档时分配、随页移动，不随显示顺序变）。
  - 位置名（`middle-1`、`middle-2`）与显示顺序绑定：重排要重写对象，插入/删除会让名字整体偏移，审核中的待审集一旦重排，已发出的地址就指向了别的页。
  - 稳定槽位把页序留在 `display_order`，重排只改一行数据；代价是 key 不再直观，排查时需要查表，且「删页再加页」会留下不可复用的槽位（由 GC 处理）。
- `version`：短 uuid 或内容 hash，每次写入新值；DB 存「当前指向的 key」。
- 队列隔离带来的免费收益：`pending/` 下全部对象可随时整体清理，`live/` 之外没有任何对象需要公开。
- 缩略图与所属面同目录，天然唯一。

## 7.3 数据表还要不要 `*_object_key`

`<pageId>.<version>` 里唯一不可推导的是 **version**（`pageId` 由页面身份决定，队列由读法决定）。要拿到当前版本只有两条路：

- 列目录前缀（每次读一次 LIST，不可接受）；
- **把当前版本存下来**。

现行「key 列」实际是 **8 个**，分布在三张表：`fudaba_cards` 的 `front_object_key`、`back_object_key`、`pending_front_object_key`、`pending_back_object_key`、`pending_middle_object_keys`（数组）共 5 个；`fudaba_card_media.object_key` 1 个；只读归档 `cards.image1_url`、`image2_url` 2 个。所以不是「不需要记录 key」，而是把这 8 个指针收敛成一张表：

```
fudaba_card_pages(
  card_id, queue('live'|'pending'), page_id('front'|'back'|'page-<slotId>'),
  slot_id, display_order, object_version, updated_at,
  PRIMARY KEY (card_id, queue, page_id)
)
```

- 对象 key = `cards/<card_id>/<queue>/<page_id>.<object_version>.webp`，不再存全路径。
- 页序 = `display_order`，与 `page_id` 解耦，拖动只改这一列。
- 两套队列同表不同行，审核通过与拒绝 = 把 pending 行的版本提升/丢弃，不再有 `pending_*` 列。
- 迁移期可以双写：旧列继续写，表成为读取唯一来源；一个版本后删 `front_object_key/back_object_key/pending_*/fudaba_card_media`。

## 8. 缩略图：sharp 按需生成

imgproxy 已排除（私有签名 TTL、认证模型、部署成本）。sharp 本来就在依赖里（`resizeJpeg` 走 libvips），用它做**读时按需 + 存储缓存**是同一套认证模型下最直接的方案。

### 8.1 设计

- 统一读取路由接受 `?w=<px>`，白名单 `[320, 600, 960]`，默认 600；不接受任意值。
- 命中缓存直接 302；未命中读原图 → `sharp().resize({ width, withoutEnlargement: true })` → 写回同可见性作用域的缓存对象。
- 缓存 key：`cards/<cardId>/<queue>/cache/<page_id>.<object_version>.<width>.webp`。
  - 版本一换，旧缓存自然失效（不再被引用），随旧版本对象一起清理。
  - 缓存与源对象同作用域：私有图的缓存也是私有，绝不会因为被缓存而公开。
- 输出统一 **webp**（现在的小图是 JPEG 600×400，改为按宽度等比缩放，没有固定高度裁切）。
- 写路径**不再生成缩略图**：少一次写、少一条补偿逻辑，也顺带消灭「同名覆盖」这类问题。

### 8.2 代价与控制

| 代价 | 处理 |
| --- | --- |
| 首次请求要读原图 + 解码 | 缓存对象 + `Cache-Control: public, max-age=31536000, immutable`（按版本寻址，永不改变） |
| CPU 峰值 | 并发信号量（与上传转码共享一个池），限制输入像素（已有 `maxInputPixels`），只允许白名单宽度 |
| 冷启动放大 | 列表默认 600；只对首屏可见卡片预取，不批量生成 |
| 私有图缓存 | 与源对象同作用域，公开前缀只接受已发布对象 |

### 8.4 原始上传图是否保留（核实结论）

**当前名片上传链路不保留原始图。** 证据：

- `convertUserImageToWebp` 只返回转换后的 webp，调用方写入存储的是 `converted.body`；全仓库没有任何卡片处理器把 `file.body` 原样写入。
- 对象索引里 `logical_key LIKE '%original%'` 为 0 条；`community/fudaba/cards/%` 下的非 webp 对象只有 40 个 `.jpg`，全部是缩略图。
- 历史 `uploads/namecard/original/<file>` 只是路径名，存的是转换后的 webp，小图单独存 `.jpg`。
- 例外：迁移脚本 `scripts/migration/fudaba-media.js` 按源格式原样复制（jpg/png/avif/webp 都会保留），所以**迁移进来的老卡**可能保留原始字节，但那是「原图即最终图」，不是额外备份。

结论：现网如果存在原始上传图，只可能来自 R2 迁移或更早的系统，不是这条链路产生的。

### 8.3 保留的退路

这条路由是唯一入口，未来若要接 imgproxy，只需在「公开 + 已配置」时 302 到签名 URL；客户端契约不变，不需要第二次改调用方。

## 9. 执行顺序（确认后）

1. 新增 `storeCardPage()` 与 `cardArtworkView()`，新写入全部走新布局（双写一个版本）；
2. 六个列表与五个 `<img>` 实现切到 `pages[]` + `CardImage`；
3. 迁移脚本：旧 5 种布局 → 新布局，逐卡执行、失败即停、DB 更新与对象写入可重入；
4. 删除 key 反推、`legacyMediaUrl` 兜底、`withThumbnail`；
5. 观察一个版本后清理旧对象（`pending/` 与 `versions/`）。

## 10. 已定与待定

已确认：

- 缩略图改为读时按需生成（写路径不再产缩略图）；
- 公开图统一走 API 路由（便于兜底与替换后端）；
- 兼容只需覆盖仍在上线的 `community/namecards/assets/<stem>/image.webp`；其它布局由迁移统一改写，不做长期兼容。

待定：

1. `pageId` 用稳定槽位（`page-<slotId>`）；位置名的取舍见 §7.2；
2. 版本 token 用短 uuid 还是内容 hash；
3. `fudaba_card_pages` 单表替代 8 个 key 指针；
4. 列表接口 `pages[]` 的对外兼容期；
5. 旧对象（`versions/`、旧上传路径）的清理窗口。
