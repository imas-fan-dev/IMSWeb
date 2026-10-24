# 地图资源交付

> 文档类型：运维
> 状态：Active
> 权威来源：`apps/web/public/maps/`、地图资源信任策略、后台 map-delivery 配置和部署入口配置
> 适用环境：公开 Producer Map、Fudaba exchange map 与可选自托管地图资源

公开地图需要稳定、可审计的资源链。公开 JS API Key/Token 可由 map-config 交付；高德安全密钥等
服务端凭据不得交付浏览器。Fudaba exchange map 默认从官方
OpenFreeMap HTTPS 服务读取 style、tile、glyph 和 sprite；App 只内置小型合规边界 GeoJSON，
不包含 PMTiles 归档。Web 代码不硬编码第三方 token 或临时 host。

## 资源分类

| 资源               | 作用                                       | 权威来源                                       |
| ------------------ | ------------------------------------------ | ---------------------------------------------- |
| Style JSON         | source、layer、font、sprite 与 attribution | 官方 OpenFreeMap HTTPS style 或自托管版本      |
| Vector/raster tile | 底图数据                                   | OpenFreeMap 公共服务或自托管 PMTiles/tile tree |
| Glyph              | 中文和拉丁文字形                           | style 声明的 OpenFreeMap font stack            |
| Sprite             | 底图图标和 symbol                          | style 声明的 OpenFreeMap sprite                |
| 行政边界           | Producer Map 和合规边界显示                | `apps/web/public/maps/` 中登记来源的 GeoJSON   |

MapLibre 在线资源必须与 API 返回的 style origin 一致并通过客户端 allowlist。自托管时，tile、glyph、sprite
和 style 必须整体迁移，不能只镜像其中一部分。

## 当前生产合同

Fudaba exchange map 默认使用 `https://tiles.openfreemap.org/styles/positron`。该服务无需 API key，
style、OpenMapTiles vector tile、Natural Earth raster、Noto Sans glyph 和 sprite 均通过 HTTPS
加载，并返回允许 App WebView 读取的 CORS 响应。MapLibre attribution 必须保持可见。

`public/maps/china-boundary-dashes.json` 只有约 7.7 KiB，随 Web/App 静态资源发布。客户端先从自身
origin 读取它，再以内联 GeoJSON 交给 MapLibre，因此不要求 OpenFreeMap 或 API 主机提供
`/maps/` 静态目录。App release 不包含 `data/maps/`、PMTiles、远程 glyph 镜像或 raster tile tree。

部署配置如下：

```dotenv
IMS_FUDABA_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/positron
IMS_FUDABA_MAP_STYLE_URLS=/maps/exchange-style.json
```

默认 style URL 和 `IMS_FUDABA_MAP_STYLE_URLS` 中的完整 URL 只用于首次生成后台配置集合，或在
持久化对象缺失、损坏时恢复。管理员在“系统配置 > 交换地图源”中新增、编辑、删除配置，并选择
默认源或国内外模式；修改保存后无需重启 API，已打开的地图需要刷新。
统一模式的公共 map-config API 只返回当前选中的
provider 配置及其搜索策略。三种服务商均显式声明 `provider`；MapLibre 包含 `styleUrl`，
高德与 Mapbox 包含各自严格校验的公开选项。
需要自托管时按下文准备独立地图 release，再在后台新增其 style URL。
S3-compatible storage 的对象键、CORS、上传和验证合同见
[OpenMap S3 发布规范](openmap-s3-publication.md)。

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

### 在线 OpenFreeMap（当前采用）

API 返回官方 HTTPS style URL。客户端仅信任 App/Web document origin 和 style origin，style 中的
source、glyph 与 sprite 必须位于这两个 origin。该方案不会增加 App 包体，也不需要发布地图主机；
运行时依赖终端能够访问 `tiles.openfreemap.org`。

### 高德与 Mapbox

后台“系统配置 > 交换地图源 > 添加地图源”支持三种服务商：

| 服务商 | 后台填写 | 渲染方式 |
| --- | --- | --- |
| OpenFreeMap / MapLibre | 完整 style URL 或站点根路径 | 原有 MapLibre，兼容 PMTiles |
| 高德地图 | Web 端 JS API Key、安全代理地址、`amap://styles/...` 样式 | 在线高德 JS API 2.0 |
| Mapbox | `pk.` 开头的公开 Token、`mapbox://styles/<owner>/<id>` | 官方 Mapbox GL JS |

高德安全代理地址以 `/_AMapService` 结尾，支持 HTTPS 完整地址或 API origin 下的根路径。
App 使用根路径时会解析到 API origin。按[高德安全密钥说明](https://developer.amap.com/api/javascript-api-v2/guide/abc/jscode)
配置代理；可将 [Nginx 代理示例](../../deploy/nginx/amap-service.conf.example) 的私有副本包含在
应用 TLS server 中。安全密钥仅放在该私有配置中，并为 JS API Key 配置允许的域名。
多 Key 部署应在代理中按 Key 映射相应安全密钥。修改后先验证 Nginx 配置再重载。
客户端按需在线加载 SDK，保留高德默认 logo/版权；Key 或代理地址变更后，已加载 SDK 的页面需要刷新。

如果 SDK 返回 `INVALID_USER_DOMAIN`，说明当前页面的访问域名未通过 Key 的域名校验，需在高德控制台
调整绑定域名。[高德本地调试说明](https://lbs.amap.com/faq/js-api/map-js-api/create-project/46515)
建议调试时去掉域名白名单；使用独立的本地调试 Key，并保留上线 Key 的域名限制。
域名校验通过后，还需验证 `/_AMapService` 确实由代理服务器处理。普通 Web 的根路径解析到页面
origin。Vite 开发服务器提供专用本地代理：在 Git 忽略的 `apps/web/.env.local` 填写
`IMS_DEV_AMAP_JS_API_KEY` 和 `IMS_DEV_AMAP_SECURITY_JS_CODE`，前者须与后台地图源的 Key 一致，
后台安全代理地址填 `/_AMapService`。只有开发服务器读取该文件；安全密钥不进入浏览器或生产产物。
未配置时本地代理返回 503；也可在后台直接填写已部署代理的完整 HTTPS 地址。

事务所数据、自有 API、地址写入与规范会话视角以 WGS84 解释。高德适配器使用
[`AMap.convertFrom(..., "gps", ...)`](https://developer.amap.com/api/javascript-api-v2/guide/transform/convertfrom)
转换公开区域点、规范坐标搜索结果和设备定位；每批最多 40 对坐标，复用有界缓存中的转换任务。
高德视口查询使用保守 WGS84 包围范围，避免边缘遗漏；App 的高德视角仅保存在适配器独立的本地会话区，
不通过联网逆向转换保存视角。不会将 GCJ-02 写入业务数据，也不会提高公开点的 0.1 度精度。
Mapbox 与 MapLibre 直接使用 WGS84。单源搜索仍由所选地图源的 provider policy 提供；地区组合
搜索使用 `federated` 配置，但运行时每次只请求一家。提交关键词时按 Mapbox 相机中心选择大陆 AMap
PlaceSearch 或海外 Mapbox Geocoding；不使用设备国家、访问者 IP 或关键词文本推断搜索区域，服务失败
时不偷偷更换来源。Mapbox Geocoding v6 只提供地址／地名，不是完整商户 POI API，候选最多 5 条。

排序基于本次返回候选的 WGS84 坐标计算球面直线距离，不是路线距离，也不保证找到全局最近 POI。
有效设备定位优先，缺少或超过 60 秒的定位回退本次提交时的 Mapbox 中心，并在结果中明确显示参考点。
Mapbox `proximity` 只用于改善候选召回，最终排序仍由 Web 本地完成；地图平移不会清空已显示结果。
高德 GCJ-02 搜索结果在显示与量距前临时数值反求；该方法不是官方逆转换，仅通过官方正向服务校验残差，
失败时不展示错误坐标。所有搜索结果、距离值和坐标都仅在当前页面内存使用，不写数据库、会话或编辑 API。

Mapbox 临时 Geocoding 结果不得缓存，且必须与 Mapbox 地图配合使用。高德 PlaceSearch 结果显示在
Mapbox 底图上也须核实高德服务协议许可。Token 来源限制、账户 Geocoding 权限、高德域名 Key 与安全代理
须逐项验证；不录入 Mapbox `sk.` 私密 Token，也不增加高德私有 Web 服务 Key。地址写入仍使用原有规范坐标
API，不能把任何第三方搜索结果静默变成业务坐标。

地图缩放上限由各 SDK 的原生范围决定，客户端不再统一限制为 z11。聚合截止层级独立于相机上限，
搜索地点默认聚焦到 z13；继续放大不会改变公开事务所的区域坐标精度。自托管 z0–11 归档可由
MapLibre 继续放大显示已有瓦片，其街道细节仍取决于归档中实际保存的数据。

独立地图模式下，OpenFreeMap 和 Mapbox 官方 `streets-v12`、`light-v11`、`outdoors-v12` 共用站点浅蓝灰配色：
水面、道路、建筑和文字通过各自图层规则映射至相同颜色。Mapbox 在每次 `style.load` 后应用配色，
不修改业务点位、原生图标或版权控件；Studio 自定义样式与 import-based Standard 样式按发布配置显示。
高德新增源默认使用 `amap://styles/whitesmoke`，已有 `normal` 配置在显示时也使用该浅色主题；
其他显式主题与自定义样式地址按原样使用。高德官方主题与站点配色为近似匹配，精确匹配需要在
高德控制台发布自定义样式，再把其 URI 填入后台“高德地图样式”。客户端不通过滤镜修改底图或版权。

Mapbox 保留官方 logo、版权链接和反馈控件；Token 应限制允许的 URL，禁止录入 `sk.` 私密 Token。
独立 Mapbox GL 以 `mul` 请求未指定翻译语言的瓦片，并在每次样式加载后，对已识别的 Streets v8 名称层
应用当地原名优先规则；原名为空时保留可用名称回退。字体使用样式 glyph，RTL 按需加载官方插件。
经典、自定义与 Standard/import 样式的适配边界见[地图渲染与当地语言策略](../architecture/map-rendering.md)。
App WebView 的 origin、Token URL 限制与上游网络可达性需在目标设备验证。高德和 Mapbox 都按需加载，
保留默认 OpenFreeMap 的使用方式。

### 地区搜索组合（固定 Mapbox 底图）

后台选择“Mapbox 底图＋地区搜索”，引用一条 AMap source 和一条 Mapbox source。**地图底图始终
使用 Mapbox GL；没有高德 renderer，也不因搜索地区重建地图。** 周边检索、首屏和其他自绘高德
POI overlay 实验均已移除。

每次显式提交关键词时，复制当时 Mapbox 相机中心作为区域选择快照：先用适用的官方边界与坐标处理
判定中国大陆（香港、澳门、台湾使用海外服务），大陆只调用 AMap PlaceSearch，海外只调用
Mapbox Geocoding。设备所在国家与搜索词均不决定 provider，失败也不静默切到另一家。Mapbox
Geocoding v6 不是商户 POI 搜索服务；它返回的是 limited address/geographic feature candidates。

若浏览器已成功取得当前授权定位，结果从该**本次请求快照**起按 WGS84 大圆球面直线距离升序；
搜索结果最多 5 个，因此是“本次返回候选内部排序”，不保证全库最近，也不是道路路线距离。
最后一次授权位置仅在页面内存保留 60 秒，坐标不可用或过期时使用提交时的地图中心，并显示
“距地图中心”，不冒充“距你”。位置 permission denied、SDK 转换失败、请求取消不得回退到旧/他人位置。
AMap native GCJ-02 结果需用官方 `convertFrom(..., "gps", ...)` 临时数值反求为 Mapbox 可显示的
WGS84 坐标后再量距；该接口不是官方逆转换，残差只是数值一致性检查，不是实际定位精度保证。
任何转换失败时搜索明确失败，不将 GCJ-02 当成 WGS84，也不将结果写入业务地点 API/存储/会话。

**高德结果在 Mapbox 底图上的跨服务商显示须先确认高德书面许可或适用合作授权。** 技术上可调用
PlaceSearch 不表示允许在其他供应商底图展示结果。高德服务条款见
[高德地图开放平台服务协议](https://lbs.amap.com/pages/terms/)；Mapbox Geocoding 临时结果只可与
Mapbox 地图配合使用，且不可缓存。服务提供商 attribution 和 Mapbox logo 必须始终可达。


map-config 响应保持 `private, no-store`，只交付运行模式需要的公开配置。
地图服务异常时显示现有重试/名录入口；重试会重新读取 map-config。

地图分发对象仅使用版本 4，源必须显式提供 `provider`，公开 map-config 必须包含搜索配置。
部署环境中的样式 URL 在运行时组装入口转为显式 MapLibre 初始化配置；集合初始化不再解析 URL
推断服务商，也不导入早期单样式对象或版本 1–3。格式不符或损坏时恢复部署初始化集合并保留对象
revision，后续覆盖仍受 CAS 保护。存量配置需独立替换成当前格式，部署时不依赖自动兼容读取。

### 解包静态 tile

服务端或对象存储按稳定路径提供 `/{z}/{x}/{y}.pbf`。该方案浏览器无需 PMTiles protocol，
适合现有 style 和 CDN；缺点是文件数较多，更新和原子切换需要版本目录。

### PMTiles（可选自托管）

浏览器注册 PMTiles protocol 并向同源 Nginx 发起 Range 请求。该方案只有一个约 7.92 GiB 的
planet 文件，避免数百万 inode，版本切换只涉及一个目录软链接。Nginx 限制为单 Range、关闭
动态 gzip，并返回 `Accept-Ranges`、`Content-Length`、`Content-Range`、ETag 和短时可重验证缓存。
同源请求不需要 CORS。

选择方案时以部署环境、缓存层、更新频率和回滚方式为依据，不在页面组件中分叉业务逻辑。

## 生成资源

准备命令默认是无写入 dry-run，只有显式 `--apply` 才下载；`--activate` 原子切换本地 current：

```sh
node scripts/maps/prepare-exchange-map.mjs
node scripts/maps/prepare-exchange-map.mjs --apply --activate
```

脚本固定使用 `go-pmtiles v1.31.2`。若未传 `--pmtiles-bin`，它按当前 Linux/macOS 架构下载官方
release archive，先核对仓库内固定的 SHA-256 再解包。核心命令等价于：

```sh
pmtiles extract \
  https://btrfs.openfreemap.com/areas/planet/20260816_080001_pt/tiles.pmtiles \
  openfreemap-z0-11.pmtiles \
  --maxzoom=11 \
  --download-threads=4
pmtiles verify openfreemap-z0-11.pmtiles
```

完整资源计划为 4 个 sprite 文件、3 × 256 个 glyph 文件和 5461 个 Natural Earth raster tile；
默认并发数为 8，可用 `--concurrency 1..32` 调整。脚本要求至少 12 GiB 可用空间；伴随资源会按
Content-Type 及 JSON/PNG/PBF 文件头复核，已通过验证的小文件可复用。CLI 压缩包固定 SHA-256，
不匹配时删除并重取一次。PMTiles 只有经过 `verify` 才从 staging 原子进入 release；已完整但尚未
rename 的 partial 可恢复，但 `go-pmtiles extract` 不支持续传未完成的输出，中途退出后该归档提取
会从头执行。每个 release 最终写入 `manifest.json`，记录 snapshot、zoom、归档字节数、SHA-256、
伴随资源数量和 attribution。

## 自托管发布与回滚（可选）

先在具备稳定国际出口和足够磁盘的受控机器生成 release，再同步到生产主机的新目录。不要覆盖
current 指向的目录：

```sh
RELEASE=openfreemap-20260816_080001_pt-z0-11
sudo install -d -m 0755 "/srv/imsweb/maps/releases/$RELEASE"
sudo rsync -a --delete \
  "data/maps/releases/$RELEASE/" \
  "/srv/imsweb/maps/releases/$RELEASE/"
sudo chown -R root:nginx "/srv/imsweb/maps/releases/$RELEASE"
sudo find "/srv/imsweb/maps/releases/$RELEASE" -type d -exec chmod 0750 {} +
sudo find "/srv/imsweb/maps/releases/$RELEASE" -type f -exec chmod 0640 {} +
sudo ln -s "releases/$RELEASE" /srv/imsweb/maps/current.next
sudo mv -Tf /srv/imsweb/maps/current.next /srv/imsweb/maps/current
sudo nginx -t
sudo systemctl reload nginx
```

`nginx` 是示例 worker group；目标主机使用其他运行组时替换它。若 `current.next` 已存在，先核对
其目标再删除，不能盲目覆盖。回滚执行同一组 `ln -s` + `mv -Tf`，目标改为仍保留的上一 release，
不需要重建或重启应用。

入口切换后验证静态文件和 Range：

```sh
ORIGIN=https://www.example.com
curl --fail --head "$ORIGIN/maps/exchange/sprites/ofm.json"
curl --fail --head "$ORIGIN/maps/exchange/fonts/Noto%20Sans%20Regular/0-255.pbf"
curl --fail --head "$ORIGIN/maps/exchange/natural-earth/0/0/0.png"
curl --fail --silent --show-error --dump-header - --output /dev/null \
  --header 'Range: bytes=0-16383' \
  "$ORIGIN/maps/exchange/openfreemap-z0-11.pmtiles"
```

最后一条必须返回 `206`、`Accept-Ranges: bytes`、正确的 `Content-Range: bytes 0-16383/<size>`
和 `Content-Length: 16384`。

## 目录与路由

- 静态 Web 地图资源通过 `mapsPath()` 管理 `/maps` 前缀。
- 大型 tile/glyph/sprite 可放在对象存储或宿主机版本目录，由同源 Nginx/Hono 入口转发。
- API route、middleware path ownership 和 Web asset URL 使用 `@imsweb/contracts/paths`；路径变更
  同时更新 frontend routing contract。
- 地图响应设置正确 MIME、immutable cache（带版本的资源）、ETag/Last-Modified 和 Range。
- 公开响应保留 OpenStreetMap/OpenMapTiles/OpenFreeMap 或实际数据源要求的 attribution。

## 更新流程

1. 在隔离目录下载新上游快照并验证 checksum、许可证和 manifest。
2. 运行 `node scripts/maps/prepare-exchange-map.mjs --apply` 生成 z0–11 PMTiles、glyph、sprite 和
   raster，并
   核对 `manifest.json`。
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
- 在线模式在上游不可达时显示可重试错误，自托管模式在断开上游网络后仍可加载；
- 回滚到前一版本不要求重新构建应用。

第三方公开 Key/Token 由后台配置交付，服务端安全密钥只保留在私有部署配置。生产默认源必须登记来源、
保留 attribution，并能通过后台配置切换回已验证的可用源。
