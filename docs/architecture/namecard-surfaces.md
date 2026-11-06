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
| `fudaba_cards` | 名片主体：正反面对象 key、暂存版本（`pending_*`）、制作人名称/读音、团体、制作时间、简介、交换说明、交换模式、可见性、原创/AI 标记、`publication_status`、`review_status`、`revision`、`owner_account_id`、`card_number`、`origin`、`deleted_at` | **唯一在用的名片表** |
| `fudaba_card_media` | 中间页（按 `display_order`） | 在用 |
| `fudaba_card_series` / `fudaba_card_favorite_characters` / `fudaba_card_credits` | 企划、担当角色、制作人员 | 在用 |
| `fudaba_card_claims` | 认领申请；`legacy_card_id` 存老卡编号，`payload` 只带改动 | 在用 |
| `fudaba_card_supplements` | 补充申请；`payload` 只带改动键，同一张卡同时只允许一份 | 在用 |
| `platform_profiles` | 属主/申请人显示名 | 在用 |
| `cards`（旧归档表） | 早期过渡版本的遗留表 | **仍存在于数据库，但已无任何读取方**；删除迁移尚未提交，迁移史测试仍在断言它 |

补充约定：

- `revision` 是整卡的乐观锁；属主保存、审核通过、管理窗修改都带 `expectedRevision`。
- 认领/补充各有自己的 `revision`，与名片 revision 无关。
- 公开读取只看 `publication_status='published'` 且 `deleted_at IS NULL`。

## 2. 页面与组件

所有窗口都用 `components/ui/dialog.tsx`（`layout="pinned"`），宽度按窗口区分。

### 2.1 编辑类窗口

| 入口 | 窗口 | 媒体 | 字段 | 动作 |
| --- | --- | --- | --- | --- |
| 个人名片管理（`account/me/namecards`） | `CardWorkspace` → `CardEditor`（3xl） | `CardMediaGallery`：上传 + 拖动排序 + 替换 + 删除 | `CardFields` 13 项（身份四字段来自 `NamecardIdentityFields`）；必填：名称、企划、至少一张图 | 首次 `createFudabaCard`；之后 `updateFudabaCard`；图片有改动先 `replaceFudabaCardMedia`；`deleteFudabaCard` |
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
| 名片媒体 | `GET /api/cards/:id/media/:side?thumb=1` | 支持 `middle-N`；`thumb=1` 取 600px 小图 |
| 旧上传路径媒体 | `GET /uploads/namecard/original|thumbnail/:filename` | 旧对象仍被公开名片引用；`?thumb=1` 已支持 |
| 属主编辑 | `/community/exchange/me/cards…` | 创建为 multipart，更新为 JSON，图片单独 PUT |
| 属主媒体 | `GET /community/exchange/me/cards/:id/media/:side?v=<rev>&thumb=1` | 受保护对象，`draft=1` 取暂存版本 |
| 认领申请 | `POST /community/exchange/legacy-cards/:cardNumber/claims` | 以老卡编号定位 |
| 补充申请 | `POST /community/exchange/cards/:cardId/supplements` | 必须真的改动 |
| 反馈 | `POST /community/exchange/cards/:n/feedback` | 读者提交，后台处理后结掉 |
| 后台审核 | `/admin/exchange/card-reviews…`、`/admin/exchange/claims…`、`/admin/exchange/supplements…` | 复核窗用 `diff` 与媒体路由 |
| 后台投稿/管理 | `/admin/api/cards…` | 列表、diff、通过/驳回/锁定/解锁、改名/删除/反馈 |
| 反应 | `POST /api/reactions` | 名片墙与用户主页都可写 |

## 4. 行为规则

1. **认领**：提交只需名称与企划；企划依次取「申请值 → 绑定目标卡的企划 → 担当角色所属企划 → 卡上已存的企划」。不带 payload 是合法的（卡可能已被他人补充完整）。
2. **认领审核**：两段事务。`begin` 把行推进到 `approving` 并 +1 revision，`complete` 再落结果；中间崩溃留下的 `approving` 行可用最新 revision 续做。无目标认领就地升级老卡，有目标认领绑定到目标卡并把无主行软删除。
3. **补充**：只提交改动字段；同一张卡同时只允许一份待审补充。
4. **编辑保存**：先提交图片（若有改动），再用最新 revision 提交字段；提交内容与线上一致时撤回待审版本。
5. **页数**：`1 + 中间页数 + (有背面 ? 1 : 0)`，服务端统一走 `namecardPageCount`（SQL 侧 `card_page_count` 同公式）。
6. **状态**：`publication_status`（pending/approving/published/rejected/locked/hidden）×  `review_status`（待审版本）。后台词汇表在 `namecard-status-options.ts`。
7. **属主显示名**：`platform_profiles.display_name`，为空或空白时回落到帐号 id。

## 5. 图片使用要求

当前所有名片图都有 600px 级的 `thumbnail` 副本（fudaba 在同目录的 `thumbnail.jpg`，
旧上传路径在同级 `thumbnail/<file>.jpg`）。服务端 `preferThumbnail` 负责回退到原图。

| 场景 | 现在 | 目标（按需尺寸服务） |
| --- | --- | --- |
| 全屏预览 `NamecardPreview` | 原图 | 原图（保留原始字节，不做二次压缩） |
| 画廊大图（`CardMediaPreview`/`CardMediaGallery`） | 600px 缩略图 | ≈1000px（当前渲染宽约 480–700px） |
| 缩略图条（全屏预览底部） | 原图 | ≈160px |
| 列表瓦片（`NamecardMediaPreview`） | 原图 + `?thumb=1` 尝试 | ≈400px |
| 上传 | ≤8 MB，JPEG 像素上限 70M、PNG 40M，转 webp | 不变 |

接入尺寸服务时的约定：

- `?thumb=1` 保留为「小图」语义；新增 `?w=` / `?fit=` 时由处理服务构造完整 URL，客户端不自行拼接。
- 客户端统一经 `withThumbnail()`（`apps/web/app/lib/media-urls.ts`）取小图；换成其它参数名只改这一处。
- 服务端 `preferThumbnail()` 是唯一的「缺失回退原图」判断点。
- 全屏预览必须继续使用原图 URL；任何缩略图化都不能作用到 `NamecardPreview`。

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
| `/uploads/namecard/original|thumbnail/*` | 已发布名片公开可读；未发布要求登录 | 与静态资源一致 |
| `/api/cards/:id/media/:side` | 公开（仅已发布） | `public, max-age=300`，302 到存储 |
| `/community/exchange/me/cards/:id/media/:side` | 属主本人（`platformAuth`） | `private, no-store`，`Vary: Authorization, Cookie` |
| `/admin/api/cards/:id/media/:variant/:side` | 后台（`backofficeAuth`） | `private, no-store`，`Vary: Cookie` |
| `/admin/exchange/card-reviews/:id/media/:side` | 后台 | `private, no-store` |

对象命名：

- 新路径：`community/fudaba/cards/<cardId>/versions/<version>/front|back|middle-N.webp`，600px 副本是同目录的 `thumbnail.jpg`。
- 旧路径：`/uploads/namecard/original/<file>.webp`，小图在同级 `thumbnail/<file>.jpg`。
- `namecard-thumbnail-backfill.ts` 负责给历史名片补缩略图；写之前用 `findApprovedCard` 确认这张卡仍然公开发布。

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
| 属主修改已发布卡 | 整卡 `published` | 不变 | `pending`，写入 `pending_*` | 旧版本 | 无 |
| 属主修改未发布卡（`pending` / `rejected`） | 有属主且未锁定 | 不变（`rejected` 保持 `rejected` 直到重新审核通过） | 不变 | 无 | 无 |
| 属主删除（`softDeleteCardForOwner`） | 不在 `approving` / `locked` / `hidden` | `hidden` | 清空 | 立即从墙/主页消失 | 无 |
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

### 9.2 各界面可见性

| 界面 | 可见条件 |
| --- | --- |
| 名片墙（`GET /api/cards`、随机补充、贡献榜） | `publication_status='published'` 且 `deleted_at IS NULL`；复审中的卡展示**线上版本** |
| 用户主页（`GET /users/:handle/cards`） | 同上，再加 `visible=true` |
| 详情窗（墙/主页打开） | 只有上面两类卡能打开；「编辑」按 `canEdit`，「认领/补充」只在无主卡上渲染 |
| 属主名片列表 | `owner_account_id=本人`、`deleted_at IS NULL`、`publication_status<>'hidden'` |
| 后台投稿审核列表 | `publication_status IN ('pending','approving')` 或 `review_status='pending'`；状态筛选另有全部/已通过/已驳回/已锁定/已隐藏 |
| 后台管理 / 反馈列表 | 全部状态，包含 `locked` 与 `hidden` |
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
| 按编号取一张只读预览 | `ReviewCardPreview`（取数壳，内部就是 `CardMediaPreview`） | 再写一个「拉 diff + 映射槽位」的预览 |
| 全屏看名片 | `NamecardPreview` + `namecardPages` | 正反面切换按钮 |
| 列表瓦片 | `NamecardMediaPreview` | 另一套正反面拼合 |
| 只读字段对照 | `ReviewFieldRows` + `review-row-diff` | 再写一份标色逻辑 |
| 身份四字段 | `NamecardIdentityFields` | 复制名称/读音/团体/时间 |
| 状态徽标与筛选 | `NamecardStatusBadge` + `namecard-status-options` | 再定义一份中文字典 |
| 行内裁决按钮 | `ReviewRowAction` | 复制按钮 + spinner 判定 |
| 页数 | `namecardPageCount`（API） | 三处各算一遍 |
| 名片页面编号 | `namecardPageLabel` / `mediaSlotRole` | 「正面/背面/中间页」各自命名 |

## 12. 维护提示

- 删除 contracts 子路径时，同步清理 `apps/web/vite.config.ts` 的 `optimizeDeps.include`：
  Vite 启动时逐条解析，残留条目会让 Web 与 App 两个视图启动即崩。
- 处理请求参数要经校验器（`querySchemaValidator` 等）；handler 里直接读 `c.req.query()` 会被
  `tests/server/handler.test.ts` 的契约检查拦下。
- 删除路由或 handler 时，同步更新 `handler.test.ts` 的 handler 清单与数量、`routes.test.ts`
  的 manifest 数量。
- 后台队列每次列表请求都会调用 `purgeExpiredNamecardSubmissions`（`fudaba/cards/ttl-purge.ts`）：
  终态超过 3 天的名片连同对象一并清理。游客投稿入口已删除，但这段清理仍需保留。

## 13. 测试入口

| 层 | 文件 |
| --- | --- |
| Web 组件 | `tests/unit/components/community/`、`tests/unit/pages/community/`、`tests/unit/pages/admin/cards/` |
| Web 共享组件 | `tests/unit/components/shared/namecard-preview.test.tsx`、`tests/unit/pages/account/me/namecards/` |
| API 领域 | `apps/api/tests/server/fudaba.test.ts`、`apps/api/tests/server/namecard.test.ts` |
| 契约 | `apps/api/tests/server/handler.test.ts`、`apps/web/tests/e2e/fixtures/api-contract-catalog.ts` |
| 端到端 | `apps/web/tests/e2e/namecard-*.spec.ts`、`app-namecard-browsing.spec.ts` |
