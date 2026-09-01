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

### App icon

`public/brand/imsweb-app-icon.png` 是桌面/移动客户端的应用图标源文件，画布 1024 x 1024。它由仓库维护者通过已配置的
`gpt-image-2` 图像生成及图像编辑 API 创建：服务输出的 1254 x 1254 PNG 被标准化为仓库中的 1024 x 1024 源文件。
提示词限定与主站 logo 呼应的左上 `im`、右下 `@s` 阶梯布局、红色 `@`、银色金属字面、黑白双层描边和右倾斜体；只借用
构图节奏，不复制主站的中文字形，也未导入第三方图像。仓库维护者随后重建无框的银色底面，移除全画布暗影和生成图外框，
使 iOS 系统圆角成为唯一的应用图标外形；最后通过图像编辑保留原有上下阶梯位置，仅横向向中心收拢，并让红色 `@`
以前景层覆盖相邻银色字面，修复重叠处的断裂描边、残片和背景拼接痕迹。仓库维护者随后将完整字标组作为单层移动到画布中心，
不改变字形间距、大小或前后层级；最终可见字标包围范围的中心为 `(511, 511)`，与 1024 px 画布中心相差不足 1 px。

| Web 路径                           | 字节数 | SHA-256                                                            |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| `public/brand/imsweb-app-icon.png` | 356397 | `de20945c1ebba390dd658120a3aaf46c3bd3d1b9b282d2f359b76923935520fa` |

Android launcher icon 另有三张仓库内图层源文件。背景层按主图每行两侧的无字标像素重建，保留银色横向纹理；前景层从同一主图分离字标和局部阴影，并缩放到 adaptive icon 安全区；单色层复用前景 alpha，供 Android 13 及以上的主题图标使用。这些处理未引入第三方图像。

| 仓库路径                                                 | 字节数 | SHA-256                                                            |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `apps/web/src-tauri/icon-sources/android-background.png` | 8652   | `f7cca8cae5d0b051c89302a346cc488cdd77968ac52b1c4f9ba2df4fde64326a` |
| `apps/web/src-tauri/icon-sources/android-foreground.png` | 488011 | `239f26fe661906c19fcb28e62f378568457b5bb900d1a4c7c78807f3f60dd3e7` |
| `apps/web/src-tauri/icon-sources/android-monochrome.png` | 105269 | `2b320c63a2abc6b2e9cc00a19dcbd23c66141ef59d0e72d4fca84c73559bb0ef` |

`apps/web/src-tauri/icon-sources/app-icon.json` 定义默认图、Android 图层和旧版 launcher 的前景缩放比例。`apps/web/src-tauri/icons/` 下的 PNG、`icon.icns` 和 `icon.ico` 全部由该 manifest 经 `pnpm run icon:app` 派生，不单独登记；替换任一源图后必须重新生成，并同步更新上表的字节数与 SHA-256。

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

`public/maps/exchange-test-style.json` 是仓库维护的 MapLibre GL 测试样式，仅组合现有
`china-provinces.json`、运行时追加的 `china-boundary-dashes.json` 和 API 返回的事务所点。该样式
不包含 PMTiles 或 sprite，只有为 MapLibre schema 保留的同源 glyph 模板；由于测试样式没有文字
图层，浏览器不会请求 glyph 文件。它不是生产底图。文件大小为 1031 字节，SHA-256 为
`f6f9ee3226e11534230e4e1eca8a6ece4eb878e1c9fe0290f2ba4c3dbe5e3fd1`。GeoJSON 的来源、处理方式和
许可边界仍以下文登记为准。

生产默认直接使用官方 `https://tiles.openfreemap.org/styles/positron`。运行时通过 HTTPS 读取
OpenFreeMap style、OpenMapTiles vector tile、Natural Earth raster、sprite 和 Noto Sans glyph，
无需 API key；App 不包含 PMTiles 或 tile tree。自托管仍可使用固定 OpenFreeMap snapshot，产物位于
Git 忽略的 `data/maps/` 或生产宿主机 `/srv/imsweb/maps/`，每个 release 的来源、字节数和 SHA-256
由 `manifest.json` 记录。两种模式的配置与验证方式见[地图资源交付](../operations/map-delivery.md)。
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
