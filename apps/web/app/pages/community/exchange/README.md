# 社区交换与地图

[返回前端总索引](../../../README.md)

本目录负责公开交换发现、事务所详情及地图交互。页面编排入口为
[community-exchange-page.tsx](community-exchange-page.tsx) 与
[community-office-page.tsx](community-office-page.tsx)；个人资料、名片与事务所编辑由
[帐号工作区](../../account/README.md) 承担。

## 能力与职责地图

| 参与者与能力           | 关键实现路径                                                                                                                                                                    | 职责                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 访客发现名片与事务所   | [交换页](community-exchange-page.tsx)、[use-exchange-discovery](hooks/use-exchange-discovery.ts)、[发现栏](components/exchange-discovery-rail.tsx)                              | 目录视图、筛选、公开数据加载与功能关闭状态                 |
| 访客查看事务所详情     | [事务所页](community-office-page.tsx)、[名片墙](components/exchange-card-wall.tsx)                                                                                              | 展示事务所、关联名片与可用交互                             |
| 地图使用者搜索与浏览   | [地图区块](components/community-exchange-map-section.tsx)、[Web 地图工作区](components/exchange-web-map-workspace.tsx)、[搜索 hooks](hooks/)                                    | 地图、搜索面板与选择状态协作                               |
| 地图适配实现           | [AMap](maps/amap/)、[Mapbox](maps/mapbox/)、[MapLibre](maps/maplibre/)、[regional](maps/regional/)、[选点地址](maps/resolve-point-address.ts)                                   | 各引擎渲染、坐标、区域搜索与选点地址解析适配               |
| 地图配置与图层状态     | [provider](maps/exchange-map-provider.ts)、[renderer](maps/exchange-map-renderer.ts)、[model](maps/exchange-map-model.ts)、[事务所查询 hook](hooks/use-exchange-map-offices.ts) | 引擎选择、渲染契约、视图状态与地图点数据                   |
| 已登录用户互动与管理   | [名片交互](components/exchange-card-interactions.tsx)、[管理对话框](components/exchange-management-dialog.tsx)、[页面承载上下文](components/exchange-page-surface.tsx)          | 收藏、反应及个人工作区的上下文接入                         |
| 地图路由历史与返回恢复 | [use-exchange-route-session](hooks/use-exchange-route-session.ts)                                                                                                               | 保留地图查询参数、追踪已观察的路由历史，关闭详情时安全返回 |

## 协作边界

- [routes.ts](../../../routes.ts) 在 Web 将事务所详情嵌入地图路由；App 由自身外壳承载。
  路由恢复、对话框返回与页面可见性需同时考虑这些调用方式。
- 功能关闭、公开读取和登录后写入分别控制；登录不等于获得全部交换编辑能力。
  会话来自 [Platform provider](../../../components/platform/)，个人能力判断与编辑实现在
  [account/me](../../account/me/)；不要把编辑器重新放回交换目录。
- 请求通过 [API facade](../../../lib/api/index.ts) 调用，实现在
  [fudaba endpoints](../../../lib/api/endpoints/fudaba/)。此链接用于定位请求归属，
  页面不得直接导入 endpoints 内部；wire 以
  [@imsweb/contracts](../../../../../../packages/contracts/README.md) 为准。
- 地图源与路由配置由 [后台 system](../../admin/system/) 维护，地点等交换审核由
  [后台交换管理](../../admin/community/exchange/) 承担。制作人分布是独立的
  [producer-map](../../producer-map/) 业务。
- 页面私有展示放 [components](components/)，请求状态与浏览器行为放
  [hooks](hooks/)，引擎与地理实现放 [maps](maps/)；共享地图基础能力见
  [lib/maps](../../../lib/maps/)。

## 测试入口

- 单元测试：[exchange](../../../../tests/unit/pages/community/exchange/)，按 components、hooks、maps 定位。
- 页面编排：[交换页](../../../../tests/unit/pages/community/community-exchange-page.test.tsx)、
  [事务所页](../../../../tests/unit/pages/community/community-office-page.test.tsx)。
- 浏览器流程：[地图](../../../../tests/e2e/community-exchange-map.spec.ts)、
  [搜索页签](../../../../tests/e2e/community-exchange-search-tabs.spec.ts)、
  [个人管理协作](../../../../tests/e2e/community-exchange-me.spec.ts)、
  [App 地图](../../../../tests/e2e/app-map.spec.ts)。

迁移地图实现或个人管理调用时，同步更新本索引、[帐号索引](../../account/README.md)
及对应测试路径；路由和权限事实仍回到实现核对。
