# Platform OAuth Provider 运维

> 文档类型：运维
> 状态：Active
> 权威来源：`packages/contracts/src/platform/`、`apps/api/src/infra/oauth/platform-oauth-client.ts`、`apps/api/src/infra/db/repositories/platform-account-repository.ts`、`apps/api/migrations/postgresql/20260901140000_dynamic_platform_oauth_providers.sql`
> 适用环境：Web 端 Platform 登录与后台 OAuth provider 管理
> 前置条件：PostgreSQL migration 已应用，最高管理员可访问 `/admin/platform/oauth`
> 回滚边界：先停用异常 provider；已被身份绑定或未完成登录状态引用的 provider 不得删除
> 验证方法：后台 provider 列表、公开 provider API、授权跳转与 callback 登录流程

Platform OAuth provider 是 PostgreSQL 中的动态配置。Google 和 GitHub 由 migration 写入初始数据，
但不属于代码中的固定枚举。最高管理员可新增、编辑或删除其他 OAuth 2.0 / OpenID Connect
provider，修改后无需重启 API。

## 配置模型

每个 provider 必须使用稳定的 lowercase code。code 保存后不可修改；显示名称、按钮主题色和图标
可独立编辑。`google` 与 `github` 图标使用项目内品牌图标，其他值必须是受支持的 Lucide 图标名称。
按钮主题色使用六位 hex 颜色，Web 根据颜色亮度选择黑色或白色前景。

协议配置包括：

- Authorization、Token 和 UserInfo endpoint；
- scopes、`client_secret_post` 或 `client_secret_basic`；
- 可选 PKCE S256；
- UserInfo response 中 subject、显示名称、显示名称回退值和头像 URL 的点分字段路径；
- Client ID、Client secret 和 redirect URI。

公开登录页只显示同时满足 enabled、Client ID、Client secret 和 redirect URI 完整的 provider。后台
不会返回 Client secret；编辑时 secret 留空表示保留现值。停用 provider 不删除配置或已有身份绑定，
应作为故障回滚的第一选择。

通用 runtime 期望 Token endpoint 返回 `access_token`，支持 JSON 和 form-encoded response；随后以
Bearer token 请求 UserInfo endpoint。当前模型不支持自定义请求头、provider discovery、任意 token
字段映射或脚本化 profile transform。需要这些能力的 provider 必须先扩展共享 contract 和 runtime，
不得只在后台填写近似配置。

## 安全边界

OAuth endpoint 必须是无凭据、无 fragment 的公开 HTTPS URL；可保留 provider 要求的固定 query。
API 在保存配置及发起
Token/UserInfo 请求前检查 hostname 和 DNS 解析结果，拒绝 loopback、私网、link-local、保留和
multicast 地址；provider HTTP redirect 也被拒绝。redirect URI 同样必须使用公开 HTTPS。

本地开发只有同时满足以下条件时，才可使用 loopback HTTP endpoint 和 redirect URI：

```sh
NODE_ENV=development
IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS=1
```

该例外仅接受 loopback host。生产环境忽略该开关，不能用它允许内网或明文 provider。
`IMS_PLATFORM_OAUTH_REQUEST_TIMEOUT_MS` 控制 Token/UserInfo 请求超时，范围由 API config parser
验证。

## 新增与变更

1. 在 `/admin/platform/oauth` 添加 provider，先保持 disabled。
2. 填写完整 endpoint、scope、client auth、PKCE 和 profile path。
3. 保存 Client ID、Client secret 和 redirect URI，再启用公开入口。
4. 从公开登录页确认按钮图标和主题色，并完成真实授权、callback 和 profile 映射验证。
5. 配置异常时先停用；修正后再启用，不应删除并重建同一 code。

更新使用 `updatedAt` revision CAS。后台收到版本冲突后必须刷新最新数据再提交，不得覆盖其他管理
员的修改。

## 删除

删除同样要求当前 `updatedAt`。数据库对 `platform_oauth_identities` 和未消费
`platform_oauth_states` 保持 `ON DELETE RESTRICT`；存在引用时 API 返回明确的 in-use 冲突。
管理员应停用 provider，并等待登录状态过期或按身份迁移方案处理绑定。不得绕过外键直接删除行。
