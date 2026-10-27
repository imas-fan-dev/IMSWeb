# 帐号与个人工作区

[返回前端总索引](../../README.md)

本目录面向 Platform 用户，包含登录、注册、密码找回、安全中心，以及个人资料、名片、
收藏、事务所和认领管理。后台操作员身份由
[AdminLayout](../../layouts/admin-layout.tsx) 与 Backoffice 客户端承担，和本目录分离。

## 能力与职责地图

| 参与者与能力              | 关键实现路径                                                                                                                                                             | 职责                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 访客登录、注册与找回密码  | [login](login/)、[register](register/)、[reset](reset/)、[认证表单](components/account-auth-form.tsx)                                                                    | 认证页面状态与共享表单编排                                         |
| App 用户 OAuth 登录与回跳 | [App OAuth 区块](components/platform-oauth-app-section.tsx)、[登录 hook](components/use-platform-oauth-app-login.ts)、[deep link](../../lib/platform-oauth-deep-link.ts) | 外部授权与 App 回跳协调                                            |
| 已登录用户维护帐号安全    | [security](security/)、[安全中心入口](security/account-security-page.tsx)                                                                                                | 密码、邮箱、OAuth 关联与会话设备管理                               |
| 用户进入个人页或指定分区  | [个人页](me/account-me-page.tsx)、[分区页](me/account-me-section-page.tsx)、[共享工作区](me/account-me-workspace.tsx)                                                    | 加载会话、资料和交换能力，组合个人分区                             |
| 用户维护资料与头像        | [profile](me/profile/)                                                                                                                                                   | 资料表单、头像上传和裁剪                                           |
| 用户维护名片与自有媒体    | [namecards](me/namecards/)                                                                                                                                               | 名片列表、编辑、删除与自有图片读取                                 |
| 用户管理收藏              | [favorites](me/favorites/)                                                                                                                                               | 收藏集合与展示                                                     |
| 用户维护事务所与精确位置  | [offices](me/offices/)、[选点与地址解析](me/offices/configured-office-picker.tsx)、[共享弹窗](../../components/community/office-editor-dialog.tsx)                       | 资料编辑、选点与地址绑定、保存后整体审核；后台复用相同表单与弹窗   |
| 用户处理认领信封          | [claims](me/claims/)                                                                                                                                                     | 查看状态、确认本人名片或拒绝匹配；操作受交换写入能力与帐号限制约束 |
| 个人页模型与分区导航      | [account-me-model](me/account-me-model.ts)、[导航](me/profile-workspace-navigation.tsx)                                                                                  | 纯状态辅助、错误文案与分区选择                                     |

## 协作边界

- [routes.ts](../../routes.ts) 把个人页注册在 public 布局下，页面自行处理登录和限制状态；
  Web 与 App 的承载差异见 [public 布局](../../layouts/public-layout.tsx) 和
  [App 布局](../../layouts/app-layout.tsx)。不能套用后台布局的身份边界。
- [account-me-workspace](me/account-me-workspace.tsx) 分别判断资料修改与交换写入：
  用户限制状态会影响编辑，交换写入还受返回的能力开关约束。登录不代表拥有全部编辑能力。
- Platform 会话归 [platform 组件](../../components/platform/) 与
  [platform-client](../../lib/api/platform-client.ts)；安全与认证请求实现归
  [platform endpoints](../../lib/api/endpoints/platform/)，名片、事务所、收藏与认领请求归
  [fudaba endpoints](../../lib/api/endpoints/fudaba/)。页面统一调用
  [API facade](../../lib/api/index.ts)，上述实现链接不作为直接导入入口。
  wire 来源为 [@imsweb/contracts](../../../../../packages/contracts/README.md)。
- [社区交换](../community/exchange/README.md) 可在地图上下文中复用个人工作区。
  分区选择、指定名片或事务所、关闭与返回行为需兼容独立个人页和地图内管理。
- 地点搜索先预览；点击地图或拖动浮标后显示该点的待绑定地址，明确确认后才回填表单。
  解析期间的手动修改在同一选点重试时仍保留，移动浮标会清除旧预览。搜索来源、地址解析
  和坐标校准由地图 provider 适配器负责；高德临时估算只用于预览，确认点随事务所资料保存。实现边界见
  [地图架构](../../../../../docs/architecture/map-rendering.md)。
- 位置始终为 `exact`，新建或修改资料保存即进入整体审核，通过前停止公开。无独立位置发布或
  精确公开同意步骤；待审、拒绝原因和版本冲突反馈留在同一事务所表单。
- 名片公开浏览及游客投稿回执在 [community](../community/)；游客撤回凭据与 Platform
  登录会话不是同一机制。跨页展示优先复用 [community 组件](../../components/community/)
  和 [名片预览](../../components/shared/namecard-preview.tsx)。

## 测试入口

- 认证、安全与 App OAuth：[account 单元测试](../../../tests/unit/pages/account/)。
- 个人工作区与各分区：[account/me 单元测试](../../../tests/unit/pages/account/me/)。
- 浏览器流程：[个人页](../../../tests/e2e/account-personal-pages.spec.ts)、
  [App 帐号](../../../tests/e2e/app-account.spec.ts)、
  [自有名片图片](../../../tests/e2e/owner-card-media.spec.ts)、
  [事务所选点](../../../tests/e2e/office-picker.spec.ts)。

调整个人分区或共享工作区时，同步维护本索引、[交换索引](../community/exchange/README.md)
及对应测试，权限与会话行为以实现为准。
