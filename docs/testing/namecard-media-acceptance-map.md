# 名片图片人工验收：链路归并与最小用例集

> 文档类型：测试计划
> 状态：Active
> 权威来源：`apps/api/src/domains/community/fudaba/`、`apps/api/src/domains/community/namecards/`、`apps/api/src/infra/db/repositories/`、`apps/web/app/pages/`、`docs/architecture/namecard-media-execution.md`

目标：在测试环境里用最少的操作覆盖「七个列表 + 对应窗口」的名片图片显示。图片正确性由
「写入链路 × 状态迁移 × 读取作用域」决定，同一条链路只测一次，不同链路各测一次。

每次执行的测试目的、所用卡片、实际进度、截图、日志和测试账号文件位置，记录在忽略的
`data/verification/<run>/` 中。此处只维护可重复执行的计划与判定标准，不提交带日期的执行快照。
账号密码保存在仓库外，执行记录只注明来源文件位置，不复制凭据。

## 1. 七个观测面

| 编号 | 列表 | 数据接口 | 可打开的窗口 | 图片断言点 |
| --- | --- | --- | --- | --- |
| L1 | 属主「我的名片」 | `GET /api/community/exchange/me/cards` | `CardWorkspace` → 编辑画廊、详情窗（L1 无全屏；`NamecardPreview` 只在 L2/L3） | 瓦片、画廊 `previewUrl`、待审图只在属主可见 |
| L2 | 名片墙 | `GET /api/cards` | `NamecardDetailDialog` → `NamecardPreview` | 瓦片 `thumbUrl`、页签、全屏原图、页数角标 |
| L3 | 用户主页 | `GET /api/users/:handle/cards` | 同上复用 | 与 L2 相同，但只应出现该用户已发布卡 |
| L4 | 后台投稿审核 | `GET /api/admin/cards` | 投稿审核窗（`DiffArtwork` + `ReviewCardPreview`） | 左=线上、右=待审；单面卡不得出现幽灵背面 |
| L5 | 后台认领审核 | 审核队列（claims） | `ClaimReviewDialog` | 老卡与目标卡两套图正确、旋转后的图是待审版本 |
| L6 | 后台补充审核 | 审核队列（supplements） | `SupplementReviewDialog` | 申请里的页面集合与旋转标注正确 |
| L7 | 后台反馈队列 | 反馈列表 | `NamecardManageDialog` | 反馈所属卡的图与列表瓦片一致；管理保存后不串图 |
| L8 | 后台信息修改 | `GET /api/admin/cards` | 信息修改 tab 的 `NamecardManageDialog` | L8-tile / L8-dialog：同一张卡在待审版本下的页数、图片、名称与版本状态必须一致 |

> 后台「管理」入口与 L4 共用 `/api/admin/cards` 和 `NamecardManageDialog`。为避免歧义，
> **L8-tile / L8-dialog 专指 `/admin/cards/manage` 的「信息修改」tab 及其管理窗**；
> L7 仍专指反馈队列。L8 使用 `NamecardManageDialog` 的完整字段与版本状态，但不应与反馈处理窗混称。

## 2. 判定标准（所有用例共用）

- 瓦片：`pages[].thumbUrl` 返回 200，不出现错误占位或旧图。
- 详情/审核缩略预览：`previewUrl`；审核窗左右版本的页面集合与页序正确。
- 全屏（仅 L2/L3）：`pages[].url` 为原图（不带 `w`），页签顺序 = `display_order`，单面卡只有正面页签。
- 待审状态：属主 `draft=1`、后台 `live|draft` 两种作用域各看一次；公开面绝不能拿到待审图。
- 页数变化后：列表页数角标、页签数量一致；L2/L3 另查全屏可翻页数。
- **页序身份**：页数、页签数量、角色标签一致都不等于通过。必须逐页核对来源身份与顺序（front=第一页，中间页按顺序，back=最后一页）；任一中间页与背面互换、或页面身份与上传源不一致，直接 `fail`。
- 旋转后：同一槽位出现新版本（缓存不命中旧图）；未旋转的槽位版本不变。

## 3. 执行版最小链路

### 3.1 覆盖维度

每个观测/用例记录：

```text
(audience, route, version, page-shape, status/visibility, UI-shell)
```

`legacy-fallback` 维度已在 P4 随旧 key 列/旧表/旧路由一起退役，不再记录；其余维度规则不变。

只有被替代面的所有维度都已被已测面覆盖，才允许在 `execution.md` 记 `covered-by <T#>`。
不再按旧 C1–C22 逐条重复执行；旧编号只作为覆盖映射。

### 3.2 十条最小链路

| 链路 | 操作 | 覆盖用例 | 必须实际观察的入口 | 省略/覆盖说明 |
| --- | --- | --- | --- | --- |
| T1 单面公开 | 新建 1 页卡 → 首审通过 | C1 | L4 审核窗、L1 瓦片、L2 瓦片/详情/全屏、L3 详情 | L3 图片渲染由 L2 覆盖；L3 只验证“只出现本人已发布卡” |
| T2 2→4 页 + 新建旋转 | 新建 2 页并旋转正面 → 首审通过 → 增 2 个中间页 | C2、C3、C4 | L1 编辑画廊、L4 首审、L2 多页全屏、L3 可见性 | C2 的 2 页状态在增页前观察；4 页状态补 F/M1/M2/B 身份 |
| T3 属主整组编辑 | 先“加页→删新增页”触发撤回；再替换正面、加页、换序、删正面、删中间页、旋转非正方形中间页+背面 | C5、C6、C7、C8 | L1、L4 diff、L2/L3 | 系统按 key 顺序比较，重新上传同一图不算还原；正方形页不能只靠宽高判断旋转；纯旋转不进 L4 时跳过 L4 |
| T4 可见性与属主删除 | `visible=false/true`；已发布卡删除；提交待审版本后属主删除；后台恢复；新建卡先提交再删除 | C9、C10 | L1、L2、L3、L4 | 恢复必须得到删除前已通过版本；pending 资料/页行不得回流；未提交新卡没有删除入口 |
| T5 认领 | 无主 legacy 2 页卡 → L2 认领弹窗内旋转 → 提交 → L5 通过 | C12 | L5 老卡/目标卡、L2 | L5 只读不旋转；L2 验证公开面换新版本；L1 仅在目标卡属主可见时看 |
| T6 补充 | L2 补充弹窗内改文本 + 正面旋转 → 提交 → L6 通过 | C11 | L6、L2 | L6 只读不旋转；页数不变；只用 L6 的补充字段与旋转标注 |
| T7 反馈 | 单页卡提交反馈 → 打开管理窗 | C13 | L7 队列瓦片、L7 管理窗 | L7 媒体渲染由 L4 覆盖；这里只验证反馈绑定和单页无幽灵背面 |
| T8 投稿决策 | 首审通过/驳回/锁定；解锁走 T9 | C14 | L4 队列与审核窗、L2 | 通过分支已由 T2 覆盖时可只复核 L4 队列移除；锁定/解锁不重复 |
| T9 管理端媒体与状态 | 管理窗旋转正/中间页、删背面；属主新增中间页形成 pending；版本状态改“无”丢弃；重新提交后通过再删中间页；状态通过/驳回/删除 | C15、C16 | L2/L3、L4、L7；后台队列版本状态 | 待审时整卡状态/资料/图片必须 disabled；版本状态“无”必须只清 pending；删背面后必须新增 `t9-insert` |
| T10 复审生命周期 | 图片多页修订 → 通过；仅文本 → 通过；驳回/锁定；撤回；重提；通过后隐藏/恢复 | C17–C22 | L1、L4 live/draft diff、L2/L3 | L4 diff 同时覆盖 live+draft；L1 只看 draft 面，L2/L3 只看 live |

### 3.3 不再单独执行的重复项

- T2 合并 C2/C3/C4：2 页、4 页、新建旋转在同一张卡的增页链路中完成。
- T3 合并 C5–C8：都是整组媒体提交或自动撤回，只保留一条属主编辑链。
- T9 合并 C15/C16 及 C14 的锁定/解锁：管理窗媒体操作与整卡状态共用入口。
- T10 合并 C17–C22：复审的图片、文本、驳回/锁定、撤回、重提、可见性用同一张已发布卡推进。
- L3 的图片渲染由 L2 覆盖；L7 的媒体渲染由 L4 覆盖，均只保留各自独有的数据/绑定检查。
- C2 的 2 页状态不另开卡；但 1 页无背面、4 页中间页身份必须分别保留。

### 3.4 新增缺失检查

- L5/L6/L7 各用一张单页卡确认没有幽灵背面（可复用 T1/T7 夹具）。
- L4/L5/L6/L7 队列 `NamecardMediaPreview`：front=第一页、back=最后一页、pageId/URL 不重复、页数角标等于完整页集。
- 管理端 pending 时：整卡状态 Select disabled；资料/图片/归属 disabled；直接 API 提交返回 blocked。
- `cardArtworkView` 的 public/exchange/owner/admin URL 各做一次契约检查；exchange UUID alias 必须命中已注册路由。
- 同一槽位连续旋转两次，第二次必须换版本；未旋转槽位版本不变。
- L4 diff 同时显示 live 和 draft；不要用只显示 pending 的面去覆盖 live。

## 4. 覆盖替代记录规则

在执行记录中写：

```text
C3 = covered-by T2 (L2 fullscreen 4-page; L4 first review)
L3 image = covered-by L2 (same public route, same card/pages)
L7 media = covered-by L4 (admin live route already exercised)
```

禁止：

- 用 pending 面覆盖 live；
- 用 4 页覆盖 1 页；
- 用 owner 覆盖 public；
- 用列表瓦片覆盖全屏；
- 用 API 200/src/对象存在代替 DOM 解码。

## 5. 用例覆盖映射

| 用例 | 链路 | 用例 | 链路 |
| --- | --- | --- | --- |
| C1 | T1 | C12 | T5 |
| C2 | T2 | C13 | T7 |
| C3 | T2 | C14 | T8（锁定/解锁见 T9） |
| C4 | T2 | C15 | T9 |
| C5 | T3 | C16 | T9 |
| C6 | T3 | C17 | T10 |
| C7 | T3 | C18 | T10 |
| C8 | T3 | C19 | T10 |
| C9 | T4 | C20 | T10 |
| C10 | T4 | C21 | T10 |
| C11 | T6 | C22 | T10 |

## 6. 遗漏与风险

1. **管理端中间页旋转的索引**：`rotations.middles` 与 `media_order` 的中间槽位一一对应，末尾的空转
   会保留以避免下标错位；测试时用至少 4 页卡并旋转最后一张中间页，确认背面没有被误转。
2. **单面卡的 `null`/`undefined` 背面**：七个列表与四个窗口都要看一次单面卡，确认不会渲染
   幽灵背面或必 404 的占位图（响应里背面可能是 `null`，也可能整个字段缺席）。
3. **补充/认领的「旋转」与审批落库是两条路径**：旋转生成页面对象后，必须在审批完成时把
   `pages` 一起提交（claim/supplement completion），否则公开面仍是旧图；C11/C12 必须刷新后复核。
4. **投稿审核通过要把 pending 页提升为 live**：`publishStagedRevision` 现在会清掉旧 live 页并
   把 pending 页整体提升（已有 `fudaba.test.ts` 回归用例）；C14 仍要刷新墙与主页确认不是旧版本。
5. **`pendingPages` 只在属主详情/编辑窗可见**：公开列表即便卡有待审图也必须显示线上版本；
   用同一张卡在 L1 与 L2 对照检查。
6. **页数边界**：1 页、2 页、3 页、>3 页的角标与页签逻辑不同；C1/C2/C3 已覆盖，回归时不要
   只测双面卡。
7. **旧数据回退已删除**：P4 已删除 `fudaba_card_media`、旧 key 列与旧读取回退
   （`20261112120000_namecard_media_retire.sql`、`20261112140000_namecard_retire_card_key_columns.sql`），
   不存在「只有列、没有页行」的回退路径；该维度退役，不再作为验收项。
8. **不改变媒体的操作不必重复看图片**：锁定/解锁、仅文本补充、反馈、非公开可见（改回后）都只
   验证列表与状态；图片断言沿用同一张卡的上一次状态即可。
9. **缓存**：同一槽位连续旋转两次，第二次必须拿到新版本；`?w` 缓存键包含页面版本，若第二次
   仍显示第一次的图，说明版本没有变化或缓存头错误。
10. **删除后的孤儿对象**：P5 引用集 GC 尚未上线，删除/替换后的旧对象仍留在存储里；本验收只看
   界面，不把「对象仍存在」当失败。

11. **复审驳回/锁定后的 pending 页**：驳回只改审核状态，不清 pending 页行。C19/C21 要重点确认：
    驳回后重新提交、或驳回后只改文本再提交时，旧 pending 页不能混进新的待审集合；若出现旧图回流，
    需要补一步「驳回时丢弃 pending 页」的清理。
