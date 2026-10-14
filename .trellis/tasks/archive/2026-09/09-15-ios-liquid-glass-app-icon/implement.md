# 执行计划：iOS 液态玻璃 App 图标

## 前置检查

- 探针已确认：`tauri ios build --target aarch64-sim --debug` 跑完 xcodebuild
  （`BUILD SUCCEEDED`）后，`gen/apple/imsweb.xcodeproj/project.pbxproj` 的 md5 前后一致，
  仍为 `9e8c88a5fdc01f6f40b58ee6afbc5185`。接线放在 `icon:app` 即可，执行 1.3A。
- 已知本地状态问题：`pnpm run app ios --release` 目前会在归档阶段失败，
  `failed to rename app …/imsweb_iOS.xcarchive/Products/Applications/IMSWeb.app:
  Directory not empty (os error 66)`。这是残留的 xcarchive 目录，与本任务无关；
  首次 iOS 验证前先删除 `apps/web/src-tauri/gen/apple/build/imsweb_iOS.xcarchive`。
- 确认 Xcode 与 `ictool` 版本仍是 27.0 / 129。版本变化时先重跑设计文档第 2 节的
  图层顺序对照表。

## 1. 固化工具链行为

### 1.1 复核图层顺序

用同一组素材构造 `[Outline, Wordmark, At]` 与 `[At, Wordmark, Outline]` 两份
`icon.json`，各渲染一次 `Default`。首项在最上层时第二份才会出完整字标。

验证：两份 `Default` 渲染结果不同，且第二份含黑色轮廓、白色字面与红色 `@`。

### 1.2 复核 `actool` 的输入要求

对已接线的产物跑一次 `actool`，确认 `Assets.car` 含 `IconImageStack`：

```sh
xcrun assetutil --info <path>/Assets.car | grep -c IconImageStack
```

### 1.3 接线时机（已定）

探针显示 pbxproj 不被重写，同步脚本放在 `icon:app` 即可，`build.rs` 与
`app-device.js` 都不需要改。若将来 Tauri 改变这一行为，再考虑拆成独立步骤；
判据是「删除 `gen/apple` 后单次构建即得到液态玻璃图标」是否仍然成立。

## 2. 生成分层素材

### 2.1 构造受控 SVG

在 `apps/web/src-tauri/icon-sources/app-icon.svg` 中维护几何，构建期不读位图。
比例按旧稿量测：字腿 74 px、腿间槽 20 px、`i` 竖笔 77 px、全局斜切 0.364。

- `i` 与平顶 `m` 由统一 0.364 斜切比例的圆角块组成；`m` 右上肩半径 34 px，
  左上角 10 px，避免外扩后圆肩变成折角。圆角手柄取 `0.72 r`（`CORNER_HANDLE`）
  而不是圆弧的 `0.5523 r`，让曲率从直线端平滑升起。
- `s` 与 `@` 外轮廓从扁平化前的原图描摹一次，结果作为路径数据提交；
  重导出入口是 `research/build-icon-layers.py --trace <原图> --out-svg <路径>`。
  描摹保留 `s` 的 42° 负空间与 `@` 的环/碗/斜竖笔。
- `@` 内 `a` 的负空间不描摹：接近椭圆，按主轴拟合 + 等面积缩放后用四个三次贝塞尔画出，
  内圆弧因此是连续曲线。
- 黑框由内部图形外扩得到后描摹回一条闭合轮廓：先取 `wordmark` 与 `at` 的并集外扩
  56 px，再用 28 px 圆盘闭运算（`FRAME_CLOSE`，欧氏距离变换实现，不用方窗
  `MaxFilter`）把两块图形相交处的尖锐凹角和 `m` 右腿与 `s` 之间的浅湾倒圆，
  最后描摹并叠 24 px 倒角（`FRAME_FILLET`）。等宽外扩不会继承旧稿贴纸剪影的波浪、
  缺口与厚度漂移。
- `@` 的黑边会被上层的字面白盖掉，所以 `write_layers` 把 `@` 外围 6～20 px
  （`AT_EDGE_INNER` / `AT_EDGE_OUTER`）的环带从字面层减掉；内圈 6 px 保留给
  9 px 白衬线（露出 4.5 px）。这条环带必须落在黑框内，否则脚本直接报错退出。
- 描摹结果先与蒙版拟合，再按弧长均匀重采样（`GLYPH_STEP = 8 px`），
  最后用周期性三次样条（C2）输出，不用只有 C1 的 Catmull-Rom：
  均匀采样与曲率连续两者缺一，弧就会读成尖角与一段段圆度不同的弧。
- 斜切函数把整组字面下移 16.5 px（`SHIFT_Y`），使描边后的外轮廓落在画布正中。
- `outline-at` 是 `@` 的同一条 `d` 加 56 px 圆角描边，让 `@` 有与黑框同宽的独立黑边；
  `at-keyline` 是同一条 `d` 加 9 px 白色圆角描边。
- 每条 primitive 用 `data-layer` 声明目标图层；描边层用 `nonzero`，其余用 `evenodd`。
- 源文件不允许 `<text>`、字体引用、`<image>`、滤镜或阈值化描摹。

`Outline.png` 取两个 outline primitive 的 alpha 并集，`Wordmark.png` 取
`wordmark` 与 `at-keyline` 的并集，`At.png` 取 `at` 的 alpha，
输出到 Icon Composer 文档的 `Assets/`。

### 2.2 目视清理

把三张图层与背景合成一张 1024 × 1024 预览，再缩到 40 pt、60 pt、80 pt 各看一遍。
40 pt 下 `im@s` 必须可辨，`m` 两条腿间槽、`@` 内孔和 `s` 中段负空间不能闭合。
不达标时直接调整 SVG 控制点或描边宽度，不回到位图处理。

### 2.3 派生 Android 图层与桌面源图

用同一套 SVG 几何覆盖 `android-foreground.png`、`android-monochrome.png` 与
`android-background.png`。前景层取 Outline 做 alpha，按 outline / wordmark / at
涂 `icon.json` 的三色默认值；单色层取同一份 Outline alpha，RGB 全白；
背景层写 iOS 亮色外观的纯平色 `#e0e1e3`（原图的纵向银色渐变不再保留）。
三者都保持 1024 × 1024 RGBA。`app-icon.json` 引用的是文件名，不需要改。

`--full-icon` 另外把三层叠到同一块底板上，输出 1024 × 1024 不透明 PNG 作为
`public/brand/imsweb-app-icon.png`。这个文件同时是 `app-icon.json` 的 `default`，
所以桌面 `icons/`、iOS 旧系统 `appiconset` 与 Android 旧版 launcher 位图都会拿到这版设计：

```sh
python3 .trellis/tasks/09-15-ios-liquid-glass-app-icon/research/build-icon-layers.py \
    --full-icon apps/web/public/brand/imsweb-app-icon.png \
    --android-background apps/web/src-tauri/icon-sources/android-background.png
```

覆盖后重跑 `icon:app`，确认 `gen/android` 的 mipmap 里前景层的顶层颜色只剩
246/17/201 三个纯平值，背景层为单色，旧版 `ic_launcher*.png` 显示这版设计；
桌面 `icons/` 的 `icon.icns` / `icon.ico` 也应随之改变。

### 2.4 保存栅格化脚本

把等价脚本作为任务记录放到 `research/build-icon-layers.py`，不接入任何构建命令。
脚本只保留 `--write` 入口，按 `data-layer` 把受控 SVG 栅格化成五张 PNG；
`--from-art` 明确报错，防止旧位图的阈值噪声重新覆盖全新几何。

脚本必须自包含（不 import 仓库外或 `/tmp` 下的模块），且只能使用
`tests/tauri-build-configuration.test.js` 已依赖的 `PIL` 与 `numpy`，
外加命令行工具 `rsvg-convert`。

验证：脚本跑一次 `--write` 后，五张受控 PNG（三张 iOS 图层 +
两张 Android 图层）的 sha256 与已提交值完全一致。
另需 `pnpm run check:rules` 通过：`.trellis` 下的 Python 受
`unchecked-throwing-call-python` 规则约束，`int()` / `float()` / `open()`
不能直接调用（用 numpy `.item()` 与 `pathlib` 代替）。

## 3. 编写同步脚本

新增 `apps/web/scripts/sync-ios-app-icon.js`，按设计文档第 4 节实现三步：
复制目录、幂等修补 `project.pbxproj`、校验 `ASSETCATALOG_COMPILER_APPICON_NAME`。

要求：

- 无新增依赖，只用 `node:fs` / `node:path` / `node:process`。
- `gen/apple` 不存在时静默跳过并退出 0。
- 已有同路径引用时不重复插入。
- 修补失败时非零退出，不写半截文件。
- 与 `canonicalize-icns.js` 保持相同的模块风格：导出可测函数加
  `isMainModule()` 命令行入口。

验证：

```sh
node apps/web/scripts/sync-ios-app-icon.js        # 首次接线
grep -c 'AppIcon.icon' <gen>/imsweb.xcodeproj/project.pbxproj   # 记录引用条数
node apps/web/scripts/sync-ios-app-icon.js        # 再跑一次
grep -c 'AppIcon.icon' <gen>/imsweb.xcodeproj/project.pbxproj   # 条数必须不变
```

## 4. 接入 `icon:app` 与测试

### 4.1 更新脚本

`apps/web/package.json` 的 `icon:app` 追加
`&& node scripts/sync-ios-app-icon.js`。

### 4.2 更新基础设施测试

`tests/tauri-build-configuration.test.js` 需要同步的三处：

- `webPackage.scripts["icon:app"]` 的字面量断言。
- `appIconManifest` 的 `deepEqual`（本方案不改 manifest，断言应保持通过，
  确认无需改动即可）。
- 新增一组断言：`.icon` 目录存在、`icon.json` 可解析、三张图层是 1024 × 1024 RGBA、
  且 `icon.json` 的图层顺序是 `[At, Wordmark, Outline]`。

### 4.3 新增单元测试

`apps/web/tests/unit/scripts/sync-ios-app-icon.test.ts`，覆盖：

- `gen/apple` 不存在时不做任何写入。
- 在最小 `project.pbxproj` 夹具上首次接线后引用存在。
- 连续两次接线后引用条数不变（幂等）。
- `ASSETCATALOG_COMPILER_APPICON_NAME` 不是 `AppIcon` 时抛错。

参照 `apps/web/tests/unit/scripts/canonicalize-icns.test.ts` 的夹具方式。

验证：

```sh
pnpm --filter @imsweb/web run test:unit
pnpm run test
```

## 5. 资源治理与文档

### 5.1 `docs/governance/assets.md`

在 App icon 一节下补一段 iOS 液态玻璃图层说明：记录全新几何的五个 primitive、
56/9 px 描边关系、无字体/栅格依赖，以及 SVG 和图层的字节数与 SHA-256。

```sh
shasum -a 256 apps/web/src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/Assets/*.png
```

### 5.2 `docs/development/tauri-mobile.md`

更新第 1 节的图标描述与第 3 节的 `icon:app` 说明，写清 iOS 走 `.icon`、
Android 走 adaptive icon、桌面走 `icons/`，以及为什么接线放在 `icon:app`
而不是 `gen/apple`。

验证：

```sh
pnpm run check:rules
```

## 6. iOS 构建验证

### 6.1 模拟器

```sh
pnpm --filter @imsweb/web exec tauri ios build --target aarch64-sim --debug
pnpm run app ios
```

检查项：

- `Info.plist` 的 `CFBundleIconName` 是 `AppIcon`。
- 产物 `.app` 内含 `AppIcon60x60@2x.png` 等兜底 PNG。
- `assetutil --info Assets.car` 含 `IconImageStack`。
- 主屏图标在默认、深色、着色三种外观下正常，40 pt 下轮廓可辨。

### 6.2 删除派生工程后重建

```sh
rm -rf apps/web/src-tauri/gen/apple
pnpm run app ios
```

一次构建后图标即为液态玻璃版本，不允许需要第二次构建或手工补步骤。

### 6.3 Android 与桌面回归

```sh
pnpm --filter @imsweb/web run icon:app
git status --porcelain apps/web/src-tauri/icons/
```

`icons/` 的变化只能来自源图更新：本次会重写 `icon.icns`、`icon.ico` 与各尺寸 PNG，
它们应显示与应用同源的扁平设计，而不是旧金属稿。Android 构建后确认
`gen/android/app/src/main/res/mipmap-*/ic_launcher*.png` 仍是 adaptive icon 三图层，
前景层顶层颜色只剩 `icon.json` 的三个纯平值，背景层为纯平 `#e0e1e3`，
旧版 `ic_launcher*.png` 与新设计一致。

## 7. 完成前检查

- [x] `ictool` 六个 rendition 全部渲染成功（`--platform iOS --width/--height 1024 --scale 1`，六个输出均非空）。
- [x] SVG 只含五个受控 path primitive（按 `data-layer` 分组）和 `M` / `C` / `Z` 命令，不含字体或栅格图像；
      三张 iOS 图层与 Android 两层都由它派生，重跑脚本后五张 PNG 的 sha256 不变。
- [x] 构建后在模拟器主屏确认 Mark 组黑框无珊瑚色亮边（三层均无 `glass` 键，`@` 的玻璃质感由全局组参数与阴影表达）。
- [x] 连续两次 `icon:app` 后 `project.pbxproj` 的 `AppIcon.icon` 引用条数保持 4。
- [x] 删除 `gen/apple` 后单次 `icon:app` 即恢复 4 条引用与完整 `AppIcon.icon` 目录。
- [x] `pnpm run test` 通过（`REAL_EXIT=0`）。
- [x] `pnpm run check:rules` 通过。
- [x] 黑框外轮廓的过渡是连续圆弧：28 px 圆盘闭运算 + 24 px 倒角 + 8 px 弧长平滑，
      测试断言外轮廓峰值转角 < 45°/px，左侧阶梯与右侧浅湾都已倒圆。
- [x] `@` 的黑边在字面压过来时仍然可见：栅格化把 `@` 外围 6～20 px 环带从字面层减掉，
      测试断言白色不落入该环带且 9 px 白衬线保留（> 5000 px）。
- [x] 模拟器主屏目视确认（浅色外观）；暗色与 Tinted 变体由 `ictool` 六种 rendition 覆盖，系统外观开关在真机/模拟器设置里手动切换。
- [x] Android 图层（背景/前景/单色）已扁平化，mipmap 顶层颜色只剩 `246/17/201` 三个纯平值，背景层为纯平 `#e0e1e3`。
- [x] 桌面源图已改为由 SVG 渲染的派生资产，`icon:app` 重建后的 `icon.icns` / `icon.ico` 与旧系统/Android 旧版位图都显示这版设计。
- [x] 栅格化脚本已作为任务记录保存，`--write` 复现五张已提交图层的 sha256 完全一致。
- [x] 资源治理表与移动端文档已更新（9 行登记项与磁盘逐一比对通过）。

## 风险点与回滚

| 位置 | 风险 | 回滚 |
| --- | --- | --- |
| `apps/web/package.json` | `icon:app` 改动影响 Android 与桌面 | 去掉追加的脚本调用 |
| `gen/apple/imsweb.xcodeproj/project.pbxproj` | 修补错误导致工程打不开 | 删除 `gen/apple` 后重新 `tauri ios init` |
| `apps/web/src-tauri/icon-sources/app-icon.svg` | 控制点或描边误改导致小尺寸闭合 | 用受控 SVG 回滚并重新生成五张 PNG |
| `tests/tauri-build-configuration.test.js` | 字面量断言与脚本不一致 | 与脚本改动同一次提交内更新 |
