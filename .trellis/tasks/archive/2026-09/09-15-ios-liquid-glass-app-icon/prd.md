# iOS 液态玻璃 App 图标（Icon Composer）

## Goal

iOS 客户端在 iOS 26 及以上显示 Apple Liquid Glass 应用图标：图标由 Icon Composer
文档驱动，系统据此渲染分层高光与视差，而不是把玻璃效果烘焙进位图。iOS 26 以下与
Android 继续拿到可用的兼容图标，桌面端行为不变。

## Background

### 现有图标管线

`apps/web/src-tauri/icon-sources/app-icon.json` 是唯一图标 manifest，`pnpm run icon:app`
（`tauri icon … && node scripts/canonicalize-icns.js`）由它派生出 `src-tauri/icons/` 下的
PNG、`icon.icns`、`icon.ico`，其中 `default` 指向 `public/brand/imsweb-app-icon.png`。
实测该命令还会写出 `gen/apple/Assets.xcassets/AppIcon.appiconset/` 的 18 张 PNG 与
`gen/android` 的 26 个 mipmap 文件，但不触碰 `project.pbxproj`；同源重复执行产出相同的
`icon.icns`（md5 两次一致）。

iOS 侧由 `tauri ios init` 生成 `src-tauri/gen/apple/`，
`imsweb.xcodeproj/project.pbxproj` 设 `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`，
`Assets.xcassets` 以 `folder.assetcatalog` 类型整体加入 Resources。
`src-tauri/gen/` 被 `apps/web/src-tauri/.gitignore` 忽略，是派生产物；
`docs/development/tauri-mobile.md` 规定 iOS 原生实现放在 `src-tauri/plugins/`，
由插件 `build.rs` 在每次生成时接入，不得写进 `gen/apple`。
`build.rs` 的 `sync_ios_lucide_assets()` 是这类同步的既有先例：构建 iOS target 时把
`plugins/native-glass/ios/Sources/Resources/Lucide.xcassets` 下的 imageset 复制进
`gen/apple/Assets.xcassets/`。

### 本机工具链（已实测）

- Xcode 27.0（build 27A266a）。
- `Icon Composer.app/Contents/Executables/ictool` 的 `--version` 返回
  `{"bundle-version":"129","short-bundle-version":"27.0"}`。它按 `--platform` / `--rendition` /
  尺寸导出 PNG，成功时打印 `{}` 并退出 0。
- `.icon` 是普通目录：`AppIcon.icon/icon.json` 加 `AppIcon.icon/Assets/*.png`，画布 1024 × 1024。
  手写 JSON 加一张 PNG 的 spike 已渲染出 `Default` 与 `TintedDark`，说明创作链路可脚本化，
  不需要 GUI。
- `xcrun actool` 把 `.icon` 当独立输入目录接受时，产出 `IconImageStack`（light / dark / tintable）、
  逐外观 `Icon Image`，并自动生成旧系统兜底 PNG（`AppIcon60x60@2x.png`、
  `AppIcon76x76@2x~ipad.png`）与写有 `CFBundleIconName = AppIcon` 的 partial plist。
- 同一个 `.icon` 放进 `Assets.xcassets/` 内部时，`actool` 报
  "None of the input catalogs contained a matching … icon stack named AppIcon"；
  加 `--target-device iphone --target-device ipad` 时输出目录为空。
  结论：`.icon` 必须作为顶层输入交给 actool。
- 名为 `AppIcon` 的 `appiconset` 与名为 `AppIcon.icon` 的图标栈同时作为输入时，`actool`
  不报错，`Assets.car` 仍产出 `IconImageStack`。

### 现有美术资源的实测特征

`src-tauri/icon-sources/android-foreground.png`（1024 × 1024，RGBA）。下列测量针对**扁平化前**的金属版本；该文件与 `android-monochrome.png` 其后已被就地覆盖为扁平版，需要重新推导时先用 `git show <提交>:<路径>` 取回。

- alpha > 0 的像素 210,896，完全不透明 152,004，半透明 58,892。
- 可见范围 x 171–851、y 258–763，中心 (511, 510.5)。
- 完全不透明区按饱和度分：偏红（`@`）32,243 px，中性偏暗（描边，亮度 < 96）72,529 px，
  中性偏亮（银色字面）47,232 px。
- 低 alpha 像素中亮度 ≥ 176 的占多数（alpha 1–63 区间 8,580 / 14,613），说明软边不只是投影，
  还混着字面的浅色抗锯齿，直接按色相分层会在轮廓外留下浅色光晕。
- 原图在黑色描边外侧还有一圈浅色双重描边（实测约 7 px 宽，亮度 162–204），
  它在扁平化后只会读成白边，需要从轮廓里整圈切除。

`android-monochrome.png` 的 alpha 通道与 foreground 完全一致；`android-background.png`
是满幅不透明的平色层。

### 约束

- `docs/governance/assets.md` 要求新增静态资产登记权利人、来源、修改记录、字节数与 SHA-256。
- `tests/tauri-build-configuration.test.js` 逐字断言 `icon:app` 脚本字符串、
  `app-icon.json` 的完整对象，以及三张 Android 图层为 1024 × 1024 RGBA。
- `docs/development/tauri-mobile.md` 的图标与命令章节需要跟随更新。
- `src-tauri/gen/` 不入版本库，`.icon` 工程原文件必须放在受控目录。

## Requirements

- R1 iOS 图标由 Icon Composer 文档驱动，`.icon` 工程原文件保存在
  `apps/web/src-tauri/` 下的受控目录中，不写入 `gen/`。
- R2 `.icon` 图层使用扁平素材，不烘焙系统会自行渲染的投影、高光与折射，
  字面内部不保留金属渐变与拉丝纹理，黑色描边外侧的浅色双重描边也一并切除；
  几何来自全新受控 SVG：`i` 与平顶 `m` 由圆角斜切块构造（圆角用连续曲率的手柄，直线接圆弧处无曲率突变），`@` 与 `s` 从旧稿区域
  描摹一次后作为路径数据提交（构建期不读位图；轮廓用周期性三次样条输出，曲率在节点上连续）；`@` 内 `a` 的负空间不描摹，按椭圆重建为一条连续内圆弧；黑框由内部图形直接外扩：
  先取 `wordmark` 与 `@` 的并集外扩 56 px，再用 28 px 圆盘闭运算把外扩相交处的尖凹角和 `m` 右腿与 `s` 之间的浅湾倒圆，
  最后把这条黑带重新描摹成一条闭合轮廓（另叠 24 px 倒角与 8 px 弧长平滑），每条边外侧恰好 28 px，不再描摹贴纸剪影；
  `@` 另有自己的 56 px 圆角描边黑边，而且栅格化时会把 `@` 外围 6～20 px 的环带从字面层里减掉，
  让这条黑边在字面压过来时仍然可见（内圈 6 px 保留，白衬线只有 4.5 px 露在外面）；SVG 不含 `<text>`、字体引用或栅格图像；字面与描边所在的
  分组不使用 `glass` 材质，因为系统会在图层边界叠加约 8 px 的边缘高光，在红 `@`
  上会读成偏粉的亮边；外观配色由 `icon.json` 的 fill 与 specializations 表达；
  `@` 单独成组并开启 `glass`，让红色符号带玻璃质感。
- R3 生成管线可复现：相同源文件重复执行产出相同结果，且不依赖手工 GUI 操作。
- R4 iOS 26 以下获得可安装的兜底图标，不允许出现空白或缺失图标。
- R5 Android 继续使用 adaptive icon 三图层方案；背景、前景与单色三层都换成与 iOS 同源、同算法的扁平版本，
  亮色底板统一为 `#e0e1e3`，字面金属光泽与纵向背景渐变不再保留；旧版 launcher 位图
  （`ic_launcher.png`、`ic_launcher_round.png`）同样拿到这版设计，兼容性不退化。
- R6 桌面端（`icon.icns` / `icon.ico` / `icons/` 下的 PNG）与应用图标使用同一版扁平设计：
  共享的栅格源 `public/brand/imsweb-app-icon.png` 改为由 `app-icon.svg` 渲染，
  `icon:app` 据此重建桌面图标；不再出现“客户端新、桌面旧”的双风格。
- R7 派生的 `gen/apple` 工程被删除后重新生成时，液态玻璃图标自动恢复，无需手工补步骤。
- R8 资产治理记录与受影响测试、文档同步更新。
- R9 三张图层与 Android 两层共用一个受版本控制的 SVG 几何源
  （`apps/web/src-tauri/icon-sources/app-icon.svg`），改控制点即可重生成全部图层，
  无需回到栅格源图。
- R10 桌面与 Android 旧版 launcher 的位图源（`public/brand/imsweb-app-icon.png`、
  `android-background.png`）也是派生资产，由同一个栅格化脚本产出，不依赖人工编辑位图。

## Key Decisions

- D1 美术方向保留 `im@s` 的上下阶梯识别。`i` 与平顶 `m` 按旧稿量测比例手绘
  （字腿 74 px、腿间槽 20 px、`i` 竖笔 77 px、斜切 0.364、`m` 右上肩 34 px）；
  `@` 与 `s` 从旧稿做区域提取后平滑描摹，笔画的形状随路径数据提交，构建期不读位图；
  黑框改为按构造生成：先把 `wordmark` 与 `@` 的并集外扩 56 px，再用 28 px 圆盘闭运算把外扩相交处的尖凹角倒圆，
  然后把这条带子描摹成一条闭合轮廓（叠 24 px 倒角与 8 px 弧长平滑），得到光滑连续的等宽黑带，不再描摹贴纸剪影（旧稿的非均匀底板、
  波浪边和缺口随之消失）。`@` 另有自己的 56 px 圆角描边，因此有与黑框同宽的独立黑边；这条黑边会被上层的字面白盖住，
  所以栅格化时把 `@` 外围 6～20 px 的环带从字面层减掉，让黑边重新露出来。
  `@` 内 `a` 的负空间不描摹而在主轴方向上拟合成椭圆（面积对齐描摹值），因此内圆弧是连续的；
  `@` 的白衬线仍从同一条路径派生。SVG 不携带字体轮廓或第三方图像，
  避免公开分发时引入字体授权问题。
- D2 图层素材作为派生资产提交进版本库，与既有 Android 三图层的处理方式一致；
  不引入 Python 或图像库作为构建期依赖。几何真相源是受控的 `app-icon.svg`，
  任务内脚本只提供 `--write` 栅格化入口；旧位图 `--from-art` 描摹入口已禁用，
  防止把阈值噪声重新写回 SVG。
- D3 Xcode 接线由一个 Node 同步脚本在 `icon:app` 里完成，而不是放进 `build.rs`。
  `icon:app` 位于 `beforeBuildCommand`，在 xcodebuild 读取工程之前执行。
- D4 保留 `tauri icon` 生成的 `AppIcon.appiconset`。实测它与 `.icon` 共存不报错，
  兜底来源因此有明确的文件依据，改动面更小。
- D5 Android 前景层与单色层用同一套扁平算法重新生成，而不是保留金属版本。
  一图两份风格会让两个客户端长期不一致；且启动器实际显示的尺寸下，
  被切掉的浅色环只有约 1 px，视觉差异在发丝级。前景层涂色直接取 `icon.json`
  的三色默认值，与 iOS 一致；背景层同样改为 iOS 亮色外观的纯平色 `#e0e1e3`，
  原来的纵向银色渐变不再保留。
- D6 桌面与应用图标共用一版设计：把 `public/brand/imsweb-app-icon.png` 从“人工生成的金属稿”
  改为由 `app-icon.svg` 渲染出来的扁平派生资产，`android-background.png` 同样由脚本产出。
  两个文件仍留在原路径，所以 `app-icon.json`、它的清单断言与受影响工作区列表都不用改；
  代价是旧金属稿只存在于版本库历史里（转出方式见 `assets.md`）。

## Acceptance Criteria

- [x] `src-tauri/` 下存在受版本控制的 `.icon` 工程（`icon.json` + 分层素材），
      且 `ictool` 能对 `Default`、`Dark`、`TintedLight`、`TintedDark`、`ClearLight`、
      `ClearDark` 六个 rendition 全部渲染成功。
- [x] iOS 构建后 `gen/apple` 的 `Assets.car` 含 `IconImageStack` rendition，
      且外观覆盖 light / dark / tintable。
- [x] 构建产物内含 iOS 26 以下的兜底图标 PNG，并且 Info.plist 声明图标名为
      `AppIcon`。实际键路径是 `CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName`，
      不是 Info.plist 根层的 `CFBundleIconName`。
- [ ] 模拟器（iOS 26）确认默认、深色、着色三种外观下图标正常，
      且 40 pt 小尺寸下轮廓可辨。浅色外观已在 iOS 26 模拟器主屏目视确认；
      深色与着色变体的正确性由 `Assets.car` 的 rendition 与 `ictool` 渲染佐证，
      但首页图标风格是独立于系统明暗的用户设置，`simctl` 无法切换，仍需人工确认一次。
- [x] 红 `@` 与黑框的边缘圆润平滑：SVG 只含三次贝塞尔，红线与黑色底线
      共用同一条中心线，黑框恒定 18 px，无 1 px 缺口；SVG 不含字体或栅格图像。
- [x] 三张 iOS 图层与两张 Android 图层由受控 `app-icon.svg` 派生，
      派生脚本重跑后五张 PNG 的 SHA-256 与提交值逐一相同。
- [x] 删除 `gen/apple` 后执行一次 `tauri ios init` 加 `app ios` 构建，
      图标即为液态玻璃版本，无手工步骤。
- [x] `pnpm run icon:app` 连续执行两次，`src-tauri/icons/` 与 `gen/apple/AppIcon.icon`
      无二进制差异，`project.pbxproj` 不出现重复引用。
- [x] `pnpm run test` 通过，包含更新后的 `tests/tauri-build-configuration.test.js`。
- [x] Android 构建产物仍带 adaptive icon 三图层，且背景、前景与单色层都是同一版扁平设计：
      `gen/android` 的 mipmap 顶层颜色只剩 `icon.json` 的三个纯平值，金属渐变消失，
      背景层为纯平 `#e0e1e3`；旧版 `ic_launcher*.png` 同样显示这版设计。
- [x] 桌面图标（`src-tauri/icons/` 的 PNG、`icon.icns`、`icon.ico`）由 `icon:app`
      从同一版扁平源图重建，与应用图标不再分叉。
- [x] `docs/governance/assets.md` 登记新资产的字节数与 SHA-256，
      `docs/development/tauri-mobile.md` 描述新管线与命令。

## Out of Scope

- macOS 桌面端图标改用 Icon Composer 分层文档。桌面继续走现有 `icon.icns` 派生，
  只是源图换成与应用同源的扁平版。
- Android 液态玻璃或等效分层图标。Android 保持 adaptive icon。
- App Store 素材、营销截图、网站图标的替换。
- `AppIcon.icon` 之外的备用图标（alternate app icons）。
- 重新设计品牌标识本身。
