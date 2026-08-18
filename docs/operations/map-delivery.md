# 地图资源交付与同源托管

> 文档类型：运维
> 状态：Decision
> 权威来源：`apps/web/public/maps/`、地图组件资源 allowlist、`@imsweb/contracts/paths` 和部署入口配置
> 适用环境：公开 Producer Map、Fudaba exchange map 与自托管地图资源

公开地图需要稳定、可审计且不泄露 provider key 的资源链。生产设计以同源交付为目标：style、
tile、glyph、sprite 和行政边界均由受控 origin 提供，Web 代码不硬编码第三方 token 或临时 host。

## 资源分类

| 资源 | 作用 | 权威来源 |
| --- | --- | --- |
| Style JSON | source、layer、font、sprite 与 attribution | `apps/web/public/maps/` 中的版本化文件 |
| Vector/raster tile | 底图数据 | 经许可的上游快照或自托管 PMTiles/tile tree |
| Glyph | 中文和拉丁文字形 | 与 style font stack 对应的许可字体产物 |
| Sprite | 底图图标和 symbol | style 对应的 sprite JSON/PNG |
| 行政边界 | Producer Map 和合规边界显示 | `apps/web/public/maps/` 中登记来源的 GeoJSON |

只镜像 tile 而继续远程读取 glyph 或 sprite 不算同源。所有 URL 必须使用 shared path builder 或
style 中的相对路径，并通过客户端 allowlist。

## 数据源与许可

选择地图源时必须记录：

- 上游项目、版本/快照标识和下载 URL；
- 数据、style、字体、图标各自的许可证与 attribution；
- 下载文件的字节数和 SHA-256；
- 目标 zoom、bbox、layer 和裁剪参数；
- 是否允许公开托管、缓存和再分发。

资产登记写入[公开资产来源与许可](../governance/assets.md)。一次部署的具体下载时间、对象数量和
性能数据写入私有运维记录，不写入本长期文档。

## 交付方案

### 解包静态 tile

服务端或对象存储按稳定路径提供 `/{z}/{x}/{y}.pbf`。该方案浏览器无需 PMTiles protocol，
适合现有 style 和 CDN；缺点是文件数较多，更新和原子切换需要版本目录。

### PMTiles

浏览器注册 PMTiles protocol，或服务端读取 PMTiles range。该方案文件少、适合对象存储和版本
切换；必须验证 Range、Content-Length、ETag、缓存、跨源策略和 worker/bundle 体积。

选择方案时以部署环境、缓存层、更新频率和回滚方式为依据，不在页面组件中分叉业务逻辑。

## 目录与路由

- 静态 Web 地图资源通过 `mapsPath()` 管理 `/maps` 前缀。
- 大型 tile/glyph/sprite 可放在对象存储或宿主机版本目录，由同源 Nginx/Hono 入口转发。
- API route、middleware path ownership 和 Web asset URL 使用 `@imsweb/contracts/paths`；路径变更
  同时更新 frontend routing contract。
- 地图响应设置正确 MIME、immutable cache（带版本的资源）、ETag/Last-Modified 和 Range。
- 公开响应保留 OpenStreetMap/OpenMapTiles/OpenFreeMap 或实际数据源要求的 attribution。

## 更新流程

1. 在隔离目录下载新上游快照并验证 checksum、许可证和 manifest。
2. 按批准的 bbox/zoom/layer 参数生成 tile 或 PMTiles；生成 glyph/sprite 并验证 style 引用。
3. 将产物写入新的不可变版本目录，不覆盖当前版本。
4. 在 staging 修改 style/version pointer，验证桌面和移动地图、中文标签、低/高 zoom、离线错误和
   attribution。
5. 原子切换版本指针，保留上一版本以便回滚；观察 404、range、缓存命中和加载延迟。
6. 观察期后通过受控清理流程回收旧版本，不直接删除当前 pointer 引用的对象。

## 验证清单

- style、source、glyph、sprite 和 tile URL 都在允许 origin 内；
- 所有关键 zoom/bbox 有数据，不出现空白 canvas 或无界重试；
- 中文 glyph、symbol、行政边界和南海断续线按产品要求显示；
- MapLibre attribution 始终可见，许可证链接可访问；
- 响应 MIME、gzip、Range、ETag、cache-control 和 404 正确；
- 桌面和移动视口无溢出，地图交互、筛选、详情和返回流程正常；
- 断开上游网络后，自托管生产资源仍可加载；
- 回滚到前一版本不要求重新构建应用。

任何需要第三方运行时 token、未登记来源或无法原子回滚的方案，都不能作为生产默认值。
