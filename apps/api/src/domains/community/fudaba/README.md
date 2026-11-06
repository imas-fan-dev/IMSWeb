# Fudaba Domain

## 范围

Fudaba 负责社区交换站的公开目录、匿名卡片投稿、平台用户自己的卡片和事务所精确资料、
事务所整体审核、卡片认领和卡片摆放。它不负责平台账号认证、个人资料持久化、数据库
SQL 或对象存储 provider。

## Capability 地图

| Capability | 参与者 | 当前 action 归类 |
| --- | --- | --- |
| `directory` | 公开访问者 | `list-public-series`、`list-public-offices`、`get-public-office`、`list-public-cards`、`get-map-config`、`list-map-offices` |
| `cards` | 平台用户 | `list-owner-cards`、`get-owner-card`、`create-card`、`update-card`、`delete-card`、`save-card-placement`、`remove-card-placement`、卡片媒体读写 |
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
