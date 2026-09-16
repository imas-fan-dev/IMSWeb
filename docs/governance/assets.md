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

`public/brand/imsweb-app-icon.png` 是桌面客户端的应用图标源文件，画布 1024 x 1024。它现在是**派生**资产：
由 `apps/web/src-tauri/icon-sources/app-icon.svg` 的几何配上亮色底板（`#e0e1e3`，与 `icon.json` 的 light fill 同值）
栅格化而来，与应用图标同源同算法。`pnpm run icon:app` 由它派生出 `src-tauri/icons/` 下的桌面图标、
iOS 旧系统 `AppIcon.appiconset` 的 18 张 PNG，以及 Android 旧版 launcher（`ic_launcher.png`、`ic_launcher_round.png`）。
重生成命令：

```sh
python3 .trellis/tasks/09-15-ios-liquid-glass-app-icon/research/build-icon-layers.py \
    --full-icon apps/web/public/brand/imsweb-app-icon.png \
    --android-background apps/web/src-tauri/icon-sources/android-background.png
```

沿革：本文件先前是仓库维护者用已配置的 `gpt-image-2` 图像生成与图像编辑 API 制作的金属版
（1254 x 1254 输出标准化为 1024 x 1024，提示词只限定与主站 logo 呼应的左上 `im`、右下 `@s` 阶梯布局、
红色 `@`、银色金属字面、黑白双层描边与右倾斜体，未导入第三方图像）。那一版现在只存在于版本库历史里，
可用 `git show <提交>:apps/web/public/brand/imsweb-app-icon.png` 取回；当前版本不再有金属渐变、
双层浅色描边与烘焙投影，与 iOS / Android 图层逐像素同源。

| Web 路径                           | 字节数 | SHA-256                                                            |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| `public/brand/imsweb-app-icon.png` | 12493 | `fd25deff4e087924cfa059c2796326e807e9e7352cfd19e3bb5eaad606e0e2bb` |

Android launcher icon 另有三张仓库内图层源文件。背景层是与 iOS 亮色外观同一个纯平色底板（`#e0e1e3`），
不再保留原来的纵向银色渐变。前景层原为金属版本（字面带纵向渐变与拉丝，黑边外有白环，右下带立体挤出），
现与 iOS 一并扁平化：形状取同一份 SVG 几何，涂色改为 `icon.json` 的三色纯平值，字面光泽、白环与立体挤出都不再保留；
单色层是描边层的 alpha，供 Android 13 及以上的主题图标使用。这些处理未引入第三方图像。

前景层与单色层由 `apps/web/src-tauri/icon-sources/app-icon.svg` 派生，结构说明见下一节。等价的栅格化脚本记录在 `.trellis/tasks/09-15-ios-liquid-glass-app-icon/research/build-icon-layers.py`，只作任务记录，不参与构建：

```sh
python3 .trellis/tasks/09-15-ios-liquid-glass-app-icon/research/build-icon-layers.py \
    --write --svg apps/web/src-tauri/icon-sources/app-icon.svg --out /tmp/icon-layers
```

`app-icon.svg` 是几何真相源。它不含 `<text>`、字体引用或栅格图像；改控制点、圆角半径或描边宽度后跑 `--write`，即可重生成五张 PNG。

| 仓库路径 | 字节数 | SHA-256 |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `apps/web/src-tauri/icon-sources/android-background.png` | 6492 | `1b9292b3df86bc86545096a1dc31786eb6f5536385170863e1337ddb9149083c` |
| `apps/web/src-tauri/icon-sources/android-foreground.png` | 12492 | `397228e63326d96507843a287ea88f850db1a8467c82fdd5ebbd39cabef38efb` |
| `apps/web/src-tauri/icon-sources/android-monochrome.png` | 8174 | `af3bb8109d7064878302a05345b50045842c22979c9bf267fd709541153cc4aa` |

`apps/web/src-tauri/icon-sources/app-icon.json` 定义默认图、Android 图层和旧版 launcher 的前景缩放比例。`apps/web/src-tauri/icons/` 下的 PNG、`icon.icns` 和 `icon.ico` 全部由该 manifest 经 `pnpm run icon:app` 派生，不单独登记；命令会在生成后规范化 ICNS 顶层块顺序，保证相同源图产生相同的版本库内容。替换任一源图后必须重新生成，并同步更新上表的字节数与 SHA-256。

### iOS Liquid Glass 图标

iOS 26 及以上改用 Icon Composer 文档 `apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/`。三张图层与 Android 图层同源，都是扁平蒙版：RGB 统一填白，形状全部落在 alpha 上，配色交给 `icon.json` 的 `fill-specializations`。

几何来自 `apps/web/src-tauri/icon-sources/app-icon.svg`，由五个纯路径 primitive 构成：

1. `outline-frame`（描边层）由内部图形直接生成：先把 `wordmark` 与 `at` 的路径并集向外扩 56 px，得到一条 28 px 可见宽度的黑带，再把这条带子重新描摹成一条闭合轮廓随 SVG 提交。它不再描摹贴纸剪影，因此不会继承旧稿的波浪、缺口与厚度漂移；外扩会在两块外扩图形相交处留下尖锐的凹角（`m` 与 `@`、`@` 与 `s` 之间），也会在 `m` 右腿与 `s` 之间留下一处向内咬的浅湾，所以在描摹之前先用 28 px **圆盘**闭运算把凹角和浅湾都倒成圆弧（不用方形结构元：`PIL` 的 `MaxFilter` 是方窗，会把凸弧沿对角线胀出去），描摹时再叠 24 px 倒角与 8 px 弧长平滑，外轮廓的每一段过渡因此都是连续的。`m` 的腿间槽、`i` 点与竖笔之间的缝、`@` 环与内 `a` 之间的空隙仍由外扩的内侧一半填成黑色，可见黑边仍是 28 px。
2. `outline-at`（描边层）是 `@` 自己的同一条 `d` 加 56 px 圆角描边，把 28 px 黑边画在 `@` 形状之外。`@` 因此有独立黑边，与黑框同宽、互不干扰，叠在字面上时边界清晰。
3. `wordmark`（字面层）是 `i`、圆点、平顶 `m` 与 `s`：`i` 与 `m` 由圆角斜切块按旧稿量测比例手绘（字腿 74 px、腿间槽 20 px、`i` 竖笔 77 px、斜切 0.364，`m` 右上肩半径 34 px 以贴合旧稿的圆肩），`s` 从旧金属稿的字面区域平滑描摹，保留上臂、左脊、中腹、下臂与一个 42° 斜向的负空间。
4. `at-keyline`（字面层）复用 `@` 的同一条 `d`，用 9 px 白色圆角描边画出细白衬线，被 `At` 层压住内侧，只露出约 4.5 px。
5. `at`（`@` 层）是红色填充的 `@` 轮廓：外环、内 `a` 碗、斜竖笔，以及一条按椭圆重建的 `a` 负空间。

`@` 的外轮廓、`s` 与黑框都来自描摹：4 倍放大后跑 marching squares，再与蒙版做若干轮拟合，按弧长均匀重采样，最后转成**周期性三次样条**（C2，曲率在节点上连续）。这一点是刻意的：Catmull-Rom 只有 C1，曲率在每个采样点跳变，长圆弧会读成一段段圆度不同的弧、直线段与转折。均匀采样同样关键，控制点疏密不一时一个很小的方向变化就会读成尖角。

`@` 内 `a` 的负空间不描摹：它接近椭圆，先按主轴拟合，再按描摹面积做等面积缩放，最后由四个三次贝塞尔（`0.5523 r` 手柄）画出。内圆弧因此是一条连续曲线，没有栅格描摹留下的平面段和缺口。手绘的 `i` 与 `m` 用连续曲率的圆角：手柄长度取 `0.72 r` 而不是圆弧的 `0.5523 r`，曲率从直线端的 0 平滑升到圆角，直线接圆弧处不再有曲率突变。手绘部分按画布中心对齐：斜切函数把整组字面下移 16.5 px，使外扩后的外轮廓落在 1024 画布正中。笔画的形状全部落在路径数据里、随 SVG 提交；构建期不读取旧位图，也不依赖 Python 或图像库。五个 primitive 只使用 `M`、`C`、`Z` 命令；黑框用 `nonzero` 填充，字面与 `@` 层用 `evenodd`，`@` 的负空间是同一路径上的反向子路径，与外轮廓一起参与描边，所以内孔边缘也是黑的。源文件没有 `<text>`、字体文件、第三方图像，也没有继承旧稿的拉丝、挤出与双重描边。

`app-icon.svg` 渲染回栅格时，每条 primitive 按自己的 `fill` / `stroke` / `fill-rule` 单独出图，再按 `data-layer` 取 alpha 并集；先生成 4096 px，再盒式降采样到 1024，所以描边宽度和曲线在最终尺寸上都是平滑的。

字面层在这之后还有一步修正。`@` 自己的黑边画在**最底层**（描边层），而字面白在它上面，所以凡是字面横跨 `@` 黑边的地方（`m` 右腿压住 `@` 环顶部、`s` 压住 `@` 右下），黑边都会被白盖掉，`@` 看起来直接贴着字面。栅格化因此在字面层上再减去 `@` 外围 6 px 到 20 px 的一条环带，把黑边让回来；内圈 6 px 以内保留，因为 9 px 白衬线只有 4.5 px 露在外面。这条环带一定落在黑框内部（脚本会断言，否则报错退出），所以不会在字面上开出透底的空洞。

图层分组与材质：`@` 单独成组（Liquid Glass 的材质参数是组级属性），开启 `glass`，并配 `specular`、`translucency`、`blur-material` 和 `lighting: individual`，阴影浅色用 `layer-color`、暗色用 `neutral`，让红色 `@` 读起来像玻璃珠（`@` 的独立黑边来自描边层，与这层玻璃互不干扰）。字面与描边所在的 `Mark` 组保持无 `glass`：带 `glass: true` 时系统会在每层边界叠加约 8 px 宽的边缘高光，白色字面上不可见，但会在描边和 `@` 边界上留下偏粉的亮带。`ictool` 导出时忽略该标志，所以分组的实际效果只能在真机或模拟器构建上验证。处理未引入第三方图像。

`icon.json` 保持在 Icon Composer 1.5 能生成的形态：不含顶层 `features` 数组，组上也不含 `refractivity` 对象。这两个键由 Icon Composer 2.0（随 Xcode 27 发布）写入，Xcode 26 的 `actool` 读不了，归档时会先报 `Could not open "AppIcon.icon"`、再抛一个 nil 对象异常并中断，而预览版 iOS 任务所用的 runner 镜像最高只有 Xcode 26.6，留着任一键都会让每次 iOS 预览发布失败。等 runner 镜像带上 Xcode 27 再恢复；`tests/tauri-build-configuration.test.js` 断言这两个键缺席，回退时会在本地检查就先暴露，不必等 CI 跑到 macOS 任务。

| 仓库路径 | 字节数 | SHA-256 |
| ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `apps/web/src-tauri/icon-sources/app-icon.svg` | 50929 | `02443e9840d1b08853505b5666cc115d1cfaf3f6d753751c613d5bdb96c1226f` |
| `apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/icon.json` | 2341 | `fb8725278154307920d0e980b945f0192f1569f3a8360f4f7fd531c9260f3f9e` |
| `apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/Assets/Outline.png` | 8174 | `af3bb8109d7064878302a05345b50045842c22979c9bf267fd709541153cc4aa` |
| `apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/Assets/Wordmark.png` | 12185 | `f4e6b52023433ef141d1d1a45e43fbdc86c612522ee831924663749192059fc8` |
| `apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/Assets/At.png` | 8939 | `1e49386990e4ca42da78baad5c277ec7e11734c2685dbdd48f842f3f24ffb2a3` |

`apps/web/scripts/sync-ios-app-icon.js` 由 `pnpm run icon:app` 调用。它把该目录复制进派生的 `gen/apple/AppIcon.icon`，并给 `gen/apple/imsweb.xcodeproj/project.pbxproj` 补一条顶层文件引用，让 `actool` 把 `.icon` 当作图标栈，而不是资源目录里的普通文件。

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

## 名片反应图形

`apps/web/public/emoji/twemoji/` 包含名片反应列表和选择器使用的 46 张 SVG。来源为
[Twemoji v17.0.3](https://github.com/jdecked/twemoji/tree/v17.0.3/assets/svg)，作者为 Twemoji
贡献者；图形按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权，可在保留署名、
来源与许可说明的条件下公开分发并用于 Web 和移动 App。Twemoji 的代码许可与图形许可不同，
这些图形不属于本仓库的 MIT 授权范围。

SVG 保留上游原始字节，未修改、裁切或重新编码。随包的
[manifest.json](../../apps/web/public/emoji/twemoji/manifest.json) 逐项记录原字符、文件名、字节数和
SHA-256；[NOTICE.txt](../../apps/web/public/emoji/twemoji/NOTICE.txt) 和
[LICENSE-GRAPHICS.txt](../../apps/web/public/emoji/twemoji/LICENSE-GRAPHICS.txt) 提供署名与完整许可。
资产清单的单元测试同时核对反应允许列表、实际文件和校验值，新增反应时必须一并更新。

## 新增资产要求

新增静态资产必须满足：

- 权利人和原始来源可验证；
- 许可证或书面授权允许公开分发及预期使用；
- 修改、裁切或格式转换已记录；
- 文件 SHA-256 与提交内容一致；
- 商标或人物素材不会因代码采用 MIT 而被错误标记为 MIT。

无法满足以上条件的文件不得进入公开仓库或发布产物。
