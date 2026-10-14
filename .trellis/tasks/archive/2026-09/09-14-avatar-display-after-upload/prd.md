# 修复头像上传后仍显示占位符

## Goal

用户上传头像后，普通 Web 与已安装 App 中所有当前账户头像应立即显示服务端返回的新头像，不需要刷新页面或重新登录，同时保持头像对象的私有访问控制。

## Background

- `ProfileEditor.uploadAvatar()` 已把上传成功响应中的 `profile` 传给页面的 `onSaved()`。
- `CommunityExchangeMePage.saveProfile()` 目前只更新页面局部资料状态，没有同步 `PlatformSessionProvider`。
- 顶部账户按钮和账户弹层资料区都读取 `platform.session.profile.avatarUrl`，因此会同时保留旧头像状态。
- API 已将头像对象键写入 PostgreSQL，并通过资料与会话响应生成版本化的 `/api/platform/me/avatar?v=<updated_at>` URL；当前没有发现与现场现象相符的持久化缺陷。
- 用户确认普通 Web 与已安装 App 都属于本次范围。
- 打包 App 使用跨源 Platform Bearer 认证。直接 `<img src>` 不经过共享 API 客户端，无法附加 token；认证 Blob 请求若跟随现有 `307` 到 RustFS、R2 或 S3，还会依赖仓库尚未配置的 Tauri origin 对象存储 CORS。

## Requirements

- R1. 头像上传成功后，页面局部资料状态与当前全局 Platform session 必须使用同一个服务端 `profile` 响应更新。
- R2. session 更新必须按 account ID 限定当前账户，并保留 account、认证或受限状态及其他会话字段；延迟返回的旧账户写入不得污染新会话，也不得取消正在进行的 reload 或 logout。
- R3. 顶部账户按钮、展开后的账户资料区、Web 资料导航和 App 账户页必须显示当前头像；上传失败、头像缺失或图片加载失败时继续使用现有错误或首字母 fallback。
- R4. 普通同源 Web 与外部 OAuth 头像继续直接使用安全媒体 URL。只有跨源 Bearer 模式下由 IMSWeb API 管理的当前用户头像才通过固定 Platform Blob 端点加载。
- R5. App 头像 Blob 请求必须复用 `platformApiClient` 的 Bearer、401 刷新重放和错误策略，不得把长期 token 放入 URL，也不得向任意第三方头像地址发送 Platform 凭据。
- R6. `GET /api/platform/me/avatar` 必须在 API 鉴权后返回受保护头像字节，不再要求 App 跟随对象存储跨源重定向。其他对象读取继续使用现有签名 URL 行为。
- R7. 认证媒体加载必须处理请求取消、组件卸载、头像 URL 更新、迟到响应、临时对象 URL 释放和加载失败，避免旧请求覆盖新头像或泄漏 Blob URL。
- R8. 修复不得绕过共享 API facade、JSON schema、CSRF、上传验证、对象存储保护、服务端乐观并发或非 JSON 边界登记。
- R9. 增加回归测试覆盖 session 同步、两个已报告的 Web 位置、App 认证媒体加载、API 字节代理与现有失败行为。

## Acceptance Criteria

- [x] AC1. 普通 Web 上传头像成功后无需刷新，顶部账户按钮显示新头像。
- [x] AC2. 打开账户弹层后，资料区显示与顶部一致的新头像，不再显示首字母占位符。
- [x] AC3. Web 资料页继续显示上传响应中的新头像，profile `updatedAt` 可用于下一次乐观并发写入。
- [x] AC4. session 同步只更新同一 account ID 的 profile；account、token、认证或受限状态保持不变，reload、logout 或账户切换不会被迟到的 profile 响应覆盖。
- [x] AC5. 已安装 App 上传或重新进入账户页后，通过 Platform Bearer 认证加载受保护头像，API 响应头像字节而不是把客户端重定向到对象存储。
- [x] AC6. 外部 OAuth 头像仍直接加载；无 token 的头像请求仍被拒绝，Platform token 不会发送给外部头像主机。
- [x] AC7. 头像 URL 变化或组件卸载会取消未完成请求并释放 Blob URL；迟到响应和加载失败只显示当前账户的 fallback，不显示旧图。
- [x] AC8. 头像上传失败、乐观冲突、头像缺失和对象丢失保持现有错误语义。
- [x] AC9. 相关 API、Web 单元、Web/App 浏览器测试、边界检查和生产构建通过；桌面与移动视口中头像和 fallback 无重叠或溢出。

## Out of Scope

- 头像裁剪器、编辑器或新的图片格式能力。
- 改变头像存储模型、上传大小限制或对象清理策略。
- 将所有受保护对象读取改为 API 代理或引入通用私有媒体缓存。
- 将用户头像改为公开对象、长期签名 URL 或包含 Platform token 的 URL。
- 与本问题无关的账户菜单或 App 导航重构。
