# 名片媒体验证执行记录（预览站）

> 文档类型：执行记录
> 环境：`https://preview.idol-master.top`（数据与生产隔离，可随意增删）
> 计划来源：`docs/testing/namecard-media-acceptance-map.md`
> 规则：**只维护这一份执行记录**；不按用例新建文档，不把同一结论写两遍。

## 1. 账号与入口

账号密码文件（不提交密码）：

`F:\imas-fan-dev\test account.txt`

- 属主账号：`zheizhei_real@163.com`
- 管理员账号：`admin`

## 2. 当前状态

本轮从零重跑。旧卡 `#932「验收四页P」` 是临时夹具，已被管理操作破坏为 3 页，
**不再作为任何通过证据**，可删除或重建。

已确认的代码级结果：

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 已发布卡修订通过时合并 pending 页、保留未改 live 页 | 通过（本地） | `approval promotes staged pages without dropping untouched live ones` |
| pending 页对象批准后搬到 live 路径 | 通过（本地） | 审批后公开图片可解码 |
| 管理侧 front/back 入口解析 `page-*` 页序 | 通过（本地+预览） | `/api/admin/cards/932/media/live/back` 实际解码 600×900 |

## 3. 用例执行矩阵

状态只有：`未跑` / `通过` / `失败` / `阻塞`。通过必须包含真实图片解码尺寸。

### 3.1 属主与创建

| 用例 | 内容 | 状态 | 夹具/证据 |
| --- | --- | --- | --- |
| C1 | 单页卡新建 + 审核 | 未跑 | — |
| C2 | 双页卡新建 + 审核 | 未跑 | — |
| C3 | 四页卡新建 + 审核 | 未跑 | 旧 #932 已损坏，需重建 |
| C4 | 新建时旋转正/中间页 | 未跑 | — |
| C5 | 整组替换 + 加页 + 角色迁移 | 未跑 | — |
| C6 | 删除页面 + 重排 | 未跑 | — |
| C7 | 同次旋转 front + 中间页 | 未跑 | — |
| C8 | 还原图片撤回 | 未跑 | — |
| C9 | 可见性切换 | 未跑 | — |
| C10 | 删除名片 | 未跑 | — |

### 3.2 审核与修订

| 用例 | 内容 | 状态 | 夹具/证据 |
| --- | --- | --- | --- |
| C11 | 补充审核（文本+图片+旋转） | 未跑 | — |
| C12 | 认领审核（含旋转） | 未跑 | — |
| C13 | 反馈 | 未跑 | — |
| C14 | 首审通过/驳回/锁定 | 部分 | #931 四页图片可解码；#932 已损坏 |
| C15 | 管理端旋转/删除媒体 | 未跑 | 旧 #932 操作导致丢页，待重建后重跑 |
| C16 | 管理端状态切换 | 未跑 | — |
| C17 | 复审通过（图片修订） | 未跑（预览） | 本地回归用例通过 |
| C18 | 复审通过（仅文本） | 未跑 | — |
| C19 | 复审驳回/锁定（图片修订） | 未跑 | — |
| C20 | 复审期间撤回 | 未跑 | — |
| C21 | 驳回后重新提交 | 未跑 | — |
| C22 | 复审 + 状态切换 | 未跑 | — |

### 3.3 七个观测面

| 观测面 | 状态 | 证据 |
| --- | --- | --- |
| L1 属主我的名片 | 未跑 | 账号可用，待执行 |
| L2 名片墙 | 未跑 | 旧 #931/#932 仅做过页面级解码 |
| L3 用户主页 | 未跑 | — |
| L4 投稿审核 | 未跑 | — |
| L5 认领审核 | 未跑 | — |
| L6 补充审核 | 未跑 | — |
| L7 反馈管理 | 未跑 | — |

## 4. 单条用例记录格式

每跑完一条，只在本文件对应行补：

`夹具卡号 | 操作前后页数/顺序 | 图片解码尺寸 | 接口/窗口 | 通过或失败原因`

失败必须附可复现步骤；修复后在同一行改为通过并写提交号。

## 5. 入口清单（与 `docs/architecture/namecard-surfaces.md` 对齐）

L1 是编辑工作台，**没有详情窗和全屏预览**；详情窗/全屏属于 L2 与 L3。

| 入口 ID | 面 | 实际组件/入口 | 取图字段 |
| --- | --- | --- | --- |
| `L1-inventory` | 属主我的名片 | `CardInventory` 左侧清单 | `frontImageUrl` |
| `L1-gallery-main` | 属主我的名片 | `CardEditor → CardMediaGallery` 大图 | 当前页 `previewUrl` / `url` |
| `L1-gallery-strip` | 属主我的名片 | 同上，底部缩略图条 | 每页 `previewUrl` |
| `L2-tile` | 名片墙 | 墙面瓦片 | `pages[].thumbUrl` |
| `L2-detail` | 名片墙 | `NamecardDetailDialog → CardMediaPreview` | 当前页 `previewUrl` |
| `L2-full` | 名片墙 | `NamecardPreview` 全屏 + 底部缩略图 | `pages[].url` / `previewUrl` |
| `L3-tile` | 用户主页 | 主页名片瓦片 | `pages[].thumbUrl` |
| `L3-detail` | 用户主页 | 复用 `NamecardDetailDialog` | 同 `L2-detail` |
| `L3-full` | 用户主页 | 复用 `NamecardPreview` | 同 `L2-full` |
| `L4-live` / `L4-draft` | 投稿审核 | `NamecardReviewDialog → DiffArtwork` | 左 live / 右 draft |
| `L5-old` / `L5-target` | 认领审核 | `ClaimReviewDialog` | 老卡 / 目标卡 |
| `L6-request` | 补充审核 | `SupplementReviewDialog` | 申请页集 |
| `L7-tile` | 反馈管理 | 反馈列表瓦片 | `NamecardMediaPreview` |
| `L7-dialog` | 反馈管理 | `NamecardManageDialog` | `CardMediaGallery` 每页 |
| `ADMIN-side` | 管理侧 | `/api/admin/cards/:n/media/live/front\|back` | 直接 `<img>` 解码 |

只有 `L2-*` / `L3-*` 检查详情窗和全屏；`L1-*` 不检查这两个窗口。

## 6. 本轮已发现并修复的代码问题

| 问题 | 修复 |
| --- | --- |
| 修订审批把 pending 页整组提升，丢掉未改 live 页 | `fix(namecard): promote staged page sets on approval` |
| pending 页对象留在 pending 路径，批准后原图 404 | 同上（审批时 move 到 live 并 publish） |
| 管理侧 front/back 只认字面页 ID，页面布局卡 404 | `fix(namecard): resolve admin front/back media for page layouts` |
