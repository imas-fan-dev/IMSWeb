# 地图渲染与当地语言策略

> 文档类型：架构
> 状态：Decision
> 权威来源：本文的产品约束、Web 地图适配器、地点搜索 handler、Mapbox 官方数据与 SDK 文档

本文定义交换地图的渲染资源设计：沿用浅蓝灰地理底图，以当地原名标注国家、行政区、城市、
道路与兴趣点，让社区事务所点位保持最高的信息优先级。语言按地物所在地解释，与访问者的
浏览器语言、站点界面语言和底图的地理覆盖范围相互独立。

本文是渲染与语言的设计约束，不表示所有服务商与发布样式已完成相应实现或验收。
实际运行行为以 [Mapbox 适配器](../../apps/web/app/pages/community/exchange/mapbox-driver.ts)、
[语言适配器](../../apps/web/app/pages/community/exchange/mapbox-map-language.ts)、
[配色适配器](../../apps/web/app/pages/community/exchange/mapbox-map-theme.ts) 和
[地点搜索](../../apps/api/src/domains/community/fudaba/locations/handlers/search-places.ts) 为准。
资源交付、坐标、版权和服务商分流遵循[地图资源交付](../operations/map-delivery.md)，
界面设计遵循 [Web 设计系统](../../apps/web/DESIGN.md)。

## 扩展与适配边界

### 单渲染器约束

国内外底图聚合优先使用一个地图渲染器、一个交互相机和一个 WebGL Canvas。
双 SDK 同步与 SVG 裁剪的实验会运行两套资源加载和渲染循环，实际交互已反馈变慢，
不作为这项能力的交付方案。仅测量参照点的屏幕对齐不能证明底图正确显示；验收还必须检查
大陆与海外实际画面、街道层级、连续拖动与缩放，以及单渲染器数量。

现有 Mapbox、MapLibre 和高德适配器保留各自独立入口；组合模式固定使用 Mapbox 底图。
高德只负责中国大陆范围的地点搜索，不创建高德地图，不随平移或选点切换 renderer。
Mapbox 样式与 Token、高德搜索 Key 和安全代理分别由各自配置源拥有。

旧的“高德渲染大陆、Flexible 图层叠加海外 Mapbox 栅格瓦片”模式已废弃，不再注册
geographic renderer。Mapbox 上自绘高德店铺按钮的实验同样停止：它不能复用高德原生标签
密度与避让，不作为店铺图层交付。现有 `regional` 配置继续携带两份源引用，但 renderer
仅消费其中的 Mapbox 配置，高德源只提供搜索服务。不存在地区引擎切换或原生 POI 标签混合。

提交搜索时快照当前地图中心，按高德官方 DistrictSearch 国家轮廓扣除港澳台判定搜索地区。
WGS84 中心先经官方正向转换为原生坐标，不以访客 IP、设备所在国家或关键词猜测地区。
大陆仅查询高德，海外（含港澳台）仅查询 Mapbox；失败不静默查询另一家。远离中国包围范围时
可直接选海外服务，但包围范围本身不能作为大陆归属判断。搜索地区切换不改变地图实例。

[组合入口](../../apps/web/app/pages/community/exchange/map-providers/regional.tsx)只创建 Mapbox renderer。
[搜索编排](../../apps/web/app/pages/community/exchange/region-place-search.ts)拥有地区查询与距离排序。
设备定位通过现有授权定位流程取得，仅保存页面内存且超过 60 秒不再当作当前定位。结果统一为
WGS84 后按与设备位置的球面直线距离稳定升序排序；无有效定位时回退地图中心，显示“距地图中心”
而非“距你”。排序只覆盖本次返回的最多 5 个候选，不保证全局最近地点，也不是路线距离。
提交后相机或定位更新不更换 searcher owner、不重排既有结果；新请求与卸载仍受取消保护。

全球店铺、图标和文字由 Mapbox 底图负责加载与排版，不通过高德周边搜索复制常驻标签。
显式关键词搜索每家最多返回 5 条结果，不抓取或缓存全量店铺。
跨底图展示高德搜索数据须先确认[高德服务协议](https://lbs.amap.com/pages/terms/)所需的授权；
实现功能和保留署名不代表获得许可。

组合模式的高德搜索结果通过官方 `convertFrom(..., "gps", ...)` 正向服务做临时数值反求，
转换为 Mapbox 可显示和距离可比较的 WGS84 估计：
最多 5 轮修正，再次正向验证残差不超过 1 米；失败或不收敛时不展示错位结果。
这一残差只衡量正向服务与估计值的一致性，不承诺真实地点的绝对定位精度，也不是官方逆转换 API。
实现由[搜索坐标桥接](../../apps/web/app/pages/community/exchange/amap-search-coordinates.ts)拥有，
不使用本地 GCJ 公式。取消后丢弃迟到结果，不将估计位置写入业务 API、数据库或会话视角。
业务点与初始视角仍保持 WGS84；独立高德 renderer 继续使用官方正向转换。

Mapbox 底图的语言、字体、配色及版权沿用独立 Mapbox 适配器。高德搜索失败不影响底图，
地区搜索失败不影响底图；结果保留实际服务商署名，排序提示不作为错误展示。验收应检查实际地点、连续手势和单地图实例，
不能只凭请求成功或误差 fixture 宣称真实 SDK 定位已验收。

### 事务所与地点搜索

地图搜索默认展示“事务所”Tab，“地点”Tab 保留服务商搜索。Web、App DOM 与 iOS 原生面板
共用搜索状态；切换保留关键词、取消旧请求，并推进原生结果版本，防止旧结果操作跨 Tab 生效。
事务所按名称、城市和地址查询公开名录，支持分页，不局限于当前视口；地点查询仍遵循上述地区策略。
成功结果不展示排序或搜索范围说明卡，每条地点的距离与服务商署名单独保留。

点击事务所结果在现有地图中定位，不导航到详情页。只有地图功能开启时，关键词搜索响应才交付
已审核发布、符合地图资格的区域位置；不交付事务所原始精确坐标。未公开位置的结果明确标明
不可定位。区域位置以区域尺度展示；选择、切换 Tab 和展开面板不重建地图。
右上角范围列表的展开和收起保留宽度及高度过渡，关闭时内容不可交互，减少动态效果时取消过渡。

### 业界实践与证据边界

评估多服务商方案时，分别核对供应商抽象、同一渲染器接入外部图层、按地理边界拼接底图。
支持多个服务商不等于同时拼接多个底图；一个页面或一个相机也不等于只有一个 Canvas。

| 第一方资料 | 已公开的做法 | 对本设计的参考范围 |
| --- | --- | --- |
| Airbnb [AirMapView](https://github.com/airbnb/AirMapView) 与 [CHANGELOG](https://github.com/airbnb/AirMapView/blob/master/CHANGELOG.md) | 用统一 View 抽象地图服务商，支持运行时切换和无可用原生服务商时的 Web 回退；2018 年的 1.7.0 加入支持 Google、百度、高德的 Leaflet 类型 | 支持业务交互与供应商解耦；历史开源能力不能证明 Airbnb 当前生产配置，也不能证明按国界拼接 |
| 蚂蚁 AntV [L7 源码说明](https://github.com/antvis/L7/blob/master/README.md) | 明确将高德底图对应国内需求、Mapbox 对应国际化需求；初始化示例通过 `Scene` 的 `map` 传入底图适配器 | 与国内外供应商分工及共享业务层相近；说明没有建立两家底图在同一画面中按边界拼接，也没有承诺单 Canvas |
| Uber [Mapbox 与 deck.gl 集成工程文章](https://www.uber.com/us/en/blog/uber-visualization-mapbox/) | 2018 年公开让第三方业务图层与 Mapbox 绘制到相同 WebGL context，并允许业务图层进入底图的地理与标签层之间 | 直接支持共享渲染上下文的工程方向；案例是 Mapbox 与业务可视化图层，不能作为高德与 Mapbox 地理拼接的证据 |
| Grab [GrabMaps 工程文章](https://engineering.grab.com/building-hyperlocal-grabmaps) | 以 OpenStreetMap 为基础，融合当地规则及自有数据，再向下游服务提供整合结果 | 支持多来源数据先统一处理；文中的整合结果不等于同一客户端视图，也不能证明渲染器或 Canvas 数量 |

deck.gl 的[官方 MapboxOverlay 文档](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay)
进一步区分两种模式：默认叠加模式创建独立 Canvas；`interleaved: true` 将图层放入底图的
图层栈，共享 WebGL2 上下文，并由 `getCanvas()` 返回底图 Canvas。这一接口属于 Mapbox／
MapLibre 集成，不能推定高德提供相同接口，也不构成引入 deck.gl 的理由。

Uber 的[司机端地图工程文章](https://www.uber.com/us/en/blog/building-a-scalable-and-reliable-map-interface-for-drivers/)
还将地图设为贯穿 App 生命周期的背景视图，由 Camera Director 汇总业务相机规则。
这支持集中管理相机与地图生命周期；原生 MapView 的实例管理不构成浏览器 Canvas 数量的证据。

这些来源支持统一业务接口、减少独立渲染资源的设计依据，不能作为跨服务商数据授权或
已完成地理拼接的证据。当前采用固定 Mapbox 底图与地区搜索，不再实现地理瓦片拼接。
单 Canvas 数量与请求成功均不能替代实际地图正确性、地点定位和性能证据。

### 现有适配入口

交换地图页面只使用 [ExchangeMapInteractionProps](../../apps/web/app/pages/community/exchange/exchange-map-provider.ts)
描述事务所、选择、视口、遮挡与错误，不按服务商名称决定组件。异步组件选择集中在
[renderer 注册入口](../../apps/web/app/pages/community/exchange/exchange-map-renderer.ts)，
配置必须显式提供 `provider` 并恰好匹配一个注册项，缺失、未知或重复注册明确失败。

| 边界 | 职责与扩展位置 |
| --- | --- |
| 后台配置 | [provider catalog](../../apps/web/app/lib/maps/provider-catalog.ts) 注册字段、默认草稿、摘要与地区偏好；表单不包含服务商分支 |
| 页面渲染 | `map-providers/` 中的工厂绑定配置与渲染组件，SDK 随对应模块加载 |
| 地图操作 | [MapDriver / MapView](../../apps/web/app/lib/maps/map-engine.ts) 定义就绪、范围、屏幕投影、标记、相机与销毁；共享交互层不解释 SDK 对象或原生坐标 |
| 地图搜索 | [搜索注册入口](../../apps/web/app/pages/community/exchange/exchange-map-search.ts) 按服务端下发配置加载搜索实现；页面不判断服务商 |
| 服务端策略 | [provider policy](../../apps/api/src/domains/community/fudaba/map-delivery/map-provider-policy.ts) 拥有存储字段、验证、公开投影、搜索策略、配置错误说明、去重标识与审计说明 |
| 初始化集合 | [bootstrap](../../apps/api/src/domains/community/fudaba/map-delivery/map-delivery-bootstrap.ts) 接收显式 provider 配置，仅管理数量、名称唯一性与 ID；名称和去重规则来自 policy |

高德和 Mapbox 通过 `MapView` 复用交互层；MapLibre 的渲染组件继续拥有已有图层、合规处理与
聚合实现，通过相同的页面交互接口接入。新增服务商时增加其配置 contract、provider 定义、
适配器和注册项，不修改页面、配置表单或来源管理 handler 中的服务商分支。

所有业务位置使用 WGS84；坐标转换、服务商原生视口恢复、主题参数、原生事件和版权位置均由
适配器处理。打开地图接受取消信号，取消覆盖初始化、晚到的转换与已就绪资源；销毁幂等。
搜索选择另带取消信号，旧选择的异步转换不能覆盖新的相机意图。初始化失败必须释放已经创建
的原生地图；SDK 错误详情不直接展示给访客，只有适配器提供的静态分类说明可以展示。

### 地图内搜索与地址写入

map-config 按后台配置生成地图和 `search`，不按访问者 IP 选择服务商。组合搜索的 wire
仍沿用 `federated` discriminator，但运行时按提交时的地图中心只请求一家，不再并行合并。
搜索候选按有效用户位置距离排序，缺失定位时按地图中心排序；选点仅定位同一张 Mapbox 地图。
单源的 policy 继续生成原有对应搜索配置。
MapLibre 默认使用现有 Nominatim-compatible API；高德使用官方 `AMap.PlaceSearch` JS 插件；
Mapbox 使用官方 Geocoding v6 查询全球地址与地名。后者不提供 Search Box 的 POI 搜索能力，
也不受原 Nominatim 配置的 `countrycodes` 限制。调整底图与搜索的配对集中修改 policy 的
`search`，无需向请求 middleware 或页面增加服务商分支。公开配置必须提供完整 `search`，不推断缺失字段。

存储只读写版本 4，所有源显式声明服务商。不读取早期单样式对象或版本 1–3；不支持或损坏的对象
恢复部署初始化集合，同时保留 revision 供管理员明确替换。版本升级中的存量数据转换是独立操作，
不在运行时保留兼容分支。

地图显示搜索使用 Web 本地的 `MapSearchPlace`：WGS84 或明确标记服务商的原生 target。
`addSearchMarker` / `focusSearch` 由适配器解释 target，高德 POI 原生坐标不得再次执行 GPS 转换。
普通 `project` / `addMarker` / `focus`、事务所编辑搜索和所有写入 API 继续只接受 WGS84。
原生搜索面板仅接收 ID、名称与地址，选择时由 Web 当前结果列表解析，坐标不进入面板快照。

搜索结果只保留在当前页面内存。Mapbox 使用临时模式，关闭浏览器请求缓存，搜索定位产生的视口
也不写入 App 的 `sessionStorage`；普通事务所／设备定位恢复常规视口保存。切换搜索配置时立即
清除旧结果并取消旧请求，晚到的 SDK 回调、网络响应不能更新新来源的状态；同一来源后续查询失败时，
保留上一批结果的署名及当前选中地点的独立署名。请求校验仍执行共享 contracts，配置错误文案
由 policy 提供，middleware 只处理 JSON、schema、通用操作类型和 422 响应。

## 当地原名优先

“各国优先使用国家语言”落实为每个地物优先显示数据源提供的当地名称。同一视口内的不同国家
可同时使用不同语言；平移地图或切换站点界面语言不得把所有地名统一翻译成一种语言。

| 示例区域 | 优先显示示例 | 规则 |
| --- | --- | --- |
| 中国大陆 | 北京、上海 | 保留当地中文名称 |
| 日本 | 東京、大阪 | 保留日文原名，不优先使用 Tokyo、东京 |
| 韩国 | 서울、부산 | 保留韩文原名 |
| 泰国 | กรุงเทพมหานคร | 保留泰文原名 |
| 阿拉伯语地区 | دبي | 保留阿拉伯文并正确连接、从右向左排版 |
| 德国 | München | 保留变音符号，不优先使用 Munich |
| 多语言地区 | 数据源提供的当地名称或多语言名称 | 不用国家代码强制映射为单一语言 |

这些示例用于说明语言选择，不承诺上游一定返回相同拼写或标签粒度。多语言国家、地方语言、
自治地区及跨境地理实体沿用上游的当地命名约定，不建立手工维护的“国家 → 唯一语言”表。
名称语言与行政边界、worldview 分别管理，切换语言不得顺带改变边界表达。

名称回退依次为：非空当地原名、上游提供的拉丁转写或英文名、其他可用名称。仍无名称时不显示
该文字，保留地物几何。不得通过机器翻译编造地址，也不得用空字符串覆盖已有可用名称。
中文译名可作为地点详情的辅助信息；底图默认只显示当地名称，避免全球双语标签增加遮挡。

## 资源与渲染层次

| 资源 | 设计职责 | 管理边界 |
| --- | --- | --- |
| Style JSON | 地理层级、文字表达式、字体、图标、显示密度 | 后台选择发布样式；语言与配色规则分开维护 |
| Vector tiles | 几何、当地名称、转写与地址属性 | 使用服务商授权数据，不因国家变化生成多套世界数据 |
| Glyph | 拉丁文、中日韩、泰文、阿拉伯文等字形 | 使用实际发布且覆盖所需字符的字体堆栈 |
| Sprite | 道路盾牌、交通与基础 POI 图标 | 保留服务商图标与编号语义 |
| 社区点位 | 事务所、聚合数量、选中状态与搜索定位 | 使用业务数据，独立于底图样式 |
| 搜索地址 | 可选择地点的名称和地址 | 地图内查询按 policy 选择官方搜索或自有 API；地址写入使用独立规范坐标 API |

瓦片、glyph 和 sprite 按视口与缩放层级加载，不为每个国家打包一份地图，不预下载全球字体。
Mapbox 资源通过其授权资源链交付；自托管资源遵循现有交付规范，不把 Mapbox 资源复制到公开目录。
业务点位与底图分层，更新底图文字不重建事务所数据，也不改变公开坐标精度。

### 视觉与密度

颜色值由 [map-theme.ts](../../apps/web/app/lib/maps/map-theme.ts)
统一拥有，本设计不建立另一套颜色令牌。建议继续使用以下信息层次：

- 陆地和建筑使用浅蓝灰，水面使用淡蓝，绿地使用低饱和绿色，保持连续且安静的地理背景。
- 道路按等级区分亮度和线宽；铁路、边界保持可辨认，避免与社区标记竞争。
- 国家与主要城市标签使用较深文字，街道和普通 POI 次之；文字保留浅色 halo，保证复杂背景下的可读性。
- 社区标记、选中点和聚合数量处于最高视觉层级；品牌色用于有意义的状态，不染色整个国家或底图。
- 保留 Mapbox logo、版权和反馈入口，不对整个 canvas 使用滤镜。

| 缩放层级 | 建议主要信息 |
| --- | --- |
| z2–5 | 国家、主要城市、社区聚合 |
| z6–10 | 城市、主要交通、水系与区域聚合 |
| z11–14 | 街区、主次道路、重要交通与 POI |
| z15 及以上 | 数据允许时显示建筑、街道、门牌和附近 POI |

缩放表定义信息密度目标，不替代服务商原生相机范围与数据能力。较低层级不得强制显示所有
街道和 POI；不同文字系统沿用实际字形宽度、换行和碰撞检测，不能用缩小字体解决拥挤。

## Mapbox 的实现边界

### 经典样式

优先以现有官方 `streets-v12` 作为规则可控的基线，复用已存在的配色适配器。
Mapbox Streets v8 的 `name` 表示当地名称；`name_en`、`name_ja`、`name_zh-Hans` 等表示翻译。
适配时必须同时核对瓦片的实际语言配置与图层的 `text-field`，不能只修改其中一层。

语言适配器由 `mapbox-driver.ts` 在每次 `style.load` 后调用，与配色适配器独立。
仅处理已识别的 Mapbox 名称字段及其标签层：国家、行政区、聚落、道路、交通站点、水系与 POI。
保留原表达式的缩放条件、格式化、换行和非名称内容，只替换名称选择逻辑。
不得把所有 symbol 层统一覆盖为同一个 `text-field`，否则会丢失门牌号、道路编号、盾牌及其他数据。
再次加载样式后重复应用不得产生重复文字或累积表达式。

Mapbox GL JS 的 `language: "auto"` 使用浏览器语言，不满足本设计。
省略 `language` 时，瓦片语言仍可能由 source 的 TileJSON 决定，也不能作为当地原名已生效的证据。
不得使用未经当前 SDK 与数据源验证的 `language: "local"`，或仅凭 `name` 字段名断言内容必为原名。
适配器使用 BCP 47 的 `mul`（多语言）请求不指定翻译语言的瓦片，再对已识别的 Streets 名称层
应用非空当地名称优先的表达式。原名缺失时依次使用原样式的名称回退字段与英文名；仅有名称的
双语格式化标签合并为一份原名，带编号等其他信息的格式化标签保留其结构。

### Studio 自定义与 Standard 样式

Studio 自定义样式需先识别其 source 和字段；只处理已确认的地名层，保留自有标注和图标。
无法识别的第三方 source 不得套用 Mapbox Streets 字段规则。

Standard 及使用 imports 的样式不公开全部内部图层，不能直接调用经典样式的逐层 setter。
适配器对 SDK 序列化结果中具有内嵌 `data` 的 import 递归应用相同规则，再通过公开的
`updateImport` 更新该数据，保留配置、颜色和其他图层；未变更的数据不重复提交。
仅有 URL 而没有内嵌数据的 import 不主动补抓资源，仍需验证实际名称，不能仅凭支持填写
style URL 就宣称满足语言约束。无法达到要求时，默认 Mapbox 源应选择已验证的样式。

### 字体与文字排版

地图文字使用样式发布的多文字系统字体资源。仅指定中文系统字体不足以证明日文、韩文或其他
文字系统的覆盖与字形正确；发布样式时应确认字体实际存在于 glyph 服务，而非只填写字体名称。
适配器将 `localIdeographFontFamily` 设为空字符串，在当前 SDK 中关闭本地中日韩字形覆盖，
使用发布样式的 glyph，避免统一强制使用中文系统字体。选择系统字形时则必须分别检查 Web、iOS
与 Android 的字体回退。

阿拉伯语、希伯来语还需要 RTL 排版能力。Mapbox GL JS 3.33 起提供内置支持；较早版本应按官方
说明接入兼容的 RTL 插件。当前适配器按需注册官方 v0.4.0 插件，复用 SDK 全局插件状态；
加载失败只通知仍处于活动状态的地图。升级 SDK 与引入插件分别验证，不能把字形存在等同于排版正确。
验收同时覆盖连写、混合方向的名称和编号、泰文组合字及拉丁变音符号。

## 搜索地址与业务数据

底图标签、搜索地址和用户保存的地址是三个独立边界。搜索必须继续允许用户用中文或其他语言
输入关键词；展示结果优先采用地点所在地的原名，不能把输入语言当作地物语言。

现有规范坐标搜索 handler 明确使用 `zh-CN,zh,en`。地图内查询展示各上游原样返回的名称与地址，
不在渲染层翻译，也不承诺上游每次都提供当地原名。要统一规范坐标搜索体验，应由该 API 的 owner 调整为当地原名
策略，而非由 Mapbox 渲染器翻译结果。Nominatim 官方实例在既无 `accept-language` 查询参数、
也无 `Accept-Language` header 时使用当地语言；其他 compatible endpoint 须核实自身默认行为。
不得把浏览器 header 直接转发为搜索结果的语言政策。

完整地址的各行政层级也应保留当地表示，不能只替换第一行名称，却继续展示被强制中文化的
`display_name`。只有需要辅助译名时再获取可用的名称详情，不增加每条搜索结果的逐一补查请求。
缓存键必须包含语言策略版本，策略变化后不能复用旧的中文优先结果。

用户手动输入或已保存的事务所地址保持原文；展示策略不得静默重写历史业务数据。
如需增加当地原名、辅助译名或语言标签，先在共享 contracts 中定义真实 wire 数据，不能在 Web
虚构上游未提供的多语言字段。

## 验收条件

语言正确性须同时检查实际瓦片属性和最终可见文字；单元测试中的模拟数据只证明规则执行，
不能证明真实世界数据覆盖。至少覆盖中、日、韩、泰、阿拉伯文、希伯来文、拉丁变音符号和
多语言地区，分别在国家、城市与街道层级检查。跨国视口应同时保留各地语言。

Web 桌面、移动视口与实际 App WebView 均需检查字符缺失、RTL、标签碰撞、缩放、重新加载样式、
社区标记与版权可见性。地点搜索应验证用中文查询海外地点后，结果名称与完整地址仍按当地
原文展示，并验证缓存不会恢复旧语言政策。

验收目标是“有当地名称数据时必须优先采用”，不能承诺上游每个国家的每个地址都存在完整原文。
缺失原名应按回退规则保持可用，具体缺失样本保存在测试或发布证据中，不伪造本地名称。

## 官方参考

- [Mapbox Streets v8 名称字段](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)
- [Mapbox GL JS Map 语言与字体选项](https://docs.mapbox.com/mapbox-gl-js/api/map/)
- [Mapbox 国际化与瓦片语言](https://docs.mapbox.com/help/dive-deeper/maps-internationalization/)
- [Mapbox RTL 支持](https://docs.mapbox.com/mapbox-gl-js/example/mapbox-gl-rtl-text/)
- [Nominatim 搜索结果语言](https://nominatim.org/release-docs/latest/api/Search/#language-of-results)
- [Mapbox Geocoding 与临时结果](https://docs.mapbox.com/api/search/geocoding/)
- [高德 JS API PlaceSearch](https://a.amap.com/jsapi/static/doc/20230922/index.html?v=2#placesearch)
