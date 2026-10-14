# 头像上传后显示链路调查

## 现象对应

用户报告上传头像后，顶部账户按钮与展开后的资料区域仍显示首字母 `T`。这两个位置都由 `apps/web/app/components/platform/platform-account-menu.tsx` 渲染，并读取 `platform.session.profile.avatarUrl`。用户随后确认普通 Web 与已安装 App 都属于本次修复范围。

## Web 状态链路

1. `apps/web/app/pages/community/exchange/me/profile-editor.tsx` 的 `uploadAvatar()` 调用 `uploadPlatformAvatar()`，成功后把响应中的 `result.profile` 交给 `onSaved()`。
2. `apps/web/app/pages/community/exchange/me/community-exchange-me-page.tsx` 的 `saveProfile()` 只更新页面局部 `WorkspaceState.profile`，没有调用 session 更新能力。
3. `apps/web/app/components/platform/platform-session-provider.tsx` 独立持有全局 `PlatformSession`。只有初始化、登录、登出、`acceptSession()` 或 `reload()` 会更新该状态。
4. `PlatformAccountMenu` 的顶部触发器与弹层资料区都读取旧 session，因此同时退回首字母占位符。
5. `/account/me/profile` 复用同一资料编辑器。返回 `apps/web/app/pages/account/me/account-me-page.tsx` 后也从旧 session 读取头像。

最小且并发安全的同步方式是在 provider 增加 `acceptProfile(accountId, profile)`。它应使用函数式更新，只修改匹配账户的 session profile，不递增 request generation。直接复制 render-time session 后调用 `acceptSession()` 可能覆盖较新的 token/account 字段，或取消正在进行的 reload/logout。

最终审查还确认，provider fence 只能保护全局 session，不能单独保护页面局部 profile。`CommunityExchangeMePage` 必须按 live account scope 重建内部 workspace，并让编辑器回调捕获 workspace generation；旧 save/upload/remove/reload 无论成功还是失败，都不能再修改父级 profile、编辑器 draft、反馈、toast、写入能力或下一次写入使用的 `updatedAt`。

## 后端持久化核对

后端没有发现与现场现象相符的持久化缺陷：

- `apps/api/src/domains/identity/platform-profile/handlers/upload-avatar.ts` 将转换后的 WebP 写入受保护对象存储，再通过 `updateProfileAvatarForOwner()` 保存 `avatar_object_key`。
- `apps/api/src/domains/identity/platform-profile/profile-view.ts` 在对象键存在时返回 `/api/platform/me/avatar?v=<updated_at>`。
- 后续资料和会话读取都会从 PostgreSQL 重建该 `avatarUrl`。
- 现有 API 合约测试覆盖受保护上传、对象键持久化和头像读取，但缺少上传响应、会话同步与 App 加载的完整断言。

## App 认证媒体边界

打包 App 使用跨源 Platform Bearer 认证。`apps/web/app/lib/api/request.ts` 只会为 `platformApiClient` 请求附加 `Authorization` 和 `X-IMS-Auth-Mode`；直接 `<img src>` 不经过该客户端。

`platformApiClient` 和共享响应层已经支持：

- Platform Bearer token；
- `401` 刷新与一次请求重放；
- `responseType: "blob"`；
- 通过 Alova `Method.abort()` 取消请求。

因此 Web 可以新增固定路径的 `getPlatformAvatar()` Blob 方法，并将 Blob 转成可撤销的临时对象 URL。固定路径很重要：`avatarUrl` 也可能是外部 OAuth 地址，不能把 Platform token 附加到调用方提供的任意 URL。

## 对象存储重定向限制

`apps/api/src/utils/http/object-read-response.ts` 在存储适配器实现 `createReadUrl` 时返回 `307`。正常本地 RustFS 和生产 R2/S3 都走这条路径。API 本身允许 Tauri origin，但对象存储层没有等价保证：

- `deploy/r2-public-cors.json` 不包含 Tauri origin；
- RustFS 初始化没有设置 CORS；
- 仓库没有通用 S3 Tauri CORS 配置。

App 的认证 Blob 请求即使通过第一跳 API 鉴权，也不能可靠读取跨源签名重定向的最终响应。因此 `/api/platform/me/avatar` 应选择 API 字节代理模式，继续使用现有 `storage.get()` 和 `storedObjectResponse()`。其他对象读取保留默认签名重定向。

对象存储端口目前以 `Uint8Array` 返回数据，没有流式或 metadata-only 读取。头像上传上限为 5 MiB 且会转换为 WebP，因此本次接受有界缓冲；通用流式私有媒体代理不在范围内。

## 回归测试重点

- session provider 只更新匹配账户，并让 reload/logout/account switch 胜出；
- 页面 workspace 同样拒绝账户切换或新 generation 后完成的旧 save/upload/remove/reload，包括失败反馈和 feature-closed 副作用，不保留旧 profile revision；
- 上传响应同时更新局部完整 profile revision 与全局 session profile；
- 顶部触发器和账户弹层共享同一新头像来源；
- App 仅对 IMSWeb 管理的头像使用固定认证 Blob 请求；
- 外部 OAuth URL 直接加载且不接触 token；
- URL 或 account ID 变化和卸载会 abort 请求并 revoke Blob URL，且相同 URL 的账户切换不得复用旧 Blob；
- 头像 API 以 Bearer 和 cookie 返回私有字节，并在成功、Range、missing-key 和 dangling-object 响应中保留 GET/HEAD/Range/404/401 与私有安全头语义，匿名 HEAD/Range 在读取存储前被拒绝；
- App browser test 通过 `localhost` 页面与 `127.0.0.1` API 强制 Bearer 模式，在 Chromium iPhone/Android 和 WebKit portrait viewport 断言固定 API 字节请求、`blob:` 来源和零对象存储请求；
- `objectReadResponse()` 的其他调用方仍返回原有签名重定向。
