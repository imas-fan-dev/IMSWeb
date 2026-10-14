# 根因与 provider 依据

事务所地点输入 Enter 未拦截外层 form，成功空列表没有状态文案。公开地图只加载 map-config/map-offices，没有地点查询或重定位入口。现有搜索要求 write + Platform auth，无法支持匿名公开地图。

实际 ignored `apps/api/.env` 与 `deploy/.env` 的 geocoder endpoint/User-Agent/countrycodes 均未设置。模板已有配置，但 Compose 未转发这三个变量。统一开发启动器已有 IMS_DEV_* 严格解析和转译。

本次读取的官方资料：

- https://operations.osmfoundation.org/policies/nominatim/ ：全应用最多每秒一次，标识应用，显示 attribution，启用缓存，可切换 provider，禁止 autocomplete。
- https://nominatim.org/release-docs/latest/api/Search/ ：GET `/search` 支持 q、format=jsonv2、addressdetails、limit、countrycodes、accept-language，JSON 返回 lat/lon/address/name。

既有 handler 的五条结果、24 小时共享缓存、全局 limiter 与代理符合这些约束。真实 provider 验证经过应用 route graph，fixture 负责边界回归。
