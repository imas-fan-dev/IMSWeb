# 地图与事务所地点搜索

## 1. Scope / Trigger

修改公开地图搜索、事务所地点选择、provider 配置或访问策略时读取此规范。源代码以 `locations/routes.ts`、`place-search-policy.ts`、`search-places.ts` 和 `config/env.ts` 为准。

## 2. Signatures

`GET /api/community/exchange/places/search?q=<keyword>` 由 `searchFudabaPlaces(query).send()` 调用。结果选择传递现有 `FudabaPlaceSearchResult`，地图客户端只移动视点，不持久化搜索坐标。

## 3. Contracts

- 既有 query schema 保留 `legacyStripRequestObject` 兼容策略，q trim 后为 2 至 120 字符，拒绝 ASCII control。新 JSON 契约仍使用 contracts strict request / exact response 规则。
- response 为 `{ success: true, items, attribution }`，最多五项，每项含 id/label/address/city 和 exact lat/lng。保留精确 JSON response conformance。
- country_code=cn 且 state 为北京、上海、天津、重庆的完整市名时，city 使用该直辖市，避免 provider 将市辖区当作 city。其余地址保持原层级回退。缓存 key 为 `fudaba:place-search:v2:<sha256>`，映射更改需隔离旧响应。
- publicRead 与 map 都为 true 时允许匿名读取；否则要求 write=true 和 Platform authentication。owner read/write、CSRF、active account 和地图审核不受此策略影响。
- `IMS_FUDABA_GEOCODING_ENDPOINT` 为空时禁用服务。有值时必须为无凭据、无 query/hash 的 HTTPS URL，`IMS_FUDABA_GEOCODING_USER_AGENT` 为 10 至 200 可打印字符，COUNTRY_CODES 默认为 cn。
- Compose 显式转发全部三个变量；统一 dev 使用 IMS_DEV_* 对应变量。模板有变量不代表容器已收到变量。
- 服务端共享 Valkey 缓存 TTL 为 86400 秒，缓存键包含 endpoint、countrycodes、语言和标准化 query；未缓存请求消费 `fudaba-geocoding-provider/global` 的全应用每秒一次额度。
- 浏览器只在按钮或 Enter 显式提交时查询。Enter 阻止外层事务所 form submit。显示 attribution、加载、错误和空结果。
- 所有者地点选择只更新城市、地址和精确坐标，并保留其他草稿字段。公开 map offices 的 regional 0.1 度坐标来源保持原契约，搜索 marker 是独立客户端对象。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| q 长度或 control 无效 | 400，provider 不被调用 |
| 无 public map 分支且 write=false | 既有 text/plain 404 |
| office-only 分支且未认证 | 401 |
| endpoint 或必要 runtime ports 缺失 | 503 FUDABA_PLACE_SEARCH_UNAVAILABLE，UI 提示服务尚未配置 |
| provider 配额耗尽 | 429 FUDABA_PLACE_SEARCH_BUSY + Retry-After |
| provider 失败或格式无效 | 502 FUDABA_PLACE_SEARCH_FAILED |
| 成功空列表 | 明确提示换用城市加场馆名或完整地址 |
| 命中共享缓存 | 返回相同响应，不调用 provider 或消费 provider 限流 |

## 5. Good / Base / Bad Cases

Good：真实 Nominatim 上海市查询经过 Hono route 和 Valkey，得到地点并选择移动地图。Base：未配置 endpoint，明确提示服务未配置。Bad：把城市事务所过滤当成地点搜索；在输入每个字符时调用公共 provider；把公开区域点换成所有者 exact 坐标。

## 6. Tests Required

`fudaba.test.ts` 覆盖匿名 public map 分支、两个 flag、office auth、write 关闭、exact response、缓存与 limiter、现有量化位置。Web tests 覆盖 Enter 不保存、点击、状态、草稿保留、selectedPlace recenter / marker 清理。Playwright desktop/mobile 检查显式请求、选择后 bbox、键盘焦点和移动边界；事务所流程在 Enter 和结果选择之后断言名称、介绍草稿保持且没有 office/location PUT。App 地图在 portrait/landscape 验证按钮查询、归属文本、定位及 marker 清理。

真实 provider 验证独立记录，搜索须经绑定 HTTP 的应用服务器和 Web proxy，选择后证明 bbox 包含返回坐标，并在实际 MapLibre canvas 渲染地图细节后截图。允许其他目录数据使用契约化 fixture，但不得拦截 geocoder response。App browser 验证使用已构建的 App bundle 和仓库 `FrontendStaticAssets` 路由策略；普通 Vite preview 的任意路径回退可能送出首页 prerender，不能证明目标页面已加载。浏览器证据不等同于原生设备验证。

## 7. Wrong vs Correct

Wrong：只在 `.env.example` 声明 provider，Compose 不转发；输入 Enter 触发表单保存。

Correct：Compose 将 provider 三个配置传入 API，缺省保持显式禁用；搜索输入拦截 Enter，调用相同服务器端查询并显示结果，选择仅改变地点相关字段或客户端地图视点。
