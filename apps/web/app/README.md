# 前端业务索引

本索引按产品板块、业务能力和页面职责定位 Web/App 实现，保留现有
[pages](pages/)、[components](components/) 与 [lib](lib/) 的物理结构。
开发命令见 [Web workspace](../README.md)，目录与依赖约束见
[Web 规则](../.rules)。

[routes.ts](routes.ts) 是路由组合的权威入口，消费
[route-metadata.ts](route-metadata.ts) 的页面描述数据并选择构建目标与布局。
本索引不复制完整 URL、权限清单或接口协议；页面是否注册、如何嵌套，应回到这些实现核对。

## 公开内容

表中的“请求归属”用于定位请求实现。页面统一从 [API facade](lib/api/index.ts)
（`~/lib/api`）调用能力，不直接导入 endpoints 内部；JSON wire 来源为
[@imsweb/contracts](../../../packages/contracts/README.md)。

| 业务用途              | 页面入口与主要协作                                                                                          | 请求归属                                                                                                                                                    | 代表测试定位                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 首页聚合与入口编排    | [home](pages/home/)、[homepage 组件](components/homepage/)                                                  | [home](lib/api/endpoints/home.ts)、[homepage-links](lib/api/endpoints/homepage-links.ts)、[editorial](lib/api/endpoints/editorial.ts)                       | [home 单元测试](../tests/unit/pages/home/)                                                     |
| 关于页                | [about](pages/about/)                                                                                       | [about](lib/api/endpoints/about.ts)                                                                                                                         | [about 单元测试](../tests/unit/pages/about/)                                                   |
| 文章、活动与推荐      | [events](pages/events/)、[recommendations](pages/recommendations/)、[editorial 组件](components/editorial/) | [events](lib/api/endpoints/events.ts)、[recommendations](lib/api/endpoints/recommendations.ts)、[editorial](lib/api/endpoints/editorial.ts)                 | [events](../tests/unit/pages/events/)、[recommendations](../tests/unit/pages/recommendations/) |
| 资讯兼容内容          | [information](pages/information/)                                                                           | [home](lib/api/endpoints/home.ts)、[editorial](lib/api/endpoints/editorial.ts)                                                                              | [information 单元测试](../tests/unit/pages/information/)                                       |
| 演出与纪年            | [live](pages/live/)、[chronicle](pages/chronicle/)                                                          | [live](lib/api/endpoints/live.ts)、[editorial](lib/api/endpoints/editorial.ts)                                                                              | [live](../tests/unit/pages/live/)、[chronicle](../tests/unit/pages/chronicle/)                 |
| 制作人分布            | [producer-map](pages/producer-map/)、[配套组件](components/producer-map/)                                   | [producer-map](lib/api/endpoints/producer-map.ts)                                                                                                           | [producer-map 单元测试](../tests/unit/pages/producer-map/)                                     |
| 作品资料              | [works](pages/works/)                                                                                       | 静态本地内容                                                                                                                                                | [works 单元测试](../tests/unit/pages/works/)                                                   |
| Tier List 制作        | [tier-list](pages/tier-list/)                                                                               | 本地模型、存储、导入与 PNG 导出，无远端 API                                                                                                                 | [tier-list 单元测试](../tests/unit/pages/tier-list/)                                           |
| 站点包与 App 资料聚合 | [sites](pages/sites/)、[apps](pages/apps/)                                                                  | 站点包为 [site-packages](lib/api/endpoints/site-packages.ts)；App 资料组合本地核心入口与 [homepage-links](lib/api/endpoints/homepage-links.ts) 动态导航配置 | [sites](../tests/unit/pages/sites/)、[apps](../tests/unit/pages/apps/)                         |

当前纪年页面使用 `editorial` 请求实现；不能根据同名旧请求模块推断页面依赖。
制作人分布与下方社区交换地图是不同业务。

## 社区与平台帐号

| 业务用途               | 页面入口与主要协作                                                                                                                 | 请求归属                                                                                                                                                            | 代表测试定位                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 社区内容与公开名片     | [社区首页](pages/community/index.tsx)、[名片墙](pages/community/community-cards-page.tsx)、[community 组件](components/community/) | [community-content](lib/api/endpoints/community-content.ts)、[community](lib/api/endpoints/community.ts)、[角色目录](lib/api/endpoints/fudaba/character-catalog.ts) | [community 单元测试](../tests/unit/pages/community/)                                                                                |
| 游客投稿与名片认领     | [投稿回执页](pages/community/namecard-submission-page.tsx)、[名片预览](components/shared/namecard-preview.tsx)                     | [guest-submissions](lib/api/endpoints/fudaba/guest-submissions.ts)、[card-claims](lib/api/endpoints/fudaba/card-claims.ts)                                          | [投稿页](../tests/unit/pages/community/namecard-submission-page.test.tsx)、[认领流程](../tests/e2e/namecard-claim-workflow.spec.ts) |
| 交换发现、地图与事务所 | [exchange 局部索引](pages/community/exchange/README.md)                                                                            | [fudaba](lib/api/endpoints/fudaba/)                                                                                                                                 | [exchange 单元测试](../tests/unit/pages/community/exchange/)、[地图流程](../tests/e2e/community-exchange-map.spec.ts)               |
| 登录、安全与个人工作区 | [account 局部索引](pages/account/README.md)                                                                                        | [platform](lib/api/endpoints/platform/)、[fudaba](lib/api/endpoints/fudaba/)                                                                                        | [account 单元测试](../tests/unit/pages/account/)、[个人页流程](../tests/e2e/account-personal-pages.spec.ts)                         |

公开名片浏览、登录后认领、游客投稿回执与撤回凭据各有边界；个人资料修改与交换写入也分别判断能力。
相邻页面共享展示与会话，不代表共享全部操作权限。

## Wiki 阅读与后台运营

公开 Wiki 的目录、现代剧情和经典外壳见 [Wiki 局部索引](pages/wiki/README.md)。
请求归属为 [wiki](lib/api/endpoints/wiki/)，测试见
[Wiki 单元测试](../tests/unit/pages/wiki/) 与 [移动阅读流程](../tests/e2e/wiki-mobile.spec.ts)。

后台入口与身份布局按 [routes.ts](routes.ts)、
[AdminLayout](layouts/admin-layout.tsx) 定位。Backoffice 与 Platform 会话分离；
角色边界以布局实现为准。文章预览虽然使用后台 URL，仍挂公开布局，不能把所有后台 URL
都视为由 AdminLayout 承载。

| 业务用途                         | 页面入口                                                                                                                                                                                            | 请求归属                                                                                                            | 代表测试定位                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后台首页、登录与未匹配页         | [首页](pages/admin/index.tsx)、[登录](pages/admin/login/)、[未匹配页](pages/admin/not-found/)                                                                                                       | [admin](lib/api/endpoints/admin.ts)                                                                                 | [登录单元测试](../tests/unit/pages/admin/login/)、[登录流程](../tests/e2e/admin-login.spec.ts)                                                                |
| 文章、推荐与纪年编辑             | [events](pages/admin/events/)、[recommendations](pages/admin/recommendations/)、[chronicle](pages/admin/chronicle/)                                                                                 | [editorial](lib/api/endpoints/editorial.ts)、[admin](lib/api/endpoints/admin.ts)、[live](lib/api/endpoints/live.ts) | [events](../tests/unit/pages/admin/events/)、[recommendations](../tests/unit/pages/admin/recommendations/)、[chronicle](../tests/unit/pages/admin/chronicle/) |
| 资讯兼容跳转                     | [实际路由入口](pages/admin/information/redirect-page.tsx)                                                                                                                                           | 跳转交由目标页面处理                                                                                                | [information 单元测试](../tests/unit/pages/admin/information/)                                                                                                |
| 首页与关于页配置                 | [homepage](pages/admin/homepage/)、[about](pages/admin/about/)                                                                                                                                      | [homepage-links](lib/api/endpoints/homepage-links.ts)、[about](lib/api/endpoints/about.ts)                          | [homepage](../tests/unit/pages/admin/homepage/)、[about](../tests/unit/pages/admin/about/)                                                                    |
| 社区与制作人分布配置             | [community](pages/admin/community/)、[producer-map](pages/admin/producer-map/)                                                                                                                      | [community-content](lib/api/endpoints/community-content.ts)、[producer-map](lib/api/endpoints/producer-map.ts)      | [community](../tests/unit/pages/admin/community/)、[producer-map](../tests/unit/pages/admin/producer-map/)                                                    |
| 名片与交换审核                   | [cards](pages/admin/cards/)、[交换审核](pages/admin/community/exchange/)                                                                                                                            | [admin](lib/api/endpoints/admin.ts)、[fudaba 审核模块](lib/api/endpoints/fudaba/)                                   | [cards](../tests/unit/pages/admin/cards/)、[交换审核](../tests/unit/pages/admin/community/exchange/)                                                          |
| 事务所整体审核与编辑             | [条目与详情](pages/admin/community/exchange/admin-community-exchange-page.tsx)、[共享弹窗](components/community/office-editor-dialog.tsx)、[用户侧表单](pages/account/me/offices/office-editor.tsx) | [office-review](lib/api/endpoints/fudaba/office-review.ts)；账号优先展示，用户管理定位高亮沿用既有权限              | [事务所审核](../tests/unit/pages/admin/community/exchange/)、[平台用户](../tests/unit/pages/admin/platform-users/)                                            |
| Wiki 目录与内容维护              | [企划、栏目与条目索引](pages/admin/idols/README.md)、[剧情与素材索引](pages/admin/stories/README.md)                                                                                                | [wiki](lib/api/endpoints/wiki/)                                                                                     | [idols](../tests/unit/pages/admin/idols/)、[stories](../tests/unit/pages/admin/stories/)                                                                      |
| 站点包上传、修订、发布与预览凭据 | [site-packages](pages/admin/site-packages/)                                                                                                                                                         | [site-packages](lib/api/endpoints/site-packages.ts)                                                                 | [site-packages 单元测试](../tests/unit/pages/admin/site-packages/)                                                                                            |
| 后台帐号与平台运营               | [accounts](pages/admin/accounts/)、[OAuth](pages/admin/platform-oauth/)、[邮件](pages/admin/platform-email/)、[平台用户](pages/admin/platform-users/)                                               | [admin](lib/api/endpoints/admin.ts)、[platform 管理模块](lib/api/endpoints/platform/)                               | [accounts](../tests/unit/pages/admin/accounts/)、[platform-users](../tests/unit/pages/admin/platform-users/)                                                  |
| 地图源与路由配置                 | [system](pages/admin/system/)                                                                                                                                                                       | [fudaba](lib/api/endpoints/fudaba/)                                                                                 | [system 单元测试](../tests/unit/pages/admin/system/)                                                                                                          |

## App 与共享基础设施

App 是构建目标，不是统一的 `/app` 路由前缀；多数业务页面与 Web 共用。
[apps](pages/apps/) 是 App 专属资料聚合入口。目标注册逻辑见
[routes.ts](routes.ts)，App 不注册后台和经典 Wiki/剧情。

| 职责                           | 实现入口                                                                                                                                               | 测试定位                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 根渲染与站点布局               | [root](root.tsx)、[layouts](layouts/)                                                                                                                  | [布局测试](../tests/unit/layouts/)                                                                                                                           |
| App 外壳与导航恢复             | [AppLayout](layouts/app-layout.tsx)、[app 组件](components/app/)、[app-target](lib/app-target.ts)、[app-navigation-state](lib/app-navigation-state.ts) | [目标路由](../tests/unit/routes-app-target.test.ts)、[AppLayout](../tests/unit/layouts/app-layout.test.tsx)、[App 导航](../tests/e2e/app-navigation.spec.ts) |
| 跨 Web/App 导航                | [navigation 组件](components/navigation/)、[navigation 库](lib/navigation/)                                                                            | [lib 单元测试](../tests/unit/lib/)、[App 外壳流程](../tests/e2e/app-shell.spec.ts)                                                                           |
| Platform 会话与 App OAuth 回跳 | [platform 组件](components/platform/)、[platform-client](lib/api/platform-client.ts)、[deep link](lib/platform-oauth-deep-link.ts)                     | [account 单元测试](../tests/unit/pages/account/)、[App 帐号流程](../tests/e2e/app-account.spec.ts)                                                           |
| API facade、解析与会话客户端   | [API 目录](lib/api/)、[facade](lib/api/index.ts)、[parsed](lib/api/parsed.ts)                                                                          | [API 单元测试](../tests/unit/lib/api/)                                                                                                                       |
| 复用 UI 与基础样式             | [业务组件](components/)、[shared](components/shared/)、[ui](components/ui/)、[styles](styles/)、[app.css](app.css)                                     | [组件测试](../tests/unit/components/)                                                                                                                        |
| 国际化                         | [i18n](i18n/)                                                                                                                                          | [i18n 测试](../tests/unit/i18n/)                                                                                                                             |

## 局部入口与同步维护

- [社区交换](pages/community/exchange/README.md)：发现、事务所、地图与个人管理协作。
- [帐号与个人页](pages/account/README.md)：认证、安全和个人工作区。
- [Wiki 阅读](pages/wiki/README.md)：现代阅读、经典外壳与展示模型。
- [Wiki 剧情后台](pages/admin/stories/README.md)：内容工作台、来源与素材。
- [Wiki 目录后台](pages/admin/idols/README.md)：企划、栏目、内容页与编辑草稿。

移动页面或改变能力归属时，同步更新总索引、所属局部索引与相邻协作链接。
页面私有组件、hooks 和纯模型留在所属页面，共享业务 UI 放 components，跨页非 UI 能力放 lib；
具体约束以 [Web 规则](../.rules) 为准。测试按实现归属维护在
[tests/unit](../tests/unit/)，浏览器流程位于 [tests/e2e](../tests/e2e/)。
索引只维护职责、入口与代表测试，不维护手工数量、日期快照或第二份接口/路由清单。
