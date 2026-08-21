# 资产来源记录

> 文档类型：治理
> 状态：Active
> 权威来源：`apps/web/public/`、`apps/web/.rules` 和提交中的资产文件

本文件记录 `apps/web/public/` 中需要单独核对来源和许可的静态资产。源文件出现在内部或旧版
工程中，不等于已经取得复制、修改或公开分发许可。代码采用 MIT 不会重新授权第三方图片、
字体、商标、角色或地图数据。

## 品牌资产

### 站点 Logo

`public/brand/imsweb-logo.webp` 是站点交付 logo，源自 Legacy
`public/assets/images/logo.png`，尺寸为 545 x 188，SHA-256 为
`dc6dc2bc6572103a14bacf478aacb42a4aa7af1a64a9ec4f4f540ceead5bc072`。源 PNG 不进入 public；
运行时和测试统一使用 WebP。

### 系列墙与随机 icon

以下六张 585 × 500 WebP 图片仅服务于首页/作品页系列墙。页面漂浮 motif 和浏览器标签页
随机 icon 均使用 Wiki 公开目录返回的企划 icon，不复用这些企划介绍图。它们是 public 中唯一
保留的系列墙视觉素材；独立系列 logo PNG 和未压缩墙面 PNG 均不再单独交付，避免同一素材维护多份副本。

| Web 路径                                         | Legacy 来源路径                                       | SHA-256                                                            |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `public/brand/series/wall/765pro.webp`           | `public/assets/images/Production/765intro.png`        | `63da4813056133985026a0bdca7306fac3ec3a1623a954a573c55077a7976ef3` |
| `public/brand/series/wall/cinderella-girls.webp` | `public/assets/images/Production/Cinderellaintro.png` | `a82350e4e94c043525769a003b4a15609cdb4db742701335d13d3f727bb807c8` |
| `public/brand/series/wall/million-live.webp`     | `public/assets/images/Production/Millionintro.png`    | `a271dcd8a33ce71e21f4c957a813042c9c5f54dd33f73d73d888be4f5ab66272` |
| `public/brand/series/wall/sidem.webp`            | `public/assets/images/Production/Sidemintro.png`      | `bded4f68a603c8f1d060b5cf2b35ef3f95fff4939df972d9f0cf1e688598cbec` |
| `public/brand/series/wall/shiny-colors.webp`     | `public/assets/images/Production/Shinyintro.png`      | `19c28aba0714205de23238a59012288b503d388d0b4922d430919070247f4bb3` |
| `public/brand/series/wall/gakuen.webp`           | `public/assets/images/Production/Gakuenintro.png`     | `0205ebb95118b234635b57d5d2a7b2043f5cecf52cb8720fe80976d12816d09d` |

文件由源图转换为 WebP，未改变构图；系列商标和人物图像的权利仍归各自权利人。浏览器
随机 icon 使用 `image/webp` 类型，页面代码必须从 `seriesWallItems` 读取这些路径，不得
重新建立另一套 icon 清单。

`public/favicon.ico` 是站点默认 fallback。未来替换时必须补充作者、原始来源、许可证或书面
授权、使用范围、修改情况和 SHA-256。

## Wiki 视图切换图标

`public/brand/wiki-view-switch.png` 由仓库维护者直接提供，用于新版与经典 Wiki 之间的视图
切换。文件保持原始 PNG 字节，未裁切、重绘或转换；尺寸为 167 x 167，SHA-256 为
`9cda55e6d140050e2bc8a637cda6fa6e6d12596611e1d58bb706cd96c1cac076`。书面授权范围限于
IMSWeb 公开 Web 的 Wiki 视图切换入口，不自动扩展到其他用途或再许可。

## 地图数据与样式

`public/maps/exchange-style.json` 以 OpenFreeMap Bright style 为基础，来源为
`https://tiles.openfreemap.org/styles/bright`。为满足同源交付合同，仅改写了四类资源
地址：planet source 改为 `/maps/exchange/openfreemap-z0-11.pmtiles` 的 PMTiles protocol 包装，
Natural Earth raster、sprite 和 Noto Sans glyph 改为 `/maps/exchange/` 下的同源路径，并在 source
内显式保留 attribution 和 `maxzoom=11`；图层定义未改。改写后文件大小为 48948 字节，SHA-256 为
`80acb67b53fd455ca3795ac83e04d2c63f2517236fb478b0b4c240f9fd8fe6fa`。OpenFreeMap styles 仓库
整体采用 MIT；Bright 上游代码、设计、字体、图标和 Natural Earth 数据继续适用各自许可。IMSWeb
运行时通过 MapLibre paint property 覆盖配色。

生产资源由固定 OpenFreeMap snapshot 裁剪为全球 z0–11 PMTiles，并与 Natural Earth raster、
sprite、三套 Noto Sans glyph 一同通过当前站点 `/maps/exchange/` 提供；浏览器不再请求
`tiles.openfreemap.org`。构建产物体积较大，位于 Git 忽略的 `data/maps/` 或生产宿主机
`/srv/imsweb/maps/`，不进入 Web public 和应用镜像；每个 release 的来源、字节数和 SHA-256 由
`manifest.json` 记录。具体版本与生成命令见[地图资源交付与同源托管](../operations/map-delivery.md)。
MapLibre attribution 必须显示 OpenFreeMap、OpenMapTiles 和 `Data from OpenStreetMap`；
OpenStreetMap 版权和许可说明以 `https://www.openstreetmap.org/copyright` 为准。

`public/maps/china-provinces.json` 来源为阿里云 DataV GeoAtlas 的公开接口
`https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`，处理时移除了 `100000_JD`
插图及海南远端南海岛屿多边形，SHA-256 为
`e5dfb9afc4ab94ea5ea09208397c4c000646db0c8bb2706207ca49bbc63b9017`。该数据不标记为 MIT，
公开部署和再分发继续受上游条款及仓库维护者授权范围约束。

`public/maps/china-boundary-dashes.json` 从同一上游 GeoJSON 中提取 `100000_JD` 要素，仅在外层
包装为 FeatureCollection，SHA-256 为
`f30afc651f83a8da6e203889dc3fa3de46ae3588be23cde69e979961dca590cd`。该文件用于中国全图展示的
南海断续线；其数据许可边界与上一文件相同，不标记为 MIT。若需要法律层面的完整覆盖，必须改用
经主管部门审核并取得审图号的数据，或取得明确的再分发授权。

## 新增资产要求

新增静态资产必须满足：

- 权利人和原始来源可验证；
- 许可证或书面授权允许公开分发及预期使用；
- 修改、裁切或格式转换已记录；
- 文件 SHA-256 与提交内容一致；
- 商标或人物素材不会因代码采用 MIT 而被错误标记为 MIT。

无法满足以上条件的文件不得进入公开仓库或发布产物。
