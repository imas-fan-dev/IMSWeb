# 名片媒体验证执行记录（预览站）

> 文档类型：执行记录
> 环境：`https://preview.idol-master.top`（数据与生产隔离）
> 计划来源：`docs/testing/namecard-media-acceptance-map.md`
> 规则：**只维护这一份矩阵**；不按用例新建文档。每跑完一条直接改对应行。

## 1. 账号与入口

账号密码文件（密码不提交）：

`F:\imas-fan-dev\test account.txt`

- 属主账号：`zheizhei_real@163.com`
- 管理员账号：`admin`

## 2. 入口清单

| 入口 ID | 面 | 实际入口 | 取图字段 |
| --- | --- | --- | --- |
| `L1-inventory` | L1 | `CardInventory` 左边清单 | `frontImageUrl` |
| `L1-gallery-main` | L1 | `CardEditor → CardMediaGallery` 大图 | `previewUrl`/`url` |
| `L1-gallery-strip` | L1 | 编辑画廊底部缩略图条 | `previewUrl` |
| `L2-tile` | L2 | 名片墙瓦片 | `pages[].thumbUrl` |
| `L2-detail` | L2 | `NamecardDetailDialog → CardMediaPreview` | 当前页 `previewUrl` |
| `L2-full` | L2 | `NamecardPreview` 全屏 | `pages[].url` |
| `L3-tile` | L3 | 用户主页瓦片 | `pages[].thumbUrl` |
| `L3-detail` | L3 | 复用 `NamecardDetailDialog` | 同 `L2-detail` |
| `L3-full` | L3 | 复用 `NamecardPreview` | 同 `L2-full` |
| `L4-review` | L4 | `NamecardReviewDialog → DiffArtwork` | 首审看 live；复审看 live/draft |
| `L5-old` / `L5-target` | L5 | `ClaimReviewDialog` | 老卡/目标卡 |
| `L6-request` | L6 | `SupplementReviewDialog` | 申请页集 |
| `L7-tile` | L7 | 反馈列表瓦片 | `NamecardMediaPreview` |
| `L7-dialog` | L7 | `NamecardManageDialog` | `CardMediaGallery` 每页 |
| `ADMIN-side` | 管理侧 | `/api/admin/cards/:n/media/live/front\|back` | 直接 `<img>` 解码 |

L1 没有详情窗/全屏；详情窗/全屏只属于 L2/L3。

## 3. 执行矩阵

状态：`未跑` / `通过` / `失败` / `阻塞`。可见入口必须 `naturalWidth > 0`；
反向入口断言不存在。

| 用例 | 操作 | 必查入口 | 状态 | 夹具/证据 |
| --- | --- | --- | --- | --- |
| C1 | 单页新建 + 首审 | `L1-inventory`、`L1-gallery-main/strip`、`L4-review`；L2/L3 不可见 | 通过 | #933：L1/L4 均 600×900；L2 `/api/cards`、L3 `/api/users/4/cards` 均无 #933 |
| C2 | 双页新建 + 首审 | 同 C1，front/back 两页；无幽灵背面 | 未跑 | — |
| C3 | 四页新建 + 首审 | 同 C1，4 页顺序 1–4；角标/页签/缩略图条一致 | 未跑 | 旧 #932 已损坏，需重建 |
| C4 | 新建时旋转 | `L1-gallery-main/strip`、`L4-review` | 未跑 | — |
| C5 | 替换 + 加页 + 角色迁移 | `L1-gallery-*`（pending）、`L4-review`、`L2/L3` 旧版 | 未跑 | — |
| C6 | 删除 + 重排 | 同 C5；页序连续 | 未跑 | — |
| C7 | 同次旋转正/中间页 | 同 C5；未旋转页版本不变 | 未跑 | — |
| C8 | 还原图片撤回 | `L1` pending 清空、`L4` 队列、`L2/L3` 不变 | 未跑 | — |
| C9 | 可见性切换 | `L1`、`L4`、`L2/L3` | 未跑 | — |
| C10 | 删除名片 | `L1`、`L2`、`L3`、`L4`、`L7` | 未跑 | — |
| C11 | 补充审核 | `L6-request`、`L2/L3` 通过后 | 未跑 | — |
| C12 | 认领审核 | `L5-old`/`L5-target`、`L2/L3` 通过后 | 未跑 | — |
| C13 | 反馈 | `L7-tile`、`L7-dialog`、`L2-tile` | 未跑 | — |
| C14 | 首审决策 | `L4-review`、`L2/L3`、`L1` 状态 | 未跑 | — |
| C15 | 管理端媒体 | `L7-dialog`、`ADMIN-side`、`L2/L3` 保存后 | 未跑 | — |
| C16 | 管理端状态 | `L7`、`L4`、`L2/L3` | 未跑 | — |
| C17 | 复审通过（图片） | `L1` pending、`L4-review`、`L2/L3` 通过后 | 未跑（预览） | 本地回归用例通过 |
| C18 | 复审通过（仅文本） | `L1`、`L4`、`L2/L3`；`object_version` 不变 | 未跑 | — |
| C19 | 复审驳回/锁定 | `L4`、`L2/L3` 旧版、`L1` pending | 未跑 | — |
| C20 | 复审期间撤回 | `L1` pending、`L4` 队列、`L2/L3` | 未跑 | — |
| C21 | 驳回后重提 | `L4` 新 draft、`L2/L3` 通过后 | 未跑 | — |
| C22 | 复审 + 可见性 | `L2/L3`、`L4`、`L7` | 未跑 | — |

## 4. 单条记录补充

`夹具卡号 | 操作前后页数/顺序 | 每个入口解码尺寸 | 反向检查 | 失败原因/提交号`

## 5. 已修复代码问题

| 问题 | 修复 |
| --- | --- |
| 修订审批把 pending 页整组提升，丢掉未改 live 页 | `fix(namecard): promote staged page sets on approval` |
| pending 页对象留在 pending 路径，批准后原图 404 | 同上（审批时 move 到 live 并 publish） |
| 管理侧 front/back 只认字面页 ID，页面布局卡 404 | `fix(namecard): resolve admin front/back media for page layouts` |
