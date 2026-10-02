# 局域网 Release 交付

## 当前模拟器交付

按用户要求，R7/R8 仅更新 iOS 模拟器，不操作真机。iPhone 17 Pro / iOS 26.5 已安装并启动包含紧凑反应与分钟时间的 LAN Release，产物为 `apps/web/src-tauri/gen/apple/build/arm64-sim/IMSWeb.app`。

构建记录 `data/qa/namecard-mobile-results/r8-ios-simulator-result.json` 中，58 个源码/资产文件的构建前后 SHA256 均为 `fe5717acec76490322185293a70714c9ea6213281147ac162a2002c0a0354072`。官方命令为 `pnpm run app ios --release --device <simulator-UDID>`，沿用下文命令级 LAN 参数。

原生竖屏 XCTest `run-15` 通过分钟时间、4+2 反应排布、46 项选择器、键盘跳页、预览返回和每页 24 张，并已打开检查截图。旋转组合用例仍未通过，见 [验证记录](validation.md)；不将竖屏结果表述为全部原生场景通过。

Android 和物理 iPhone 仍为下文的 R6 版本，不包含 R7/R8。未提交 Git。

## R6 真机交付历史

两端最新版均包含自然双列、整体 Card、两行分页，以及 R6 的分页避让、短日期和本地统一反应图形。通过既有 `pnpm run app` 入口串行构建并安装，未修改原生插件、安装脚本或持久化环境，未提交 Git。

权威入口：[设备交付文档](../../../../docs/development/app-device-delivery.md) 与 [app-device.js](../../../../apps/web/scripts/app-device.js)。

| 平台 | 当前结果 |
| --- | --- |
| Android A059 | 2026-09-05 19:29:55 更新成功，Release，versionName 0.1.0 / versionCode 1000 |
| Android 核对 | 手机内 APK 与本次产物 SHA256 一致，apksigner 通过，无 DEBUGGABLE 标志；设备 Awake，IMSWeb 在前台 |
| Android 画面 | 已检查前台首页及名片原图预览截图；没有把预览中的零尺寸后台分页节点当成分页验收 |
| iPhone-texas | 2026-09-05 19:27 安装成功；设备锁屏，脚本没有自动启动 App |
| iOS 核对 | codesign 深度严格校验通过，沿用已核实团队及 debugging 导出签名 |

两个构建记录的 58 个源码/资产文件聚合 SHA256 均为 `1a6a5c053ce53db23c9fdaeca65ee5691edfd3f8218c4e1cf1514a031f61282d`，包括 AppLayout、相关名片组件/hook 和全部本地图形/许可文件。Android 包 SHA256 为 `69f9daf07fc0edf09ef8be4be3d657f867574880b41eee787b97f98ccbf8077e`。

iOS 描述文件有效至 `2026-09-06T21:27:15Z`，即北京时间 2026-09-07 05:27:15。到期后需要重新签名构建。Android 使用命令级本地 debug keystore 签名，两端均是本机验证包，不用于商店分发。

## R6 使用与余项

- [x] `app:doctor` 和 `app devices` 通过，未改选 iPad。
- [x] 两端当前源码构建、安装成功并核对签名；Android 已启动。
- [x] Web/App 浏览器验证通过，见 [验证记录](validation.md)。
- [ ] iPhone 解锁后点开 IMSWeb，确认局域网连接和页面；无需再次编译才能首次打开。
- [ ] 两端完整真机分页、选择器和键盘交互仍需人工确认。浏览器五视口不等同于 iOS 原生底栏验收。

## 局域网配置

主机 en0 为 `192.168.31.169`。复用 API 3000、媒体 9000 和 LAN Web 5183，不重建数据服务。实际地图使用既有 HTTPS 样式。构建仅在命令进程中传入：

```text
IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1
VITE_IMS_API_ORIGIN=http://192.168.31.169:3000
VITE_IMS_PUBLIC_SITE_ORIGIN=http://192.168.31.169:5183
VITE_IMS_MAP_TRANSPORT_ORIGIN=http://192.168.31.169:3000
```

Android 额外传入 `IMS_ANDROID_LOCAL_SIGNING=1`；iOS 使用既有 Apple Team，签名信息未写入仓库配置。

## 产物与证据

- Android：`apps/web/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned-aligned.apk`，文件名含 unsigned，但已由入口签名并单独验签。
- iOS：`apps/web/src-tauri/gen/apple/build/arm64/IMSWeb.ipa`。
- 忽略目录 `data/qa/namecard-mobile-results/` 中，`r6-ios-release.log` / `r6-android-release.log` 及对应 `-result.json` 记录本轮构建和安装。
- `r6-ios-verification.json`、`r6-android-verification.json` 记录签名、到期时间和安装包哈希核对；`ios-r6-connectivity.json` 记录恢复后的连接。
- `r6-android-installed.png` 是前台首页；`r6-android-preview-back.png` / `r6-android-preview-front.png` 是实际原图预览，不是分页截图。

此前 `ios-release-final.log` / `ios-install-retry.log` 的设备不可达失败已被本轮安装成功取代；较早 Android 包也已被替换。完整设备标识、生成目录、包、签名材料、日志与截图不提交。
