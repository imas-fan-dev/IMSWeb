# 地点搜索修复设计

现有事务所搜索使用正确的共享 JSON 契约和 Nominatim-compatible 服务器代理，但输入的 Enter 会冒泡到事务所表单，没有空结果反馈。公开地图只有城市事务所筛选，没有 geocoder 搜索或定位选择。实际本地 env 未设置 provider，Compose 也未转发模板声明的三个 geocoder 变量。

抽取页面内共享 `ExchangePlaceSearch`，使用现有 API facade 和 place response。事务所包装器只更新城市、地址和精确经纬度，地图选择只改变客户端视点。搜索输入阻止 Enter 的默认提交和冒泡，以按钮或 Enter 显式发起查询。请求期间清除旧结果，显示进度，分别处理 429、503、其他失败及空结果。组件挂载身份隔离旧请求。

`ExchangeOfficeMap` 接收现有 `FudabaPlaceSearchResult` 类型的可选地点，选择时 `easeTo` 对应精确坐标并加临时标记。公开事务所 source 继续消费量化点，地点标记不写入事务所或后台。地图城市筛选不参与地点查询。

GET `/api/community/exchange/places/search` 保留路径、既有 legacy-strip query 兼容策略和 exact response。公开读取与地图均开启时匿名只读可用；否则依次保留写开关和 Platform auth。不修改任何 mutation。共享缓存和全局 provider limiter继续执行。

真实西岸艺术中心查询中，provider city 是徐汇区，state 是上海市。中国四个直辖市优先以 state 填写事务所城市，其他地址继续原层级回退；缓存 key 升为 v2，避免旧映射留存 24 小时。

Compose 明确转发 endpoint、User-Agent 和 countrycodes，缺省 endpoint 为空。provider 启用保持运营显式选择，避免默认向公共服务发流量。真实验证使用临时本地配置，记录官方政策和 endpoint 返回，不更改部署。

回滚可撤回这些 UI / policy / Compose 修改，无数据库迁移。新公共读增加 provider 请求面，现有全局每秒一次限制仍保证 provider 流量上限；缓存命中不消耗 provider 配额。
