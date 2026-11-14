# 名片墙界面、数据与交互

> 文档类型：架构
> 状态：Active
> 权威来源：`packages/contracts/src/namecards*.ts`、`apps/api/src/domains/community/namecards/`、`apps/api/src/domains/community/fudaba/`、`apps/web/app/pages/community/`、`apps/web/app/pages/account/me/namecards/`

名片墙（community/cards）从上传、认领、补充、审核到公开浏览跨越多个窗口。本文件固定
「哪个窗口由哪些组件构成、数据来自哪里、哪些部分已经共用」，新增实现前先查这张表，
避免再造一份同形实现。

## 1. 数据来源

| 来源 | 内容 | 现状 |
| --- | --- | --- |
| `fudaba_cards` | 名片主体：复审暂存 `pending_payload`、制作人名称/读音、团体、**团体标记 `is_group_card`**、制作时间、简介、交换说明、交换模式、可见性、原创/AI 标记、`publication_status`、`review_status`、`revision`、`owner_account_id`、`card_number`、`origin`、`deleted_at` | **唯一在用的名片表**；旧图片 key 列已在 P4 删除 |
| `fudaba_card_pages` | 每张卡的 live/pending 页面：`queue`、`page_id`、`display_order`、`object_version`、`object_queue`、`width`、`height` | **媒体唯一来源** |
| `fudaba_card_media` | 中间页旧表 | **P4 已删除**（`20261112120000_namecard_media_retire.sql`） |
| `fudaba_card_series` / `fudaba_card_favorite_characters` / `fudaba_card_credits` | 企划、担当角色、制作人员 | 在用 |
| `fudaba_card_claims` | 认领申请；`legacy_card_id` 存老卡编号，`payload` 只带改动 | 在用 |
| `fudaba_card_supplements` | 补充申请；`payload` 只带改动键，同一张卡同时只允许一份 | 在用 |
| `platform_profiles` | 属主/申请人显示名 | 在用 |
| `cards`（旧归档表） | 早期过渡版本的遗留表 | **仍存在于数据库，但已无任何读取方**；删除迁移尚未提交，迁移史测试仍在断言它 |

补充约定：

- `revision` 是整卡的乐观锁；属主保存、审核通过、管理窗修改都带 `expectedRevision`。
- 认领/补充各有自己的 `revision`，与名片 revision 无关。
- 公开读取只看 `publication_status='published'` 且 `deleted_at IS NULL`。
- **页面行是媒体唯一来源**：`fudaba_card_pages(card_id, queue, page_id, display_order,
  object_version, object_queue, width, height)` 保存每张卡的 live/pending 页序，`page_id` 为稳定槽位
  （`front`、`back`、`page-<uuid>`），`object_queue` 标记该页对象属于 live 还是 pending 存储。
  P4 已删除 `fudaba_cards` 的 `front_object_key` / `back_object_key` / `pending_front_object_key` /
  `pending_back_object_key` / `pending_middle_object_keys`（`20261112140000_namecard_retire_card_key_columns.sql`）
  与旧表 `fudaba_card_media`（`20261112120000_namecard_media_retire.sql`）；媒体读取没有任何旧列回退。
- **响应只给路由地址**：列表与详情返回 `pages[]`（`url` 原图、`previewUrl` 800、`thumbUrl` 400）；
  旧字段 `image1_url` / `image2_url` / `image*_thumbnail_url` 与 `middle_image_urls` 已从契约删除，
  浏览器不再拿到对象键，读侧也不再反推存储路径。

## 2. 页面与组件

所有窗口都用 `components/ui/dialog.tsx`（`layout="pinned"`），宽度按窗口区分。

### 2.1 编辑类窗口

| 入口 | 窗口 | 媒体 | 字段 | 动作 |
| --- | --- | --- | --- | --- |
| 个人名片管理（`account/me/namecards`） | `CardWorkspace` → `CardEditor`（3xl） | `CardMediaGallery`：上传 + 拖动排序 + 替换 + 删除 + 旋转（预览区左上角两个按钮） | `CardFields` 13 项（身份四字段 + 团体标记来自 `NamecardIdentityFields`）；必填：制作人名称（团体名片改为选填、改由团体名称必填）、企划、至少一张图 | 首次 `createFudabaCard`；之后 `updateFudabaCard`；图片有改动先 `replaceFudabaCardMedia`；`deleteFudabaCard` |
| 名片墙 · 认领（`NamecardClaimDialog`，2xl） | 同上壳 | `CardMediaPreview`（只读） | `NamecardWallFields mode="claim"` 6 项 + 绑定方式；必填：名称、企划（可从卡/角色/绑定目标推导） | `createFudabaLegacyCardClaim` |
| 名片墙 · 补充（`NamecardSupplementDialog`，2xl） | 同上壳 | `CardMediaPreview` | `NamecardWallFields mode="supplement"` 4 项；必须至少一处改动 | `createFudabaCardSupplement` |
| 后台 · 反馈 / 修改（`NamecardManageDialog`，4xl） | 同上壳，`feedback` 有无区分两个入口 | `CardMediaGallery`（只允许排序/删除） | `CardFields required={false}` + 账号归属、名片状态、版本状态、理由；资料/状态/归属有变动时理由必填 | `updateAdminNamecard`、`deleteAdminNamecard`、`resolveAdminNamecardFeedback` |

> 名片墙的「新建名片」入口（`NamecardCreateEntry`）不再上传游客投稿：已登录直接跳到
> `/account/me/namecards?card=new` 打开上面的编辑器，游客去登录页。游客投稿链路
> （回执页、回执存储、guest 接口与契约）已删除。

### 2.2 详情类窗口

| 入口 | 组件 | 差异 |
| --- | --- | --- |
| 名片墙 / 用户主页 | `NamecardDetailDialog`（5xl） | 媒体 = `CardMediaPreview`（不显示正反面角标，按点击面起始）；全屏预览 `NamecardPreview`（页面模型 + 底部缩略图条）；字段是只读 `<dl>` 八行 |
| 投稿审核 | `NamecardReviewDialog`（5xl） | `DiffArtwork`（线上 vs 待审）+ `ReviewFieldRows`（`review-row-diff` 生成，13 项） |
| 认领审核 | `ClaimReviewDialog`（5xl） | 绑定型用 `DiffArtwork`（老卡 vs 目标卡），非绑定型用 `ReviewCardPreview`；6 行对照 |
| 补充审核 | `SupplementReviewDialog`（5xl） | 只用 `ReviewCardPreview`；只列本次申请出现的字段 |

### 2.3 待审列表

四个列表都是 `AdminPanel` 卡片网格，瓦片媒体统一 `NamecardMediaPreview`（正反面拼合，
页数 > 2 时自带角标）。

| 列表 | 行内动作 |
| --- | --- |
| 投稿审核 | 通过 / 驳回 / 锁定 / 解锁（`ReviewRowAction` 承载按钮与加载态） |
| 认领 / 补充审核 | 通过 / 驳回 |
| 后台反馈 | 无行内动作，点开管理窗并结掉反馈 |
| 后台信息修改 | 通过 / 驳回 / 删除 |

## 3. 接口

| 用途 | 路由 | 备注 |
| --- | --- | --- |
| 名片墙列表 / 单卡 | `GET /api/cards`、`GET /api/cards/:id` | 单卡用于深链与随机补充 |
| 名片媒体 | `GET /api/cards/:id/media/:side` | `side` 支持 `front`/`back`/`middle-N`/`page-<uuid>`；`?w=160\|400\|800\|1400`，不带 `w` 返回原图 |
| 属主编辑 | `/community/exchange/me/cards…` | 创建为 multipart，更新为 JSON，图片单独 PUT |
| 属主媒体 | `GET /community/exchange/me/cards/:id/media/:side?w=&draft=1` | 受保护对象；`v` 只做缓存破坏，`draft=1` 取待审页 |
| 认领申请 | `POST /community/exchange/legacy-cards/:cardNumber/claims` | 以老卡编号定位 |
| 补充申请 | `POST /community/exchange/cards/:cardId/supplements` | 必须真的改动 |
| 反馈 | `POST /community/exchange/cards/:n/feedback` | 读者提交，后台处理后结掉 |
| 后台审核 | `/admin/exchange/card-reviews…`、`/admin/exchange/claims…`、`/admin/exchange/supplements…` | 复核窗用 `diff` 与媒体路由 |
| 后台投稿/管理 | `/api/admin/cards…` | 列表、diff、通过/驳回/锁定/解锁、改名/删除/反馈 |
| 反应 | `POST /api/reactions` | 名片墙与用户主页都可写 |

## 4. 行为规则

1. **认领**：提交只需名称与企划；企划依次取「申请值 → 绑定目标卡的企划 → 担当角色所属企划 → 卡上已存的企划」。不带 payload 是合法的（卡可能已被他人补充完整）。
2. **认领审核**：两段事务。`begin` 把行推进到 `approving` 并 +1 revision，`complete` 再落结果；中间崩溃留下的 `approving` 行可用最新 revision 续做。无目标认领就地升级老卡，有目标认领绑定到目标卡并把无主行软删除。
3. **补充**：只提交改动字段；同一张卡同时只允许一份待审补充。
4. **编辑保存**：先提交图片（若有改动），再用最新 revision 提交字段；提交内容与线上一致时撤回待审版本。
5. **页数**：`1 + 中间页数 + (有背面 ? 1 : 0)`，服务端统一走 `namecardPageCount`（SQL 侧 `card_page_count` 同公式）。
6. **状态**：`publication_status`（pending/approving/published/rejected/locked/hidden）×  `review_status`（待审版本）。后台词汇表在 `namecard-status-options.ts`。
7. **属主显示名**：`platform_profiles.display_name`，为空或空白时回落到帐号 id。
8. **团体名片**：`is_group_card=true` 时必填项从「制作人名称」换成「团体名称」，**制作人名称转为选填**（团体可能有自己的吉祥物）；留空时服务端把它写成团体名称，供检索与既有读取路径使用，团体改名时该回落值跟着走，使用者自己填的名称不会被覆盖。团体标记只允许 `exchange_mode='auto'`（数据库 CHECK + 服务端强制 + 编辑器置灰），勾选或取消都要复审；被个人认领后标记保留，改动仍需复审，改归属走【反馈】。

### 4.1 免审路径（不经版本复审就直接生效）

名片有两条写入面：**内容面**（需要复审）和**状态面**（上下架、归属、裁决，本来就不走版本复审）。
内容面也不是整体复审：`fudaba-review-policy.ts` 明确划了两组字段，判定只看四个字段的差异。

#### 4.1.1 字段分组

| 组 | 字段 | 行为 |
| --- | --- | --- |
| **需要复审**（`requiresCardReview`） | `producer_name` 制作人名称、`bio` 简介、`trade_note` 交换说明、`is_original` 原创标记、`is_group_card` 团体标记；**团体卡或即将成为团体卡时**的 `group_name` 团体名称 | 已发布卡写入 `pending_payload` 并把 `review_status` 置 `pending`；线上继续展示旧值 |
| **免审**（`CARD_REVIEW_EXEMPT_FIELDS`） | `producer_reading` 读音、`series_codes` 企划、`favorite_character_ids` 担当角色、`credits` 创作人员、`made_on` 制作日期、`group_name` 团体、`made_with_ai` AI 标记、`visible` 公开显示、`exchange_mode` 交换模式 | 直接写线上列与三张关系表（企划 `fudaba_card_series`、担当角色、创作人员）并 `revision+1`；若已有待审版本，同一批值同步写进 `pending_payload`，保证将来通过复审不会把它们回退 |

新增字段时必须同时改两处：`CARD_REVIEW_EXEMPT_FIELDS` 与 `updateCardMetadataForOwner` 的免审分支；
`fudaba-review-policy.ts` 顶部有编译期守卫，漏声明会直接编译失败。

#### 4.1.2 内容免审与状态免审

| 免审动作 | 触发位置 | 免审条件 | 直接写入 | 结果 |
| --- | --- | --- | --- | --- |
| **撤回待审版本** | 属主保存（`updateCardMetadataForOwner`） | 整卡已 `published` 且存在 `pending_payload`；提交的字段与线上一致（`sameCardSubmission`），暂存图片与线上图片也一致（`sameArtworkOrder`，顺序在内） | 清空 `pending_payload`、pending 页面行与 `review_status` | 待审版本（含页序改动）整体回退；不发通知 |
| **纯页序调整** | 属主图片保存（`replaceCardMediaForOwner`） | 整卡已 `published` 且**没有待审版本**，提交集合与线上集合逐个 key 相同、仅顺序不同（`isArtworkReorder`） | 只重排 `fudaba_card_pages.display_order` | 新顺序立即生效，不进队列 |
| **旋转 90°** | 新建 / 图片保存（`rotations: {front,back}`） | 属主本人、revision 匹配；页数与页序都没变 | 写入时先旋转再落盘，生成新版本对象与缩略图，整次保存只加一个 `revision`；有 pending 页时改 pending 那套，否则直接改线上 | 需要点保存，但不进复审（与页序同档） |
| 管理窗保存 | `updateAdminNamecard` | 理由必填（资料/状态/归属任一变动） | 按所选状态直接写 `publication_status` / `review_status` / 归属，并落审计 | 立即生效；通知 `card-admin-edited`，归属变更另发 `card-transferred-*` |
| 属主删除 | `softDeleteCardForOwner` | 不在 `approving` / `locked` / `hidden` | `publication_status='hidden'`；清空 `review_status`、`pending_payload` 与 pending 页面行；live 页与对象保留 | 立即从墙与主页消失；后台管理列表仍可见，状态“已隐藏”，默认排在最后；待审版本不再出现在 L4 |
| 后台删除 | `deleteCardAsAdmin` | 理由 + revision 匹配 | 写 `deleted_at`，清空暂存 | 所有读取路径同时不可见 |
| 锁定 / 解锁 | `lockCard` / `unlockCard` | 锁定需理由 | `publication_status` 切换，锁定清空 `pending_payload` 与 pending 页面行 | 锁定立即下架；解锁回到 `pending` 等重新审核 |
| 认领通过 | `completeCardClaimReview` | 申请人 active、目标卡归属申请人（绑定时）、企划可用 | 升级老卡或软删无主行 | 内容由申请承载，不过版本复审 |
| 补充通过 | `completeCardSupplementReview` | 申请行 `pending` | 逐字段写回名片 | 立即反映；发 `card-supplement-approved` 与贡献值 |
| 反应 / 反馈 | `POST /api/reactions`、`…/feedback` | 已发布卡 | 独立的反应与反馈表 | 不改名片内容 |

#### 4.1.3 必须复审的情形

- 已发布卡改动了**五个复审字段**中的任意一个，哪怕只改一个字。
- 团体卡的制作人名称只影响展示（留空即回落团体名），仍按普通改名复审。
- 团体卡改动团体名称，或个人卡被勾选/取消【团体名片】。
- 已发布卡新增、替换、删除任何图片（唯一例外是上表的「纯页序」）。
- 未发布卡（`pending` / `rejected`）的任何编辑——它们本来就在等首审。
- 首审与复审一律由 `beginCardApproval` → `completeCardApproval` 两段事务执行，没有旁路。
- 旋转不属于内容变更：它不改页数、不改页序、不改字段，因此对有主卡始终保持免审。

#### 4.1.4 属主保存的判定顺序

1. 快照当前线上内容与图片集合；
2. 若与线上完全一致 → **撤回**待审版本，不写内容；
3. 若只有免审字段变化 → 直写线上，并把同批值同步进已有的 `pending_payload`；
4. 若复审字段有变化 → 写 `pending_payload` 与 pending 页面行并把 `review_status` 置 `pending`；
5. 图片单独提交时先走 `replaceCardMediaForOwner`：仅顺序不同 → 免审重排，否则写暂存。

## 5. 图片使用要求

写路径不再生成任何缩略图副本；读取路由按 `?w=` 用 sharp 生成并按页面版本缓存（webp）。
历史布局遗留的 `.thumbnail.jpg` / `uploads/namecard/thumbnail/…` 只等待 P5 GC，不再有新写入。

尺寸按「渲染宽度 × 设备像素比」定档，宽度是唯一参数（高度按比例，横竖构图都不需要第二套规则）：

| 场景 | 渲染宽度 | 请求档位 | 说明 |
| --- | --- | --- | --- |
| 全屏预览 `NamecardPreview` | 视口 | 原图 | 保留原始字节，不做二次压缩 |
| 画廊大图（`CardMediaPreview`/`CardMediaGallery`） | 480–700px | `w=800`（1x）/ `w=1400`（2x） | 默认 800 |
| 缩略图条（全屏预览底部） | 约 80px | `w=160` | 2x 覆盖 |
| 列表瓦片（`NamecardMediaPreview`） | 约 200–400px | `w=400`（1x）/ `w=800`（2x） | |
| 上传 | — | — | ≤8 MB，JPEG 像素上限 70M、PNG 40M，转 webp |

服务端只接受 `160/400/800/1400` 四档，其余宽度返回 400；未命中缓存时用 sharp 生成并写回同作用域缓存对象。

接入尺寸服务时的约定：

- 小图只有一个入口 `?w=`；`?thumb=1` 已删除，客户端不得再拼。尺寸档位只有 `160/400/800/1400`，其它值返回 400。
- 客户端统一消费 `pages[].url` / `previewUrl` / `thumbUrl`，不再有 `withThumbnail()` 之类的 URL 拼装层。
- 全屏预览固定使用 `pages[].url`（原图）；缩略图档位只用于瓦片与页签。

## 6. 并发、幂等与恢复

| 场景 | 机制 | 失败后的表现 |
| --- | --- | --- |
| 属主保存 / 管理窗修改 / 删除 | 整卡 `revision` 乐观锁（`expectedRevision`） | 409 且带 `revision`；前端提示刷新后重试 |
| 认领审核 | 两段事务：`beginCardClaimReview` 先把行推进到 `approving` 并 +1 revision，`completeCardClaimReview` 再落结果；失败时尽力回滚 | 两步之间崩溃会留下 `approving`：队列仍列出它，用最新 revision 可**续做**（`begin` 接受 `pending` 与 `approving`） |
| 认领重复提交 | 同一老卡只允许一条 `pending/approving/approved` | 409「已经有一份认领在审核」 |
| 补充重复提交 | 同一张卡同一时间只允许一份待审补充 | 409 并返回已有申请 |
| 审核确认失败 | 确认框用 `useConfirmAction.reloadTarget` 重新取该行 | 对话框就地换成最新 revision，避免拿旧值反复提交 |
| 409 的两种语义 | 版本竞争只带 `code` + `revision`；业务拒绝带 `message`（如「认领目标不可用」） | `adminErrorMessage` 只在服务端给了 message 时原样展示，否则给「刷新后重试」 |

## 7. 媒体：对象、鉴权与缓存

| 路由 | 谁能读 | 缓存头 |
| --- | --- | --- |
| `/api/cards/:id/media/:side` | 公开（仅已发布） | `public, max-age=300`，302 到存储 |
| `/community/exchange/me/cards/:id/media/:side` | 属主本人（`platformAuth`） | `private, no-store`，`Vary: Authorization, Cookie` |
| `/api/admin/cards/:id/media/:variant/:side` | 后台（`backofficeAuth`） | `private, no-store`，`Vary: Cookie` |
| `/admin/exchange/card-reviews/:id/media/:side` | 后台 | `private, no-store` |

对象命名：

- 新路径：`community/fudaba/cards/<cardId>/<live|pending>/<pageId>.<version>.webp`，`pageId` 为
  `front` / `back` / `page-<uuid>`；不再写缩略图副本。
- 旧路径 `/uploads/namecard/...` 的读取路由已删除；历史对象仍在存储中等待 P5 GC，媒体读路径不再折回键。

键与别名的关系（排查媒体问题先看这一条）：

- 页面行存 `page_id` + `object_version`，对象键由 `cardPageObjectKey()` 生成；正/反/中间页按
  `display_order` 定位。
- 旧 key 列与 `fudaba_card_media` 已删除，媒体读取只认页面行；历史对象键/别名只作为存储里的旧对象存在。
- 历史别名归一化由 `20261107120000_namecard_media_key_normalization.sql` 完成；对应触发器随旧列在 P4 删除。
- 只为已发布卡出图；`?w=160|400|800|1400` 由媒体路由按需生成并缓存。

## 8. 公开名片上的状态投影

墙与个人主页的响应里带四个派生字段，详情窗的按钮按它们决定显示：

| 字段 | 含义 |
| --- | --- |
| `hasOwner` | 是否已有属主；无主才渲染认领/补充 |
| `claimStatus` | `unclaimed` / `pending` / `claimed`；`pending` 时补充也被挡住（认领优先） |
| `viewerClaimState` | 当前访问者自己的认领状态，未登录为 null |
| `supplementPending` | 是否已有一份待审补充 |

规则：认领审核期间不接受补充，也不接受第二份认领；已有属主的名片两者都不出现。

## 9. 双轴状态：触发、可见性与通知

名片有两条独立的状态轴，界面表现由两条轴共同决定：

- `publication_status`：整卡状态 —— `pending`（首次提交待审）、`approving`（审核已认领，两段事务中间态）、`published`（线上）、`rejected`（首次提交被驳回）、`locked`（违规锁定）、`hidden`（属主自行删除）。
- `review_status`：只描述**待审版本** —— `NULL`（没有待审版本）、`pending`（复审中）、`rejected`（复审驳回）、`locked`（复审违规）。

要点：已发布卡修改时，线上继续展示**旧版本**，新版本进 `review_status='pending'`；审核的驳回/违规只落在版本轴，不会把整卡下架。

### 9.1 转移表

| 触发 | 前置条件 | publication_status | review_status | 线上看到的版本 | 通知 |
| --- | --- | --- | --- | --- | --- |
| 属主首次提交（`createFudabaCard`） | 有名称、企划、至少一张图 | `pending` | 保持 `NULL` | 无（不在墙/主页） | 无 |
| 属主修改已发布卡的复审字段 | 整卡 `published`，改动了名称/简介/交换说明/原创标记 | 不变 | `pending`，写入 `pending_payload` | 旧版本 | 无 |
| 属主修改已发布卡的免审字段 | 整卡 `published`，只改动读音/企划/角色/创作人员/日期/团体/AI/可见性/交换模式 | 不变 | 不变 | 改动立即上线 | 无 |
| 勾选 / 取消团体标记 | 整卡 `published` | 不变 | `pending`，写入 `pending_payload` | 旧版本（个人卡）继续展示 | 无 |
| 属主把待审内容改回线上版本（撤回） | 整卡 `published` 且已有 `pending_payload`，提交与线上完全一致 | 不变 | 清空 | 旧版本 | 无 |
| 属主只调整页序（无待审版本） | 整卡 `published`，集合相同仅顺序不同 | 不变 | 不变 | 立即换成新顺序 | 无 |
| 属主修改未发布卡（`pending` / `rejected`） | 有属主且未锁定 | 不变（`rejected` 保持 `rejected` 直到重新审核通过） | 不变 | 无 | 无 |
| 属主删除（`softDeleteCardForOwner`） | 不在 `approving` / `locked` / `hidden` | `hidden` | 清空 | 立即从墙/主页消失；后台管理列表仍显示“已隐藏”并排最后；待审版本被丢弃 | 无 |
| 审核开始（`beginCardApproval`） | `pending` 或 `review_status='pending'` | `pending` → `approving` | 不变 | 已发布卡仍显示旧版 | 无 |
| 审核通过（首审） | 状态 `approving` | `published` | 清空 | 新版本上线 | `card-approved`「已通过审核」 |
| 审核通过（复审） | `review_status='pending'` | `published` | 清空 | 新版本替换旧版本 | `card-approved` |
| 审核驳回（首审） | 状态 `approving`/`pending` | `rejected` | 不变 | 仍不可见 | `card-rejected`「未通过审核」+ 理由 |
| 审核驳回（复审） | `review_status='pending'` | 保持 `published` | `rejected` | **旧版本继续在线** | `card-rejected`「新版本未通过审核」+ 理由 |
| 标记违规（首审） | 同上 | `locked` | 不变 | 不可见 | `card-rejected`「新版本已被标记违规」 |
| 标记违规（复审） | 同上 | 保持 `published` | `locked` | 旧版本继续在线 | 同上（复审口径） |
| 锁定（`lockCard`） | 非 `locked`、非 `withdrawn` | `locked` | 清空 | 立即下架 | `card-locked`「已被锁定」+ 理由；卡原本是 `hidden` 时不发 |
| 解锁（`unlockCard`） | 状态 `locked` | `pending` | 不清（原本已清） | 仍不可见，需重新审核 | `card-unlocked`「已解除锁定」 |
| 认领通过（无绑定目标） | 老卡无主、申请人 active、企划可用 | `published` | 不清 | 升级为本人名片并出现在墙上 | `claim-approved` / `claim-rejected`（发申请人） |
| 认领通过（绑定已有卡） | 目标卡属于申请人 | 目标卡不变；无主行软删除 | 不变 | 墙上只剩目标卡 | 同上 |
| 补充通过 | 申请行 `pending` | 不变 | 不变 | 立即反映补充后的字段 | `card-supplement-approved` + 贡献值（每卡每账号一次） |
| 管理窗保存 | 资料/状态/归属变动需填理由 | 按所选状态直接写入 | 按所选版本状态写入；`NULL` 表示丢弃待审版本 | 视写入结果 | `card-admin-edited` 逐字段差异；归属变更另发 `card-transferred-out` / `card-transferred-in` |

补充：

- 复审通过时，整组 pending 页面行（`fudaba_card_pages.queue='pending'`）提升为 live 行并清空 pending 集；
  这一步曾漏掉，导致「新加的页在通过后消失」。
- 待审版本的图片集合是**权威**的：预览、`draft=1` 媒体路由、逐页取图都按暂存集合索引，绝不回落到线上页；
  只有整卡没有暂存图片时（纯文字复审）才看线上页。
- 锁定会清空 `pending_payload` 与整组 pending 页面行，解锁后的卡从干净的 `pending` 重新开始。
- 管理窗的图片顺序索引的是**弹窗里显示的那一面**（有复审版本时是暂存集合，否则是线上集合）；
  按下标跨面混用会把背面写成中间页。

### 9.2 各界面可见性

| 界面 | 可见条件 |
| --- | --- |
| 名片墙（`GET /api/cards`、随机补充、贡献榜） | `publication_status='published'`、`visible=true` 且 `deleted_at IS NULL`；复审中的卡展示**线上版本** |
| 用户主页（`GET /users/:handle/cards`） | 同上，再加 `visible=true` |
| 详情窗（墙/主页打开） | 只有上面两类卡能打开；「编辑」按 `canEdit`，「认领/补充」只在无主卡上渲染 |
| 属主名片列表 | `owner_account_id=本人`、`deleted_at IS NULL`、`publication_status<>'hidden'` |
| 后台投稿审核列表 | `publication_status IN ('pending','approving')` 或 `review_status='pending'`；状态筛选另有全部/已通过/已驳回/已锁定/已隐藏 |
| 后台管理 / 反馈列表 | 全部状态，包含 `locked` 与 `hidden`；`hidden` 默认排最后，仍可打开查看 live 页 |
| 认领 / 补充审核列表 | 只看申请行的 `state`，与整卡状态无关 |
| 徽标文案 | 整卡：待审核/已通过/已驳回/已锁定/已隐藏；复审中/复审驳回/复审违规在 `published` 上**覆盖**整卡标签；`hidden` 显示「已隐藏」 |

### 9.3 通知清单

| kind | 触发 | 收件人 | 标题 |
| --- | --- | --- | --- |
| `card-approved` | 审核通过（首审或复审） | 属主 | 名片 #N 已通过审核 |
| `card-rejected` | 审核驳回、违规标记 | 属主 | 名片 #N 未通过审核 / 名片 #N 的新版本未通过审核 / 名片 #N 的新版本已被标记违规 |
| `card-locked` | 锁定 | 属主（`hidden` 卡除外） | 名片 #N 已被锁定 |
| `card-unlocked` | 解锁 | 属主 | 名片 #N 已解除锁定 |
| `card-admin-edited` | 管理窗改动资料/状态 | 属主 | 逐字段差异 |
| `card-transferred-out` / `card-transferred-in` | 管理窗改归属 | 原属主 / 新属主 | 归属变更 |
| `claim-approved` / `claim-rejected` | 认领审核 | 申请人 | 旧名片认领已通过 / 未通过 |
| `card-supplement-approved` | 补充审核通过 | 补充人 | 补充已通过（附贡献值） |

## 10. 反应

- 写入是公开接口 `POST /api/reactions`；名片墙客户端自己做一次会话级软限流并乐观累加，用户主页直接写接口后本地 +1。
- 读取：墙按卡片 id 懒加载一次；详情窗的「全部反应」与墙卡摘要共用同一份数据。

## 11. 复用清单（新增实现前先查）

| 需要 | 用这个 | 不要再造 |
| --- | --- | --- |
| 图片画廊 / 只读预览 | `CardMediaGallery` / `CardMediaPreview` | 手写 `<img>` 轮播 |
| 名片图片渲染 | `CardImage`（属主 blob 自动处理） | 在组件里手写 `<img>`/重复 owner blob 逻辑 |
| 按编号取一张只读预览 | `ReviewCardPreview`（取数壳，内部就是 `CardMediaPreview`） | 再写一个「拉 diff + 映射槽位」的预览 |
| 全屏看名片 | `NamecardPreview` + `namecardPages` | 正反面切换按钮 |
| 列表瓦片 | `NamecardMediaPreview` | 另一套正反面拼合 |
| 只读字段对照 | `ReviewFieldRows` + `review-row-diff` | 再写一份标色逻辑 |
| 身份四字段 | `NamecardIdentityFields` | 复制名称/读音/团体/时间 |
| 状态徽标与筛选 | `NamecardStatusBadge` + `namecard-status-options` | 再定义一份中文字典 |
| 行内裁决按钮 | `ReviewRowAction` | 复制按钮 + spinner 判定 |
| 页数 | `namecardPageCount`（API） | 三处各算一遍 |
| 名片页面编号 | `namecardPageLabel` / `mediaSlotRole` | 「正面/背面/中间页」各自命名 |
| 单页旋转 | `CardMediaGallery` 的 `onRotate(position, direction)` | 另写一套旋转按钮与位置换算 |

## 11.1 旋转的落地位置

点击只改 CSS 预览，真正的重写发生在写入那一次：

| 入口 | 提交内容 | 落库时机 |
|---|---|---|
| 属主新建 / 保存图片 | `rotations: {front?, back?}`（顺时针 90° 的圈数） | 同一次创建/保存；页集不变时直接改线上，不进复审 |
| 认领、补充 | payload `rotations` | 审核批准时 |
| 后台管理窗 | 同上，随整卡保存提交 | 保存即生效：handler 按 `media_order` 的最终位置转好对象并替换 key；不要求理由、不通知属主 |

每一页（含中间页）都可以旋转；中间页按页序随 `middles` 提交。

## 12. 维护提示

- 删除 contracts 子路径时，同步清理 `apps/web/vite.config.ts` 的 `optimizeDeps.include`：
  Vite 启动时逐条解析，残留条目会让 Web 与 App 两个视图启动即崩。
- 处理请求参数要经校验器（`querySchemaValidator` 等）；handler 里直接读 `c.req.query()` 会被
  `tests/server/handler.test.ts` 的契约检查拦下。
- 删除路由或 handler 时，同步更新 `handler.test.ts` 的 handler 清单与数量、`routes.test.ts`
  的 manifest 数量。
- 后台队列每次列表请求都会调用 `purgeExpiredNamecardSubmissions`（`fudaba/cards/ttl-purge.ts`）：
  终态超过 3 天的名片连同对象一并清理。游客投稿入口已删除，但这段清理仍需保留。
- 新增迁移要同步四处：`apps/api/tests/migration/postgres-migrations.test.js` 的 `count`、末位版本与两个有序清单，
  以及 `apps/api/tests/server/fudaba.test.ts` 里「review migrations preserve…」用例的 `executed` 列表。
- 新增/删除路由或 handler 后跑 `node scripts/contracts/compile-route-inventory.mjs --write`，并同步
  `scripts/contracts/tests/compile-route-inventory.test.mjs` 的 approved totals；`handler.test.ts` 另有两道门禁
  （handler 清单与数量、每个 `c.json` 首参的 `satisfies …Response`）。
- **线上图必须是公开对象。** 墙与主页按 `createPublicReadUrl` 取图，一个 key 解析失败会让整页
  列表连带失败。审核发布的是「批准后真正上线」的那一套（有 pending 页时提升 pending 页行）；
  任何写入方（属主保存、补充审核、认领绑定）都要把对象发布到 live 作用域。
- 单面名片的背面在响应里可能是 `null`，也可能整个字段缺席（`undefined`）。判断一律用
  `== null`，写 `=== null` 会让整条列表 500。
- 审核窗口按 id 从当前列表取行（`activeReviewCard` / `activeClaim` / `activeSupplement`）：
  用打开时的快照提交，revision 一变就永远 409。
- 墙的公开集合由 `NAMECARD_PUBLIC_ORIGIN` 决定：`origin IN ('guest','legacy')`，或该卡存在
  `fudaba_card_pages.queue='live'` 页面行；统一布局的卡以线上页面行为准，不再按 key 前缀判断。
- 缩略图不再写入：需要小图时一律请求 `?w=`，由媒体路由按页面版本生成缓存；历史
  `.thumbnail.jpg` 只等 P5 引用集 GC 清理。
- 已上线图未发布的历史数据用 `ops:namecards:republish` 修复（`-- --dry-run` 先看数量）。

## 13. 测试入口

| 层 | 文件 |
| --- | --- |
| Web 组件 | `tests/unit/components/community/`、`tests/unit/pages/community/`、`tests/unit/pages/admin/cards/` |
| Web 共享组件 | `tests/unit/components/shared/namecard-preview.test.tsx`、`tests/unit/pages/account/me/namecards/` |
| API 领域 | `apps/api/tests/server/fudaba.test.ts`、`apps/api/tests/server/namecard.test.ts` |
| 交换后端 | `apps/api/tests/server/namecard-exchange.test.ts`（真库）、`namecard-exchange-routes.test.ts`（路由冒烟） |
| 契约 | `apps/api/tests/server/handler.test.ts`、`apps/web/tests/e2e/fixtures/api-contract-catalog.ts` |
| 端到端 | `apps/web/tests/e2e/namecard-*.spec.ts`、`app-namecard-browsing.spec.ts` |
