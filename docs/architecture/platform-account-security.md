# 平台账号安全中心架构

> 文档类型：架构
> 状态：Decision
> 权威来源：`apps/api/src/domains/identity/platform-account-security/`、`apps/api/migrations/postgresql/` 和 `apps/api/src/ports/repositories/platform.ts`

## 背景

平台账号（Platform account）目前只有匿名入口的身份能力：注册、登录、密码找回、OAuth
登录、登出、刷新。登录之后，用户能改的只有昵称、常驻城市、简介和头像。

这意味着几件事用户自己做不到：改密码、换绑邮箱、解绑 OAuth、查看自己在哪些设备登录过、
注销账号。前四项是常规账号中心的底线，最后一项在多数司法辖区是合规要求。

本设计新建 `identity/platform-account-security` domain 承载这些能力，与
`platform-auth`（匿名入口）和 `platform-profile`（展示字段）并列。

## 边界

三个 identity domain 的划分依据是**调用者的身份状态**，不是功能相似度：

| domain | 调用者 | 典型 action |
| --- | --- | --- |
| `platform-auth` | 匿名或仅持刷新凭据 | 注册、登录、找回密码、OAuth 回调、刷新、登出 |
| `platform-profile` | 已登录 | 读写展示字段与头像 |
| `platform-account-security` | 已登录，且多数 action 需二次证明 | 改密码、换绑邮箱、OAuth 绑定与解绑、会话管理、注销 |

按身份状态切分的好处是中间件链在 domain 内部保持一致：安全中心的每个写入 action 都是
`platformAuth → activePlatformMutation → platformCsrf → 限流 → handler`，与
`platform-profile/routes.ts` 相同。而 `platform-auth` 的多数 action 无法要求已登录。

「找回密码」留在 `platform-auth`、「修改密码」进安全中心，看起来割裂，但两者的信任前提
完全不同：前者用邮箱验证码替代未知的密码，后者要求出示当前密码。它们共享哈希算法和
「改密即全端下线」的事务写法，不共享入口语义。

## 能力划分

domain 采用 capability 目录。五项能力各有独立的参与者和生命周期，其中「换绑邮箱」还带
一个跨请求的状态机，符合 `apps/api/src/domains/README.md` 对 capability 化的判据。

```text
platform-account-security/
  routes.ts                      组合入口，只注册路由
  password/                      修改密码
  email/                         换绑邮箱（双向验证，有状态）
  oauth-links/                   绑定与解绑第三方登录
  sessions/                      登录设备列表与吊销
  deletion/                      账号注销
```

## 关键决策

### 决策一：注销只能软删

`platform_accounts` 被 12 个 `ON DELETE RESTRICT` 外键引用，其中包括
`fudaba_offices.owner_account_id`、`fudaba_cards.owner_account_id` 和
`fudaba_messages.author_account_id`。只要用户发过一张名片、开过一间事务所或发过一条消息，
硬删就会被数据库拒绝。

所以注销的语义是：`status` 置为 `deleted`、写入 `deleted_at`、吊销全部会话。表结构已经有
CHECK 约束强制 `(status = 'deleted') = (deleted_at IS NOT NULL)`，两者必须同一条语句写入。

软删之后账号行仍在，但读取侧已经拦得住：`hono-auth.ts` 对 `suspended` 和 `deleted` 状态
吊销会话并返回 403。

### 决策二：注销保留内容，但在写入时匿名化身份

账号注销后，用户已公开的名片和事务所**保留展示**，但一切指向本人的身份字段改为
匿名占位。交换过名片的对方不会因为对方注销而丢失自己的交换记录，这是保留内容的理由。

**匿名化在注销事务内写入，不在读取时投影。** 注销的目的就是抹除个人信息；读取时投影
会把 PII 留在库里，等于没有注销，而且只要有一个 view builder 忘了判断就会泄露。写入式
的代价是不可逆，这对注销来说是正确的语义。

**清洗范围限于平台账号自己的表。** 福大巴内容不在内，理由见下一小节。这让注销事务
完全落在 identity 域内，不需要跨域写入 community 的表。

需要清洗的列：

| 表 | 列 | 处置 |
| --- | --- | --- |
| `platform_profiles` | `display_name` | 写匿名占位（`NOT NULL`，不能置空） |
| `platform_profiles` | `home_city`、`avatar_external_url` | 置 `NULL` |
| `platform_profiles` | `bio` | 置空串（`NOT NULL DEFAULT ''`） |
| `platform_profiles` | `avatar_object_key` | 置 `NULL`，并补偿删除存储对象 |
| `platform_oauth_identities` | `provider_display_name`、`provider_avatar_url` | 置空串（两列都是 `NOT NULL DEFAULT ''`） |
| `platform_email_credentials` | 整行 | 随 `ON DELETE CASCADE` 不适用（账号行不删），需显式删除 |

第三方身份行本身不能删：`provider_code` 以 `ON DELETE RESTRICT` 引用 provider 表，而且保留
`provider_subject` 才能阻止同一个第三方账号重新注册后继承已注销账号的历史。只清展示列。

#### 福大巴名片字段不参与清洗

`fudaba_cards.producer_name` 看上去像是账号身份的副本，实际不是。它是**名片自己的用户自定义
字段**：新建时用账号显示名预填（`exchange-me-model.ts:61`），随后是一个可自由编辑的
输入框（`card-editor-fields.tsx:120`），API 按必填文本原样存储，不从 profile 取值。同一个
人可以给不同名片写不同的 P 名。

`fudaba_cards.bio` 同理，也是预填后可改。`fudaba_cards.display_name` 是名片标题，
`fudaba_offices.name` 是场所名。这四者同属一类：用户自写的名片内容，归名片所有，不归账号所有。
既然决策是注销后保留内容，把内容里的署名洗掉就自相矛盾。批量清洗会连用户刻意选的
笔名一起摧毁，而那正是交换过名片的对方用来认人的东西。

随之而来的事实要说清楚：因为有预填，从未改过这两个字段的用户，其名片上会留着注销前
的显示名和简介。这是保留内容这个决定的已知代价，不是疏漏。如果后续需要处理，正确的
做法是在注销流程里提示用户先自行修改名片署名，或走举报与人工审核，而不是注销时
一刀切。

占位串带一个由 accountId 派生的短后缀，让两个不同的已注销用户在同一个列表里不会看起来
像同一个人。这不会新增任何关联信息：`owner_account_id` 因为 `RESTRICT` 外键本来就留在行上。

### 决策三：换绑邮箱需要新表

现有两套验证码表 `platform_email_verification_codes` 和
`platform_password_reset_codes` 的主键都是 `normalized_email`，没有账号维度，也没有
「目标邮箱」的概念。

换绑要同时满足三件事：按账号定位进行中的请求、把新邮箱与账号绑定、防止两个账号并发抢占
同一个新邮箱。现表装不下，新建 `platform_email_change_requests`，主键 `account_id`，对
`target_normalized_email` 建唯一索引。

投递沿用注册验证码已有的两阶段模式（issue → send → completeDelivery / revoke），不重新
发明。

流程要求新旧邮箱都验证：旧邮箱证明发起人是账号持有者，新邮箱证明地址可达且归其所有。只验
新邮箱会让接管了会话的攻击者把账号迁走；只验旧邮箱会让用户把账号绑到一个打错字的地址上，
从而永久失去找回入口。

### 决策四：解绑必须在事务内复核剩余登录方式

`platform_oauth_identities` 的 `UNIQUE (account_id, provider_code)` 允许一个账号绑定多个
provider。解绑的风险是把最后一个登录方式解掉，账号从此无法进入。

判据是「解绑后仍至少有一种可用登录方式」：存在密码凭据，或剩余 OAuth 绑定中至少有一个
的 provider 处于 `enabled` 状态。

**`enabled` 这个限定不能省。** 被停用的 provider 登不了录，把它算作幸存者，用户就能解绑
唯一可用的那个、只留一个停用的，把自己彻底锁在门外。判据靠 `platform_oauth_identities`
JOIN `platform_oauth_providers` 落地。

复核必须拼进 DELETE 自己的 WHERE 子句，不能先查再删；否则两个并发解绑请求各自看到
「还有另一个」，然后双双成功。

这条规则由 `apps/api/tests/server/platform-oauth-unlink-repository.test.ts` 对真实 SQL 钉住。
走内存桩的契约测试盖不到它：把 `AND provider.enabled=TRUE` 从仓储里删掉，整套契约
测试依然全绿。

### 决策五：审计走 `platformSecurityEvent`，不用 `writeAudit`

`admin/audit/write-audit.ts` 从上下文里读 `backofficeUser`，没有管理员时写入
`username: 'anonymous'`，且不记录平台侧的 accountId。平台用户的操作用它审计会产出无主体
的记录。

平台侧的对位设施是 `platform_security_events` 表和 `platformSecurityEvent()` 构造器，后者
已经自动采集 requestId、客户端 IP 和 User-Agent。安全中心的每个 action 都记事件，代价是
`PlatformSecurityEventType` 这个封闭字面量联合需要扩容。

### 决策六：改密码复用「改密即全端下线」的事务

`completePasswordReset` 已经建立了正确的写法：同一批事务内改凭据、递增 `token_version`、
吊销该账号全部刷新会话。递增 `token_version` 会让所有已签发的 access token 立即失效，这是
密码泄露场景下唯一可靠的止血手段。

修改密码沿用同一模式，差别只在保留当前会话——用户刚证明了自己知道旧密码，没有理由把他自己
也踢下线。

## 需要新增的基础设施

### 数据库迁移

| 变更 | 目的 |
| --- | --- |
| `platform_refresh_sessions` 增列 `user_agent`、`ip_address`、`last_seen_at` | 设备列表需要展示这些信息。会话表现在只有 token 哈希和时间戳，无法回答「这是哪台设备」 |
| 新表 `platform_email_change_requests` | 见决策三 |

设备信息不能从 `platform_security_events` JOIN 得到。那张表是事件流，记录的是「某次登录
来自哪里」，不是「这个会话当前属于哪台设备」，两者会错位。

### 仓储方法

按能力分组，全部需要新增：

- 改密码：`findEmailCredentialByAccountId`、`updatePasswordForAccount`
- 会话：`listRefreshSessionsByAccount`、`revokeAllRefreshSessionsExcept`
  （按 id 吊销单个已存在，`revokeRefreshSession` 自带 `accountId` 归属校验）
- OAuth：`listOAuthIdentitiesByAccount`、`deleteOAuthIdentity`，以及把
  `NewPlatformOAuthStateInput.intent` 从字面量 `'login'` 放开到 `'login' | 'link'`
  （表已预留 `intent` 和 `linking_account_id` 列，只是类型层关着）
- 换绑邮箱：`changeEmailCredentialAddress`，需同步迁移
  `platform_email_credentials` 的主键并递增 `token_version`
- 注销：`softDeleteAccount`

### 类型扩展

`PlatformSecurityEventType` 增加 `auth.password.changed`、
`auth.email.change_requested`、`auth.email.changed`、`auth.oauth.linked`、
`auth.oauth.unlinked`、`auth.session.revoked`、`account.deletion_requested`。表侧只有正则
约束，不需要迁移。

## 限流

安全中心的端点都是敏感操作，必须显式登记路径级限流桶。现有 `password-reset` 的两个端点没
有专用桶，只靠全局限流和数据库冷却兜底，这个疏漏不要复制。

桶命名沿用 `rate-limit.ts` 的约定：域-动作加维度后缀，账号维度用 `-account`，IP 维度用
`-ip`。

## 实施顺序

1. 迁移与仓储方法（改动集中在共享文件，串行）
2. 改密码、会话列表与吊销（不依赖新表，可并行）
3. OAuth 解绑（依赖仓储方法，绑定通道可延后）
4. 换绑邮箱（依赖新表和投递流程，最复杂）
5. 注销（软删与匿名化清洗同事务，全部落在 identity 域自己的表内）
6. Web 端安全区块

## 相关文档

- [Domain 能力分层与编写结构](domain-capabilities.md)
- [数据库架构](database.md)
- [URL 与公共路径架构](url-paths.md)
