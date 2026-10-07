# 技术设计：iOS 液态玻璃 App 图标

## 1. 边界与产出物

三层结构，改动的只有第一和第二层：

| 层 | 位置 | 状态 |
| --- | --- | --- |
| 受控源 | `apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/` | 新增 |
| 受控源 | `apps/web/src-tauri/icon-sources/app-icon.svg` | 新增，几何真相源 |
| 受控源 | `apps/web/src-tauri/icon-sources/android-foreground.png`、`android-monochrome.png`、`android-background.png` | 就地重写为扁平版 |
| 受控源 | `apps/web/public/brand/imsweb-app-icon.png` | 就地改为由 SVG 渲染的派生资产 |
| 生成管线 | `apps/web/scripts/sync-ios-app-icon.js`，由 `icon:app` 串接 | 新增 |
| 派生产物 | `src-tauri/icons/` 的桌面图标、`gen/apple/AppIcon.icon`、`project.pbxproj` 的引用、`Assets.car`、兜底 PNG、`gen/android` 的 mipmap | 重建 |

不动：`app-icon.json`（只引用文件名，素材内容变了但 manifest 不变）、
`build.rs` 的 Lucide 同步。桌面产物会被重建，因为它的源图就是上面那张共享栅格图。

## 2. `.icon` 文档结构

`AppIcon.icon/icon.json` 加 `AppIcon.icon/Assets/` 下三张 1024 × 1024 RGBA 图层：

| 图层 | 素材 | 作用 |
| --- | --- | --- |
| Outline | `Outline.png` | 白字 56 px 描边与 `@` 56 px 描边的 alpha 并集 |
| Wordmark | `Wordmark.png` | 字面的平色填充区 |
| At | `At.png` | 红色 `@` 的平色填充区 |

素材保持扁平：不烘焙投影、斜面高光与折射，颜色全部由 `fill` 与
`fill-specializations` 表达。Wordmark 与 Outline 所在的 Mark 组不带 `glass`，
避免系统在黑框边界叠加偏粉亮边；`@` 独立成组并开启 `glass`、specular、translucency
与 refractivity，让红色符号单独获得玻璃质感。`ictool` 导出会忽略 `glass`，
这个差别只能在真机或模拟器构建上验证（见 `research/toolchain-findings.md` 第 13 节）。背景由顶层 `fill-specializations` 提供，
light 用 `extended-srgb:0.87843,0.88235,0.89020,1`（即现有 `bg_color` `#e0e1e3`），
dark 用 `extended-srgb:0.10980,0.10980,0.11765,1`。

### 图层顺序（实测与公开文档相反）

Icon Composer 2.0 的公开说明称「数组首项是最底层」，本机 `ictool`
（`short-bundle-version 27.0` / `bundle-version 129`）实测相反。用同一组素材做对照：

| 数组顺序 | `Default` 渲染结果 |
| --- | --- |
| `[Outline, Wordmark, At]` | 只有深色轮廓，上层被遮挡 |
| `[At, Wordmark, Outline]` | 完整字标：轮廓在下，字面与 `@` 在上 |

因此写进 `icon.json` 的顺序是 `[At, Wordmark, Outline]`：**首项在最上层**。
这条结论只对当前工具链成立，升级 Xcode 后需要重新用上表复核。

## 3. 几何真相源：`app-icon.svg`

iOS 三张图层与 Android 前景层、单色层都由受控的
`apps/web/src-tauri/icon-sources/app-icon.svg` 派生，它放在 `app-icon.json` 旁边，
是图标的几何真相源。SVG 里只有五个纯路径 primitive，每条用 `data-layer`
声明自己进哪张图层：

| id | 几何 | 生成图层 |
| --- | --- | --- |
| `outline-frame` | 由 `wordmark` + `at` 外扩 56 px 得到黑带后描摹回的一条闭合轮廓（外侧 28 px，凹角已倒圆） | Outline |
| `outline-at` | `@` 填充路径 + 56 px 黑色圆角描边 | Outline |
| `wordmark` | `i`、圆点、平顶 `m`、描摹 `s` 的填充路径 | Wordmark |
| `at-keyline` | `@` 填充路径 + 9 px 白色圆角描边 | Wordmark |
| `at` | `@` 填充路径（外轮廓 + 按椭圆重建的 `a` 负空间） | At |

`viewBox` 固定为 `0 0 1024 1024`。所有曲线只使用 `M`、`C`、`Z` 命令；
源文件不含 `<text>`、字体引用、栅格图像或滤镜。这样既没有字体分发授权问题，
也不会把拉丝、挤出、阈值毛刺带进新稿。黑框不再描摹贴纸剪影（见 3.1 第 4 条）。

### 3.1 几何构造

比例参照旧金属稿逐项量测：字腿 74 px、腿间槽 20 px、`i` 竖笔 77 px、斜切 0.364。

1. **`i` 与 `m`**：由圆角平行四边块构造，统一使用 0.364 的右倾斜切比例。
   `m` 顶边是一条连续水平线；三根字腿之间的两条黑槽来自块间负空间。
   `m` 右上肩半径 34 px（旧稿量测约 30 px），左上角只留 10 px：肩部半径偏小时，
   28 px 外扩后会把圆肩读成折角。圆角手柄取 `0.72 r` 而不是圆弧的 `0.5523 r`
   （`CORNER_HANDLE`）：曲率从直线端的 0 平滑升到圆角，直线与圆弧不再是曲率突变。
2. **`s`**：从旧金属稿的字面区域描摹，保留上臂、左脊、中腹、下臂与一个 42°
   斜向的负空间（同一轮廓上的反向子路径）。
3. **`@`**：从旧金属稿的红色区域描摹，得到外环、内 `a` 碗、斜竖笔与一段连接两者的通道。
   `a` 的负空间不描摹：它接近椭圆，先按主轴拟合，再按描摹面积等面积缩放，
   最后用四个三次贝塞尔画出，因此内圆弧是一条连续曲线。
   负空间是同一路径上的反向子路径，`evenodd` 下镂空，`at-keyline` 的同一条路径也一样。
4. **黑框**：由内部图形直接生成，不再描摹贴纸剪影。先把 `wordmark` 与 `at` 的并集
   外扩 56 px 得到黑带，再用 28 px **圆盘**闭运算（`FRAME_CLOSE`）把凹角倒圆：
   外扩会在两块外扩图形相交处留下尖锐的凹角（`m` 与 `@`、`@` 与 `s` 之间），也会在
   `m` 右腿与 `s` 之间留下一处向内咬的浅湾。圆盘必须是真的欧氏圆盘：`PIL` 的
   `MaxFilter` 是方窗，会把凸弧沿对角线胀出去。带子再描摹回一条闭合轮廓
   （`outline-frame`，叠 24 px 倒角与 8 px 弧长平滑），每条边外侧恰好 28 px。
   等宽外扩也不会继承旧稿的波浪、缺口与厚度漂移；
   `m` 腿间槽、`i` 点与竖笔间的缝、`@` 环与内 `a` 之间的空隙都由外扩的内侧一半填黑
   （先把黑带铺满，再由上层的字面与 `@` 压住内侧，可见黑边仍是 28 px）。
   `outline-at` 仍是 `@` 自己的同一条 `d` 加同一支 56 px 描边，让 `@` 有与黑框同宽的
   独立黑边；因为描边层在最底下，字面白会盖掉这条黑边，所以栅格化时再把 `@` 外围
   6～20 px 的环带从字面层减掉（内圈 6 px 保留，9 px 白衬线只有 4.5 px 露在外面），
   黑边就能重新显出来。
5. **白衬线**：`at-keyline` 复用 `@` 的同一条 `d`，用 9 px 白色描边，露出约 4.5 px。
6. **居中**：斜切函数把整组字面下移 16.5 px（`SHIFT_Y`），使描边后的外轮廓落在
   1024 画布正中；旧稿 `64 px` 底板只存在于描摹版，等宽黑框下需要重新对中。

`@` 的外轮廓、`s` 与黑框的描摹管线分四步：4 倍双三次放大加高斯模糊后在 0.5 等值线上跑
marching squares；Catmull-Rom 在尖角处会外溢，所以每条轮廓再与蒙版做若干轮拟合，
多出的像素把最近的采样点沿法线拉回、缺少的像素推出去，直到误差收敛；然后按弧长
均匀重采样（`GLYPH_STEP = 8 px`）；最后转成**周期性三次样条**，而不是 Catmull-Rom。

样条阶数是这一版的关键：Catmull-Rom 只有 C1，曲率在每一个采样点上跳变，长圆弧会
读成一段段圆度不同的弧；周期性三次样条解出使曲率连续的二阶导，只要节点均匀，
弧也就是真正的连续弧。均匀采样同样重要：拟合按像素逐个推拉，控制点会疏密不均，
而控制点一密，很小的方向变化就会读成尖角。黑框另吃两道平滑：28 px 圆盘闭运算
（倒凹角与浅湾）与 24 px 倒角（`FRAME_FILLET`），前者用自写的欧氏距离变换实现。

实测 IoU：`s` 0.980、`@` 0.943（`a` 负空间换成拟合椭圆后只降 0.004，但内圆弧从描摹多边形
变成了真正的弧），黑框描摹回自身黑带的 IoU 0.996。脚本另打印黑框与旧稿贴纸剪影的 IoU 作对照，
两者形状本就不同（等宽黑框没有旧稿 `@` 下方约 48 px 的厚底板），不代表差异。

描摹只做一次，结果作为路径数据随 SVG 提交。等价的入口是研究脚本的
`--trace <扁平化前的原图>`；它重跑后与受控 SVG 的五条路径逐字符相同。
旧稿的 `--from-art` 阈值入口仍然禁用，防止把阈值噪声写回 SVG。

### 3.2 从 SVG 出图（`--write` 与 `--full-icon`）

每条 primitive 按自己的 `fill` / `stroke` 单独栅格化到 4096 px，再按 `data-layer`
取 alpha 并集、盒式降采样到 1024，得到三张 iOS 图层：

| 图层 | 来源 |
| --- | --- |
| `Outline.png` | `outline-frame` 与 `outline-at` 的 alpha 并集 |
| `Wordmark.png` | `wordmark` 与 `at-keyline` 的 alpha 并集 |
| `At.png` | `at` 路径的 alpha |

先用 4096 再降采样是必要的：56 px 与 9 px 描边在 1024 直出时会出现锯齿，
在最终尺寸下则保持平滑。

Android 复用同三块区域：前景层取剪影 alpha，按 `outline` / `wordmark` / `at`
涂 `icon.json` 的三色默认值；单色层取同一份剪影 alpha、RGB 全白，
因此与 `Outline.png` 逐字节相同。字面层的那道减环带对两个平台一致，
所以 Android 前景层里 `@` 的黑边同样保留。两者都是 1024 × 1024 RGBA，
`app-icon.json` 不需要改动。

桌面与旧系统位图走 `--full-icon`：把三层的 RGB 值叠到亮色底板
`#e0e1e3`（与 `icon.json` 的 light fill 同值）上，输出一张 1024 × 1024 不透明 PNG，
写到 `public/brand/imsweb-app-icon.png`。它同时是 `app-icon.json` 的 `default`，
所以桌面 `icons/`、iOS 旧系统 `AppIcon.appiconset` 与 Android 旧版 launcher
位图都拿到同一版设计。`--android-background` 写同一块纯平色底板，
替掉原来带纵向渐变的前景底层。

## 4. Xcode 接线

### 约束

`xcrun actool` 只把**顶层输入**的 `.icon` 当图标栈。把同一个 `.icon` 放进
`Assets.xcassets/` 内部时 `actool` 报
`None of the input catalogs contained a matching … icon stack named AppIcon`；
加 `--target-device iphone --target-device ipad` 时输出目录为空。
所以必须给工程加一个指向 `AppIcon.icon` 的独立文件引用。

`Assets.xcassets` 在 `project.pbxproj` 里是 `lastKnownFileType = folder.assetcatalog`
的文件夹引用，因此往目录里塞文件不需要改工程文件；
但 `.icon` 走的是另一条路，需要新增 `PBXFileReference` 与 Resources 阶段的 `PBXBuildFile`。

### 方案

新增 `apps/web/scripts/sync-ios-app-icon.js`（Node，无新依赖），在
`gen/apple` 存在时执行三步：

1. 把受控目录下的 `AppIcon.icon` 整目录复制到 `gen/apple/AppIcon.icon`。
2. 幂等修补 `gen/apple/imsweb.xcodeproj/project.pbxproj`：
   在 `PBXFileReference` 段加一条 `lastKnownFileType = folder.icon` 的引用，
   在 `PBXBuildFile` 段加对应的 Resources 条目，并把引用加进根 `PBXGroup`
   的 children 与 `PBXResourcesBuildPhase` 的 files。
   已经存在同路径引用时原样跳过，重复执行不产生第二份引用。
3. 校验 `ASSETCATALOG_COMPILER_APPICON_NAME` 仍为 `AppIcon`，不为 `AppIcon` 时报错退出。

`icon:app` 变为：

```sh
tauri icon src-tauri/icon-sources/app-icon.json
  && node scripts/canonicalize-icns.js src-tauri/icons/icon.icns
  && node scripts/sync-ios-app-icon.js
```

`gen/apple` 不存在时脚本静默跳过，桌面与 Android 构建不受影响。

### 为什么放在 `icon:app` 而不是 `build.rs`

`icon:app` 挂在 `tauri.conf.json` 的 `beforeBuildCommand` 与 `beforeDevCommand`，
在 `tauri ios build` 启动 xcodebuild 之前跑完，工程文件在 Xcode 读取前已经改好。
`build.rs` 在 xcodebuild 的 cargo 阶段才执行，晚于 Xcode 读取工程，
当次构建拿不到新引用，需要多构建一次才生效。

实测 `tauri icon` 每次都会重写 `gen/apple/Assets.xcassets/AppIcon.appiconset/` 的
18 张 PNG，但不触碰 `project.pbxproj`，所以把同步脚本接在它后面即可稳定收敛。

### 保留 appiconset

实测名为 `AppIcon` 的 `appiconset` 与 `AppIcon.icon` 同时作为 `actool` 输入不报错，
`Assets.car` 仍产出 `IconImageStack`（light / dark / tintable 各一份）。
保留它，改动面最小，兜底来源也有明确文件依据。

## 5. 兼容性

| 目标 | 图标来源 |
| --- | --- |
| iOS 26+ | `AppIcon.icon` 生成的 `IconImageStack` |
| iOS 15–25 | `actool` 从 `.icon` 自动生成的 `AppIcon60x60@2x.png` 等兜底 PNG |
| Android | adaptive icon 三图层（背景为纯平 `#e0e1e3`）+ 旧版 `ic_launcher*.png`，全部来自同一版扁平几何 |
| 桌面 | `icon.icns` / `icon.ico`，源图换成与应用同源的扁平版 |

`tauri.ios.conf.json` 的 `minimumSystemVersion: "15.0"` 不需要改动。
`actool` 生成的 partial plist 会写 `CFBundleIconName = AppIcon`，
由 Xcode 合并进最终 `Info.plist`。

## 6. 取舍

**提交派生图层，栅格化脚本不进入构建链。** 与 `assets.md` 里 Android 三图层的
既有约定一致：受控 SVG 和派生 PNG 都入版本库，并登记字节数与 SHA-256。
`research/build-icon-layers.py` 只用于从 SVG 重建五张 PNG，应用构建不依赖 Python、
PIL、numpy 或 `rsvg-convert`。

**放弃位图描摹，直接构造几何。** 前几版围绕阈值、孔洞填充、轮廓平滑和 IoU
反复调参，仍会把原图的拉丝噪声、封闭黑区和不规则外框带进结果。全新稿只保留
`im@s` 的阶梯布局与红白黑配色，字形和黑框都由贝塞尔与恒宽描边生成。
代价是字形不再逐像素贴合旧图；收益是控制点少、边缘连续、负空间稳定，
也不会因一次形态学操作把 `s` 或 `@` 的结构填掉。

**不固化专有字体轮廓。** 曾用系统 Arial Black 做过构图探针，但其字形轮廓不进入
公开仓库。`s` 与 `@` 最终都是手绘几何，SVG 无 `<text>` 和字体引用。

**Android 与桌面就地重写源图。** 扁平化后的图层覆盖同名文件，`app-icon.json` 不需要改；
`public/brand/imsweb-app-icon.png` 与 `android-background.png` 同样保留原路径，只把内容换成脚本输出。
代价是旧金属稿只留在版本库历史里，收益是清单、清单断言与受影响工作区列表都不动。

**改 `icon:app` 脚本字符串。** `tests/tauri-build-configuration.test.js`
逐字断言该字符串，需要同步更新；这也是让新管线进入既有回归覆盖的最低成本方式。

**不替换 `tauri icon`。** 它同时服务 Android 与桌面，`app-icon.json` 是共享 manifest。
iOS 的液态玻璃单独走一条支线，共享 manifest 与两个平台的产物都不动。

## 7. 风险与回滚

| 风险 | 处理 |
| --- | --- |
| ~~`tauri ios build` 重写 `project.pbxproj`~~ | 已排除。实测一次完整的 `tauri ios build --target aarch64-sim --debug`（xcodebuild 报 `BUILD SUCCEEDED`）前后，`project.pbxproj` 的 md5 均为 `9e8c88a5fdc01f6f40b58ee6afbc5185`。接线放在 `icon:app` 即可 |
| `ictool` 升级后图层顺序语义变化 | 用第 2 节的对照表复核一次 |
| tinted 与 clear 外观的表现与预期不符 | 已在规划阶段渲染确认六种外观；实现阶段再看真机观感 |
| 小尺寸下 `m` 槽、`@` 内孔或 `s` 中段闭合 | 用 40 pt / 60 pt / 80 pt 尺寸梯复核，直接调整 SVG 控制点或描边宽度 |
| 扁平化后的 Android 前景层在启动器上显得比原来单薄 | 真实尺寸下切掉的浅色环只有约 1 px；已用 xxxhdpi 合成图对照确认黑边仍清晰可辨 |
| 旧位图描摹覆盖全新 SVG | `--from-art` 入口明确报错；脚本只允许从受控 SVG 写 PNG |
| 修补 `project.pbxproj` 出错导致工程打不开 | 脚本只做插入与存在性检查，出错即非零退出；`gen/` 是派生产物，删除后重新 `tauri ios init` 即可回滚 |

回滚路径：从 `icon:app` 移除同步脚本调用，删除 `src-tauri/icon-sources/ios-liquid-glass/`，
删除 `gen/apple` 后重新 `tauri ios init`。Android 两层源图从版本库历史取回覆盖即可，
`icon:app` 重新生成派生图标。
