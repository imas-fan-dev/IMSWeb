# 工具链实测证据

本文件记录规划阶段实际执行过的命令与观察结果，供实现阶段复核，不重复 design.md 的推导论述。
版本：Xcode 27.0（27A266a），`ictool` bundle-version 129 / short-bundle-version 27.0。

## 1. 定位 `ictool`

```sh
ICT="$(dirname "$(xcode-select -p)")/Applications/Icon Composer.app/Contents/Executables/ictool"
"$ICT" --version
```

输出：

```json
{ "bundle-version" : "129", "short-bundle-version" : "27.0" }
```

## 2. `.icon` 是纯目录

最小可用结构：

```text
AppIcon.icon/
  icon.json
  Assets/glyph.png
```

手写 `icon.json` 加一张 1024 × 1024 PNG 后渲染成功：

```sh
"$ICT" AppIcon.icon --export-image --output-file out.png \
  --platform iOS --rendition Default --width 256 --height 256 --scale 1
```

成功时打印 `{}` 并退出 0。

## 3. `actool` 的输入要求

| 输入 | 结果 |
| --- | --- |
| `actool AppIcon.icon --app-icon AppIcon` | 成功，产出 `IconImageStack` 与兜底 PNG |
| `actool Test.xcassets`（`.icon` 在 xcassets 内部） | 报 `None of the input catalogs contained a matching … icon stack named AppIcon` |
| 同上加 `--target-device iphone --target-device ipad` | 输出目录为空 |
| `actool Coexist.xcassets AppIcon.icon`（appiconset 与 `AppIcon.icon` 同名共存） | 成功，`Assets.car` 仍含 `IconImageStack` |

成功时的输出文件：

```text
partial.plist
AppIcon60x60@2x.png
AppIcon76x76@2x~ipad.png
Assets.car
```

`partial.plist` 内容包含 `CFBundleIconName = AppIcon`（iPhone 与 iPad 各一份）。

`Assets.car` 中的图标相关 rendition：

- `IconImageStack`：`UIAppearanceLight`、`UIAppearanceDark`、`ISAppearanceTintable`
- `Icon Image`：phone 与 pad 各一份，逐外观
- `MultiSized Image`：phone 与 pad 各一份

参考命令：

```sh
xcrun assetutil --info Assets.car | grep -c IconImageStack
```

## 4. 图层顺序对照

两份文档只差 `groups[0].layers` 的数组顺序，其余完全一致。

| 顺序 | `Default` 渲染 |
| --- | --- |
| `[Outline, Wordmark, At]` | 只有深色轮廓，上层不可见 |
| `[At, Wordmark, Outline]` | 完整字标：轮廓在下，字面与 `@` 在上 |

单层隔离渲染可以佐证三层素材本身都有效：`Outline` 单独渲染是深色剪影，
`Wordmark` 单独渲染是白色字面，`At` 单独渲染是红色 `@`。

## 5. `tauri icon` 的写入范围

`pnpm --filter @imsweb/web run icon:app` 之前与之后对比：

- 重写 `gen/apple/Assets.xcassets/AppIcon.appiconset/` 的 18 张 PNG。
- 重写 `gen/android` 下的 26 个 mipmap 文件。
- `gen/apple/imsweb.xcodeproj/project.pbxproj` 的 md5 不变。
- 连续两次执行后 `src-tauri/icons/icon.icns` 的 md5 相同
  （两次均为 `776e02156d1ed0fb8cb873de5a6b3207`）。

## 6. `tauri ios build` 对 `project.pbxproj` 的写入

在执行前后记录 md5：

```sh
md5 -q apps/web/src-tauri/gen/apple/imsweb.xcodeproj/project.pbxproj
cd apps/web && pnpm exec tauri ios build --target aarch64-sim --debug
md5 -q src-tauri/gen/apple/imsweb.xcodeproj/project.pbxproj
```

两次均为 `9e8c88a5fdc01f6f40b58ee6afbc5185`。构建日志中有 `** BUILD SUCCEEDED **`，
说明 xcodebuild 已完整跑完资产编译与链接。

同一次构建的日志尾部有：

```text
failed to rename app …/imsweb_iOS.xcarchive/Products/Applications/IMSWeb.app:
Directory not empty (os error 66)
```

这是残留的 xcarchive 目录导致的 Tauri 归档步骤失败，与图标无关。
首次 iOS 验证前删除 `apps/web/src-tauri/gen/apple/build/imsweb_iOS.xcarchive` 即可。

该结论只有这一条构建证据，没有从 Tauri CLI 源码确认写入时机。规划阶段尝试的一次
源码调研（`tauri-cli` 的 `mobile/ios.rs` 与 `templates/ios-xcode`）在运行中中断，
没有产出结论，因此上面的 md5 对比是唯一依据。若要更强的保证，改用 `tauri ios dev`
再跑一次同样的 md5 对比。

## 7. 分层素材的参照数字

从 `icon-sources/android-foreground.png` 推导时观察到的中间量：

| 量 | 值 |
| --- | --- |
| 原图 alpha > 0 | 210,896 px |
| 原图 alpha = 255 | 152,004 px |
| 9 × 9 中值滤波后的亮度分箱（0-10 / 10-20 / 20-25 / 25-30 / 30-35 / 35-40） | 61,155 / 3,631 / 1,206 / 1,105 / 1,168 / 1,755 |
| `al >= 128` 二值化 | 187,988 px |
| 填充封闭孔洞 | 8,318 px |
| 轮廓 S | 214,152 px |
| 描边核心 `lum < 12` 连通域 | 2 个，60,204 / 2,646 px（其余为零星小点） |
| 描边（膨胀 2 px 后用 S 收边） | 80,336 px |
| 红色 `@` | 39,008 px |
| 描边外的浅色环（切除） | 27,665 px |
| 轮廓 S2（切除后） | 186,487 px |
| 字面 | 70,504 px |

色度分布是双峰的：`chroma <= 40` 约 143k px，`chroma > 60` 约 38k px。
这里用 HSV 口径的 `max − min`；换成 `(max − min) / max` 会让近黑像素虚高，
把描边边缘误判成红色。
亮度分布不是双峰的，银色字面的纵向渐变暗部落在描边亮度区间内，
这是不能单靠亮度阈值分层的原因。

黑色描边外侧还有一圈浅色双重描边，实测约 7 px 宽、亮度 162–204，
与描边的亮度 0–50 之间有明显的空档。它在扁平化后只会读成白边，
因此从轮廓里整圈切除，而不是交给字面层。

## 8. 本地 spike 产物

规划阶段在 `/tmp/icrender/Final.icon` 生成的文档已渲染出六个 rendition，
`Default` 与 `Dark` 外观下黑色轮廓、白色字面与红色 `@` 均正确，
`Tinted*` 由系统派生金色着色，`Clear*` 为单色玻璃。
该目录是临时产物，实现阶段需要按第 7 节数字重新生成受控版本。

## 9. `tauri ios init` 的本机卡点

删除 `gen/apple` 后重跑 `pnpm exec tauri ios init`，600 秒无任何产出。排查过程：

```sh
PID=$(pgrep -f "tauri ios init" | head -1)
for c in $(pgrep -P $PID); do for g in $(pgrep -P $c); do ps -o pid,etime,command -p $g | tail -1; done; done
```

输出里有一个孙进程：

```text
15161   00:32 /bin/bash -p /opt/homebrew/Library/Homebrew/brew.sh outdated --json=v2
```

Tauri CLI 用 `brew outdated` 检查 Apple 依赖，而 `brew outdated` 会隐式跑一次 `brew update` 走网络。本机网络下这一步会挂死。加上环境变量后：

```sh
HOMEBREW_NO_AUTO_UPDATE=1 brew outdated --json=v2   # 1.3s，exit 0
```

阻塞解除，`tauri ios init` 正常生成工程。这与图标方案无关，但会影响任何人在这台机器上首次生成 iOS 工程，包括 `pnpm run app ios` 与 `pnpm run app:doctor`。

## 10. 构建验收证据

删掉 `gen/apple` 后重跑 `tauri ios init`，新工程里 `AppIcon.icon` 的引用数是 0。跑一次
`pnpm run icon:app` 后变成 4，且四行分别是：

```text
67BBA242B5AEF8AF37BD4888 /* AppIcon.icon in Resources */ = {isa = PBXBuildFile; fileRef = F96A30C5109956C4D00D31B3 /* AppIcon.icon */; };
F96A30C5109956C4D00D31B3 /* AppIcon.icon */ = {isa = PBXFileReference; lastKnownFileType = folder.icon; path = AppIcon.icon; sourceTree = "<group>"; };
```

另两处分别在根 `PBXGroup` 的 children 与 `PBXResourcesBuildPhase` 的 files。再跑一次
`icon:app`，引用数仍为 4。

`pnpm exec tauri ios build --target aarch64-sim --debug` 报 `** BUILD SUCCEEDED **`，
产物在 `gen/apple/build/arm64-sim/IMSWeb.app`。对它检查：

| 检查项 | 实际结果 |
| --- | --- |
| `Assets.car` 的 `IconImageStack` 数量 | 3 |
| 外观覆盖 | `UIAppearanceLight`、`UIAppearanceDark`、`ISAppearanceTintable` |
| `Icon Image` rendition | `AppIcon1024x1024_UIAppearanceAny`、`_UIAppearanceDark`、`_ISAppearanceTintable` 各两份（phone 与 pad） |
| 兜底 PNG | `AppIcon60x60@2x.png`、`AppIcon76x76@2x~ipad.png` |
| 图标声明键 | `CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName = AppIcon` |

最后一个键的位置值得留意。`actool` 把 `CFBundleIconName` 写在
`CFBundleIcons.CFBundlePrimaryIcon` 下面，不是 Info.plist 根层。用
`plutil -extract CFBundleIconName raw` 取会报 `No value at that key path`，
看起来像没写进去，实际是取错了路径。核对时用：

```sh
plutil -p "$APP/Info.plist" | grep -A6 CFBundleIcons
```

## 11. 切除黑边外浅色环（实现阶段追加）

`word_m = S ∧ ¬stroke` 把原图那圈浅色双重描边整圈带进了字面层，渲染后表现为黑边外侧的白边。
修正做法是在 `S ∧ ¬stroke ∧ ¬red` 里以描边为界，从轮廓外缘做连通扩张，扩张到的浅色环整圈丢弃。

同时修正了红色 `@` 的色度口径。`(max − min) / max` 在近黑像素上会虚高，
例如 (10, 5, 5) 算出来是 127，足以把描边边缘误判成红色；改用 HSV 的 `max − min` 后正常。

| 量 | 修正前 | 修正后 |
| --- | --- | --- |
| 红色 `@` | 77,917 px（bbox x185-831，横跨整个字标） | 39,008 px（bbox x341-633 / y467-718） |
| `Wordmark.png` | 97,377 px / 23,697 B | 70,504 px / 16,784 B |
| `Outline.png` | 214,156 px / 14,055 B | 186,487 px / 13,396 B |
| `At.png` | 39,008 px / 15,141 B | 不变，sha256 仍是 `82709bca…d50540` |

`At.png` 逐字节一致，说明 `@` 层不受这次修正影响，也说明推导链路复现正确。

重新构建后 `Assets.car` 由 5,259,240 字节变为 5,229,544 字节，`IconImageStack` 仍为 3 条，
外观仍覆盖 `UIAppearanceLight`、`UIAppearanceDark`、`ISAppearanceTintable`，
兜底 PNG 与 `CFBundleIcons` 键路径不变。

iOS 27.0 模拟器（iPhone 17）主屏目视确认白边消失；`Default` rendition 在 40 / 60 / 80 pt
三个尺寸下轮廓可辨、无可见杂点。

## 12. Android 前景层扁平化

早先「前景层带烘焙投影」的说法没有实测支持，这次补测：

| 量 | `android-foreground.png` |
| --- | --- |
| 半透明像素 | 58,892 |
| 其中偏亮（亮度 ≥ 176） | 44,916 |
| 其中偏暗（亮度 < 96） | 6,542，平均 alpha 167.7，bbox 覆盖整个字标 |

偏暗的半透明像素 bbox 是整圈而不是偏右下的月牙，数量也只占 11%，符合黑边外缘抗锯齿的特征，
不符合投影的特征。所以原图没有烘焙投影，需要处理的只有字面内部的金属渐变。

三版对照（合成到 adaptive icon 画布后加圆角遮罩）：

| 版本 | 内容 |
| --- | --- |
| 原图 | 金属渐变字面、黑边外白环、右下不透明立体挤出 |
| A 切除白环 | 与 iOS 同一份剪影，扁平三色 |
| B 保留白环 | 扁平三色，但黑边外仍有白环 |

选 A：与 iOS 逐像素同一套蒙版，且启动器实际尺寸下白环只有约 1 px（1024 下 7 px）。
B 保留的是原美术的双层描边，它是有意的设计元素而非烘焙阴影，但为两个客户端一致性让位。

覆盖后：

| 文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| `android-foreground.png` | 18102 | `98524d0c0569195387858d07e0ac82678e6e54d4c50e0c905d1a929a9151d34d` |
| `android-monochrome.png` | 13396 | `dba8ed598dc945ae48071cd48a8694eb145ed0729f42fc9417cc04db5717035b` |

`android-monochrome.png` 与 `Outline.png` 字节相同，两者都是同一份 `S2` 剪影填白。

重跑 `icon:app` 后 `gen/android` 的 `ic_launcher_foreground.png` 顶层颜色只剩
`(246,246,248)` / `(17,17,19)` / `(201,26,29)`，即 `icon.json` 的三个默认值，渐变消失。
桌面 `icons/` 无变更，`icon.icns` 仍是 `776e02156d1ed0fb8cb873de5a6b3207`。

### 推导脚本不能对扁平版重跑

把扁平版当前景层再跑一次推导会得到空描边：描边判定是 `lum < 12`，
而扁平版的描边色取自 `icon.json` 的 `0.06667, 0.06667, 0.07451`，亮度约 17。
描边为空后，浅色环检测会把整条字标吞掉（`S2` 从 186,487 px 掉到 42,389 px）。
脚本的输入只能是扁平化前的原图，取回方式：

```sh
git show <提交>:apps/web/src-tauri/icon-sources/android-foreground.png > /tmp/android-foreground.png
```

### 脚本复现性

把脚本固定为任务记录后，用它重跑一次 `--write`，三张 iOS 图层的 sha256
与已提交值逐一相同（`dba8ed59…` / `46ebc6df…` / `82709bca…`），
说明固化的算法与原管线等价。

## 13. 图层边缘高光与轮廓圆化（实现阶段追加）

### 珊瑚色亮边来自 `glass` 材质

红 `@` 的边界上有一圈约 8 px 宽的偏粉亮带，主体是 `(188, 56, 51)`，边界峰值到
`(255, 92, 87)`。开始时按蒙版问题排查，方向全错，证据如下。

`ictool` 对 `icon.json` 的以下改动**渲染结果逐字节相同**：

| 改动 | 结果 |
| --- | --- |
| `glass: true` → 去掉 | 相同 |
| 组 `specular: true` → 去掉 | 相同 |
| 组 `shadow` → 去掉 | 仅整体暗约 3/255，亮边不变 |
| `fill-specializations` → 平铺 `fill` | 相同 |

也就是说 `ictool` 的 `--export-image` 忽略 `glass` 与 `specular`，只用 `fill` 系列着色。
（`ictool` 确实会重渲染：去掉 fill 后图层改渲染 PNG 自身的白色。）

亮带的性质：

| 测试 | 观察 |
| --- | --- |
| 渲染尺寸 512 / 1024 / 2048 | 亮带折算回 1024 均为 8.0 / 8.0 / 7.5 px，即宽度定义在图标的坐标空间，不是栅格效应 |
| 填充改成中灰（extended-srgb 0.2） | 边界峰值 100，主体 62–63 |
| 填充改成近黑（0.02） | 边界峰值 58–59，主体 19–20，且带振铃：`58 51 59 51 46 41 30 26 20` |
| 白字面 | 主体已饱和到 255，亮边被削平，所以看不出来 |

振铃形状说明这是渲染器对图层做的边缘增强/高光，且对**每一层**都生效。

决定性验证只能走真机构建，因为 `ictool` 忽略该标志。把 At 层的 `glass: true` 去掉后
`tauri ios build --target aarch64-sim --debug` 成功，模拟器主屏对比：珊瑚色亮边完全消失，
`@` 变成干净的纯平红。随后把 Wordmark 的 `glass` 也去掉，保持整枚字标一致。

### 轮廓圆化

二值蒙版的边界本身带逐像素台阶，阈值噪声还会啃出 1 px 缺口，渲染后就是毛糙的边。
0.5 px 羽化只是把毛糙糊开，不消除。改用轮廓圆化：

```text
4 倍双三次放大 → 高斯模糊 σ=8（等效 2 px）→ 重新以 128 二值化 → 盒式降采样回原尺寸
```

只移动轮廓，不动形状：

| 图层 | 圆化前 | 圆化后 | 消失 | 新增 |
| --- | --- | --- | --- | --- |
| Outline | 186,487 px | 186,511 px | 24 | 48 |
| Wordmark | 70,504 px | 70,387 px | 149 | 32 |
| At | 39,008 px | 39,025 px | 102 | 119 |

三张蒙版必须由同一份轮廓派生，否则交界处会开出 1 px 缝：做法是先圆化轮廓、`@` 与描边，
再用 `轮廓 − 描边 − @` 得到字面并单独圆化，而不是各自独立圆化后拼接。

降采样用盒式滤波器，边缘只剩一条抗锯齿带（约 18 级灰阶），而不是原先 0.5 px 羽化留下的
多像素过渡。Android 前景层与单色层复用同一份覆盖率图，保持两个客户端一致。
