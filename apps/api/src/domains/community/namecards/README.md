# Namecards Domain

## 范围

Namecards 是制作人名片旧 API 的兼容域，目前保留公开名片墙、表情反应和旧后台审核。
匿名投稿由 `fudaba/guest-submissions` 独立提供；注册用户卡片、认领与摆放也属于
`fudaba` domain。跨域媒体读取属于 `delivery/media`。

`reactions` 原是独立 domain，因表情反应始终作用于名片，已并入本 domain 成为
capability。

## Capability 结构

```text
namecards/
  routes.ts                 # 只用 app.route(prefix, factory()) 组合 capability
  request.ts                # 兼容路由共享的名片请求模型与校验
  response.ts               # 兼容路由共享的名片响应 DTO
  public-cards/
    routes.ts               # /api/cards、/api/card/:id
    handlers/
  moderation/
    routes.ts               # /api/admin/cards/*
    handlers/
  reactions/
    routes.ts               # /api/emojis、/api/reactions
    request.ts
    response.ts
    handlers/
```

公开列表与详情、后台审核、表情反应各自拥有子路由与 handler；`request.ts`/`response.ts`
在 domain 根作为兼容模型维护，reactions 独立维护自己的请求与响应模型。
