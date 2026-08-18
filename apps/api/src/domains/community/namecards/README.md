# Namecards Domain

## 范围

Namecards 负责制作人名片的访客投稿、公开名片墙、表情反应和后台审核。注册用户的
Fudaba 名片、认领与摆放属于同级的 `fudaba` domain；跨域媒体读取属于 `delivery/media`。

`reactions` 原是独立 domain，因表情反应始终作用于名片，已并入本 domain 成为
capability。

## Capability 结构

```text
namecards/
  routes.ts                 # 只用 app.route(prefix, factory()) 组合 capability
  request.ts                # 跨能力共享的名片请求模型与校验
  response.ts               # 跨能力共享的名片响应 DTO
  media-assets.ts           # 名片对象键与公开 URL 策略
  namecard-image.ts         # 上传图片解码与规格策略
  ttl-purge.ts              # 过期投稿清理策略
  public-cards/
    routes.ts               # /api/cards、/api/card/:id
    handlers/
  submissions/
    routes.ts               # /api/uploadNameCard、/api/namecards/submissions/*
    submission-guards.ts
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

公开列表与详情、访客投稿与撤回、后台审核、表情反应各自拥有子路由与 handler；
`request.ts`/`response.ts` 在 domain 根作为跨能力共享模型维护，reactions 独立维护自己
的请求与响应模型。外部 URL、鉴权 middleware 顺序与响应契约保持不变。
