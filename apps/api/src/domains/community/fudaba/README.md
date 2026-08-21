# Fudaba Domain

## 范围

Fudaba 负责社区交换站的公开目录、平台用户自己的卡片和办公室、位置提交、卡片认领、
卡片摆放以及后台审核。它不负责平台账号认证、个人资料持久化、数据库 SQL 或对象存储
provider。

## Capability 地图

| Capability | 参与者 | 当前 action 归类 |
| --- | --- | --- |
| `directory` | 公开访问者 | `list-public-series`、`list-public-offices`、`get-public-office`、`list-public-cards`、`get-map-config`、`list-map-offices` |
| `cards` | 平台用户 | `list-owner-cards`、`get-owner-card`、`create-card`、`update-card`、`delete-card`、`save-card-placement`、`remove-card-placement`、卡片媒体读写 |
| `offices` | 平台用户 | `list-owner-offices`、`get-owner-office`、`create-office`、`update-owner-office`、归档/恢复、封面媒体 |
| `locations` | 平台用户 | `get-owner-location`、`save-owner-location`、`withdraw-owner-location` |
| `claims` | 平台用户/系统 | `platform-card-claims` 及后续认领 action |
| `moderation` | 后台操作员 | `admin-card-reviews`、`list-location-reviews`、`review-location` |

地图公开读取属于 `directory` 投影；位置审核属于 `moderation`；卡片和办公室媒体跟随
实体能力归档，不建立一个吞掉所有上传逻辑的 `media` 子域。

## 当前目录

```text
fudaba/
  access-policy.ts          # 公开读/写/地图门控与私有响应头
  routes.ts                 # 只用 app.route(prefix, factory()) 组合 capability
  contracts/
    card.ts                 # 卡片 ID/revision 解析与 owner 卡片视图（跨能力共享）
    office.ts               # 办公室 ID 校验
    location.ts             # 区域化坐标投影
    claim.ts                # 认领视图（claims/moderation 共享）
  directory/
    routes.ts               # 相对路径子路由
    request.ts              # 公开查询/游标/地图查询解析
    response.ts             # 公开办公室/卡片/地图视图
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
    routes.ts
    request.ts
    response.ts
    handlers/
  claims/
    routes.ts
    request.ts
    response.ts
    handlers/
  moderation/
    routes.ts
    request.ts              # 位置/卡片/认领审核解析
    response.ts             # 审核视图
    handlers/
```

每个 capability 独立维护 `request.ts` 与 `response.ts` 模型；跨能力共享的解析器与视图
住在 `contracts/`。能力之间不能直接导入对方 handler/route；外部 URL、middleware 顺序、
响应字段和 repository port 保持不变。
