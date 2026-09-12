# Platform Auth Domain

## 范围

Platform Auth 负责平台用户的登录会话、邮箱注册、密码找回和 OAuth 登录。后台账号认证
属于独立的 `backoffice-auth` domain；个人资料属于 `platform-profile` domain。

## Capability 结构

```text
platform-auth/
  routes.ts                 # 只用 app.route(prefix, factory()) 组合 capability
  contracts/
    session.ts              # 会话 Cookie/令牌/安全事件与 session payload（跨能力共享）
    credentials.ts          # 邮箱/密码归一化与 PBKDF2 参数契约（跨能力共享）
  sessions/
    routes.ts               # 相对路径子路由
    request.ts              # 登录请求解析
    handlers/
  registration/
    routes.ts
    request.ts              # 注册与验证码请求解析
    email-verification.ts
    email-verification-cache.ts
    handlers/
  password-reset/
    routes.ts
    request.ts              # 找回请求与提交解析
    password-reset.ts
    password-reset-cache.ts
    handlers/
  oauth/
    routes.ts               # 公开登录与后台配置两个子路由工厂
    request.ts
    handlers/
```

每个 capability 按参与者、生命周期和状态不变量维护 action，并独立维护自己的
`request.ts` 模型；跨 capability 共享的会话与凭据契约住在 `contracts/`。根 route 不
承载业务流程，也不直接绑定 action handler。OAuth client
secret 只在 API runtime 和加密持久化边界内处理，Web 只接收已配置 provider 的安全摘要。

公开 URL、Cookie、session middleware 和认证响应契约保持不变。
