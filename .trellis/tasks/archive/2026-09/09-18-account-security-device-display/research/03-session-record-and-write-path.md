# 会话记录里实际有什么设备信息

## 1. 记录定义

`apps/api/src/ports/repositories/platform.ts:257-270`：

```
export interface PlatformRefreshSessionRecord {
    id: string;
    account_id: string;
    token_hash: string;
    previous_token_hash: string | null;
    csrf_hash: string;
    expires_at: number;
    created_at: number;
    updated_at: number;
    revoked_at: number | null;
    user_agent: string | null;
    ip_address: string | null;
    last_seen_at: number | null;
}
```

设备相关字段只有 `user_agent` 与 `ip_address`，两者都可空。没有 device id、没有 client type、没有 app 标识、没有型号字段。

DB 列由 `apps/api/migrations/postgresql/20260902120000_platform_session_devices.sql` 追加，CHECK 约束是 `length(user_agent) <= 1024`。该迁移注释明确写了「三列都可空：迁移之前建立的会话没有这些数据，回填也无从谈起」，即历史行 `user_agent` 为 NULL。

## 2. 写入路径

`user_agent` 的写入只有一个来源：`apps/api/src/domains/identity/platform-auth/contracts/session.ts`。

- `:136-140` `boundedHeader(value, maximum)`：`value?.trim()`，空则返回 `null`，否则 `slice(0, maximum)`。
- `:143-151` `platformSessionDevice(c)`：

```
userAgent: boundedHeader(c.req.header('user-agent'), 1024),
ipAddress: boundedHeader(getClientAddress(c), 64)
```

既有事实：**存的就是请求头里的原始 UA 字符串，trim 后按 1024 截断，不做任何解析，不追加任何标记。**

- `:204` `establishPlatformSession(...)`，`:242` 调用 `createRefreshSession({ ... , ...platformSessionDevice(c), event: ... })`。
- 仓储 SQL 在 `apps/api/src/infra/db/repositories/platform-account-repository.ts:1427`（`createRefreshSession`），INSERT 列在 `:1433`，`user_agent` 参数在 `:1447`（`input.userAgent ?? null`）。
- 输入类型 `NewPlatformRefreshSessionInput` 在 `platform.ts:295-310`，注释写明 `userAgent` / `ipAddress` 可选，因为「imported and bootstrap sessions have no request behind them」。

## 3. 三个建立会话的调用方

| 位置 | 场景 |
| --- | --- |
| `apps/api/src/domains/identity/platform-auth/sessions/handlers/login.ts:157` | 邮箱密码登录 |
| `apps/api/src/domains/identity/platform-auth/registration/handlers/register.ts:90` | 注册成功后自动建会话 |
| `apps/api/src/domains/identity/platform-auth/oauth/handlers/oauth-login.ts:162` | 第三方登录回调 |

三条路径都走同一个 `establishPlatformSession`，所以捕获 UA 的行为完全一致。`login.ts` 本身不直接写 `user_agent`，它只是发起调用。

## 4. 刷新会不会更新设备信息

不会。`rotateRefreshSession` 的端口输入在 `platform.ts:391-400`，只有 token hash、csrf hash、expires、updatedAt、event，没有 `userAgent` / `ipAddress`。对应 SQL 在 `platform-account-repository.ts:1526-1528`，`SET` 子句为 `previous_token_hash`, `token_hash`, `csrf_hash`, `expires_at`, `updated_at`, `last_seen_at`。

结论：一台设备登录后即使用 IP 变了，列表里的 `ipAddress` 仍是登录当时那个。`lastSeenAt` 会随刷新推进。

## 5. 会话列表的暴露面

`apps/api/src/domains/identity/platform-account-security/sessions/session-device-view.ts:13-25` 把记录投影成契约对象，`userAgent: session.user_agent`（`:19`）原样透传，`current: session.id === currentSessionId`（`:17`）。列表中 `current` 来自访问令牌里的 `sessionId`（`list-sessions.ts:9-10` 用 `claims.sessionId`），不是设备指纹。

安全事件表 `platform_security_events` 也存了 UA（`platform-account-repository.ts:1457`、`:1552` 等），但那是另一张表，设备列表不读它。

## 6. 是否还有别的设备标识

在对 `apps/api/src` 与 `apps/web/app` 的 grep 中，与「客户端类型」沾边的只有请求头 `X-IMS-Auth-Mode: bearer`：

- Web 侧定义：`apps/web/app/lib/api/platform-token-store.ts:17-18`，发送逻辑在 `apps/web/app/lib/api/request.ts:66-73`。
- API 侧读取：`contracts/session.ts:107-109` `wantsPlatformBearerTokens(c)`。

既有事实：这个头只决定响应体是否返回 token，**没有写进 `platform_refresh_sessions`**，所以设备列表无法通过它区分浏览器与打包客户端。它是「端类型」唯一现成的线上信号，但当前不落库。

## 7. 推断（非既有事实）

- 解析逻辑能拿到的信息量上限就是那条 UA 字符串（或 NULL）。想在列表里可靠区分「iOS 应用 / iOS 浏览器」，仅凭现有数据只能靠 UA 里的 WebView 特征启发式判断，见 `04-tauri-vs-browser-detection.md`。
- 若要 100% 可靠，需要写入侧配合：给会话行加一个 client kind 列，或让 Tauri 外壳带一个自定义 UA / 自定义头。两者都超出「仅展示层解析」的范围，属于后续可选方案。
