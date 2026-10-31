# Fudaba Domain

## 范围

Fudaba 负责社区交换站的公开目录、匿名卡片投稿、平台用户自己的卡片和事务所精确资料、
事务所整体审核、卡片认领和卡片摆放。它不负责平台账号认证、个人资料持久化、数据库
SQL 或对象存储 provider。

## Capability 地图

| Capability | 参与者 | 当前 action 归类 |
| --- | --- | --- |
| `directory` | 公开访问者 | `list-public-series`、`list-public-offices`、`get-public-office`、`get-public-wall`、`list-public-cards`、`get-map-config`、`list-map-offices` |
| `cards` | 平台用户 | `list-owner-cards`、`get-owner-card`、`create-card`、`update-card`、`delete-card`、`save-card-placement`、`reject-legacy-placement`、`remove-card-placement`、卡片媒体读写 |
| `guest-submissions` | 匿名访问者 | `create-guest-submission`、`get-guest-submission`、`serve-guest-submission-media`、`withdraw-guest-submission` |
| `offices` | 平台用户 | `list-owner-offices`、`get-owner-office`、`create-office`、`update-owner-office`、归档/恢复、封面媒体 |
| `locations` | 平台用户/后台操作员 | 地点搜索与逆地理编码；按操作者使用对应认证边界 |
| `claims` | 平台用户/系统 | `platform-card-claims` 及后续认领 action |
| `moderation` | 后台操作员 | `admin-offices`、`review-office` 整体审核与编辑、私有封面读取；卡片与认领审核 |

地图公开读取属于 `directory` 投影；事务所整体审核属于 `moderation`；卡片和办公室媒体跟随
实体能力归档，不建立一个吞掉所有上传逻辑的 `media` 子域。

事务所坐标只有 owner office 的 WGS84 原点一个来源，公开投影始终为 `exact`。新建、资料更新、
封面变化和恢复都进入 `pending`；名录、搜索、详情、地图与关联公开操作统一检查整体发布资格。
后台以 office 修订号加审核锁 CAS，拒绝需理由；通过时安全晋升待审封面并与审计原子完成。
已发布事务所可经相同 CAS 撤回为待审核，撤回与审计原子保存，保留资料和已有封面对象。
计数不触发复审，同值保存保留已有结论。旧的独立位置端点已下线，旧表仅作历史保存；迁移不会
将网格坐标冒充精确点，已有事务所统一重新审核。JSON wire 以 contracts 的 `office-review` 为准。

## 当前目录

```text
fudaba/
  access-policy.ts          # 公开读/写/地图门控与私有响应头
  routes.ts                 # 只用 app.route(prefix, factory()) 组合 capability
  card-media-assets.ts      # guest/legacy 卡片对象与缩略图策略
  contracts/
    card.ts                 # 卡片 ID/revision 解析与 owner 卡片视图（跨能力共享）
    office.ts               # 办公室 ID 校验
    location.ts             # exact 公开坐标投影与历史坐标工具
    claim.ts                # 认领视图（claims/moderation 共享）
  directory/
    routes.ts               # 相对路径子路由
    request.ts              # 公开查询/游标/地图查询解析
    response.ts             # 公开办公室/卡片/地图视图
    handlers/
  guest-submissions/
    routes.ts               # Fudaba 匿名投稿主路由
    request.ts
    response.ts
    submission-guards.ts
    ttl-purge.ts
    image.ts
    handlers/
  cards/
    routes.ts
    request.ts              # 卡片字段与摆放解析
    response.ts             # 摆放视图
    handlers/
  offices/
    routes.ts
    request.ts              # 办公室字段/revision/Idempotency-Key 解析
    response.ts             # owner 办公室视图与冲突响应
    office-policy.ts        # slug 派生策略
    handlers/
  locations/
    routes.ts               # 仅地点搜索与逆地理编码
    place-reverse.ts        # 逆地理编码服务商解析与选点坐标保留
    handlers/
  claims/
    routes.ts
    request.ts
    response.ts
    handlers/
  moderation/
    routes.ts
    request.ts              # 事务所/卡片/认领审核解析
    response.ts             # 审核视图
    handlers/
```

每个 capability 独立维护 `request.ts` 与 `response.ts` 模型；跨能力共享的解析器与视图
住在 `contracts/`。能力之间不能直接导入对方 handler/route；URL 与认证/CSRF 中间件由
`routes.ts` 组合声明。响应字段由 contracts 拥有，持久化状态与原子命令由 repository port 拥有。

## V1 名片墙与客户端兼容

墙面位置使用固定逻辑坐标；观察窗的平移、缩放和窗口尺寸只保存在客户端，不写回公共
布局。加载范围为观察窗宽高各 1.5 倍，前端自动读完该区域的有界分页并去重，移出缓冲区
后替换旧区域内容。墙面和当前区域列表没有用户可见的分页或批次，也不会停在首批 50 张。
实现以 [观察窗](../../../../../web/app/pages/community/exchange/wall-viewport.tsx) 和 [支部页面](../../../../../web/app/pages/community/exchange/community-office-page.tsx) 为准。

默认与复位缩放为 80%。电脑点击选中墙面后，滚轮围绕鼠标位置缩放；手机双指缩放墙内
视野。选中墙面后点击名片会选中该名片，有写入资格时同时进入布置；再点已选名片进入
大图。完成布置会清除名片选择并保持墙面选中，下一次点击沿用同一流程。图片的原生
拖拽与文字选区拖拽禁用。移动名片保存后保持观察窗位置，拖动结束不会误打开大图。
布置操作仍受本人资格限制；移除仅删除挂墙关系，既有交换引用限制继续有效。

### 持久化与迁移

[世界坐标迁移](../../../../migrations/postgresql/20261010120000_fudaba_wall_world.sql) 为前向迁移，沿用仓库迁移入口、Core/Story 对账门禁及迁移账本，不修改历史
迁移。初始画布为 1600×900，旧位置按 `x = 160 + position_x × 12.8`、
`y = 120 + position_y × 6.6` 回填；保留名片 ID、挂墙关系、交换引用、旋转、排序和版本。
成功的位置写入按固定区块原子扩展边界，失败或重复贴入不会扩墙；移除后不自动缩墙。

世界坐标是唯一写入权威。旧读取保留 0–100 百分比与旧层级上限的兼容投影；旧百分比
写入明确返回布局版本冲突，不能覆盖新布局。历史导入未提供世界坐标时由数据库触发器
映射到固定初始画布；后续普通更新不能以旧百分比覆盖世界坐标。新布局写入使用布局
版本与 expectedRevision，冲突或失败由客户端提示并回到服务端位置。契约以 [墙面 contracts](../../../../../../packages/contracts/src/fudaba/wall.ts)
为准，实际权限和事务以仓储实现为准。

代码回退时保留新增字段和墙面数据，不能把世界坐标压回百分比或删除新位置。旧客户端
只能读取兼容投影并收到旧写入拒绝；超出原画布的布局仍应使用新客户端完整查看。生产
迁移、部署及原生设备安装不包含在本地 V1 快照验收中。

### 本地验收范围

[墙面数据库回归](../../../../tests/server/fudaba-wall-v1.test.ts) 覆盖实际 PostgreSQL 上的区域读取、稳定游标、并发版本冲突、原子扩墙、权限、
旧数据回填、迁移重跑与交换引用。[名片墙浏览器回归](../../../../../web/tests/e2e/community-exchange.spec.ts) 与 [观察区域回归](../../../../../web/tests/e2e/office-wall-window.spec.ts) 覆盖桌面和手机浏览器的
布置闭环、相机不联动、拖动与缩放，以及区域超过首批数量后完整加载；浏览器接口使用
契约约束的测试数据。打包 App 的共享用例在 Chromium 手机视口验证，不代表原生
WKWebView 或 Android WebView 验收。

App 现有整页禁缩放策略见 [app-target.ts](../../../../../web/app/lib/app-target.ts)，墙内缩放独立实现。该全局策略会触发整页
无障碍检查的 `meta-viewport` 失败；V1 保留原有产品设置和检查断言，并单独记录这一
既有失败，不能据此宣称全部 App 无障碍检查通过。
