# 修复移动端 GPS 定位

## Goal

恢复 Android 与 iOS 真机 App 中“回到我的位置”功能。用户点击地图定位按钮后，系统只在需要时申请使用期间的位置权限；授权后地图显示当前位置标记并回到该位置，拒绝或失败时给出明确反馈。

## Background

- 当前地图按钮在 `apps/web/app/pages/community/exchange/exchange-office-map.tsx:515` 直接检查 `navigator.geolocation`，并在 `:525` 调用浏览器 `getCurrentPosition`。
- 当前 App 没有 Tauri geolocation JavaScript/Rust 依赖，`src-tauri/src/lib.rs:3` 未注册定位插件，`src-tauri/capabilities/default.json:6` 也未授予定位命令。
- `src-tauri/Info.ios.plist:12` 只有局域网用途说明，没有 `NSLocationWhenInUseUsageDescription`。
- 最近生成的 Android Release manifest 只有网络权限，没有 `ACCESS_COARSE_LOCATION` 或 `ACCESS_FINE_LOCATION`。`src-tauri/gen/` 仅用于证明产物现状，不是修改目标。
- 现有单元测试 `apps/web/tests/unit/pages/community/exchange/exchange-office-map.test.tsx:191` 只模拟浏览器成功回调，未覆盖原生权限或失败路径。
- 官方 Tauri 2 geolocation 插件会为 Android 添加粗略和精确位置权限；iOS 仍要求应用提供使用期间的位置用途说明。插件的 `timeout` 在 Android `getCurrentPosition` 和 iOS 上会被忽略，因此 App 侧需要自己的截止时间。

## Requirements

- R1. Tauri Android 与 iOS App 必须通过官方 geolocation 插件获取一次当前位置，并只开放权限检查、权限请求和单次定位命令。
- R2. 首次定位且权限为 `prompt` 或 `prompt-with-rationale` 时，App 必须触发系统权限请求；已授权时不得重复弹窗。
- R3. Android 用户只授予大致位置时仍应允许定位；只有精确和大致位置都不可用时才按拒绝处理。
- R4. iOS 权限说明必须明确位置仅用于在事务所地图上显示和回到用户当前位置。
- R5. Web 站点继续使用 `navigator.geolocation`。App-target 浏览器测试不在真实 Tauri runtime 时也必须走浏览器回退。
- R6. 成功后保留现有标记、缩放、减弱动效和无障碍状态行为；失败继续显示稳定的中文提示。
- R7. App 单次定位必须在 10 秒后进入超时状态，即使原生插件忽略自身 `timeout` 参数；组件卸载或新请求发起后，旧请求不得更新地图。
- R8. 不直接修改或提交 `apps/web/src-tauri/gen/`，Android 权限必须由官方插件的构建集成生成。
- R9. 更新 Tauri 移动端文档，并通过 Web、Rust、基础设施和两端 Release 真机验证。

## Acceptance Criteria

- [x] AC1: Android 和 iOS Release App 首次点击“回到我的位置”时，在权限未决定的设备上出现系统的使用期间位置权限提示。
- [x] AC2: 用户授予精确位置或 Android 大致位置后，地图显示当前位置标记并回到返回坐标，状态文本为“已回到您的位置”。
- [x] AC3: 用户拒绝权限时不调用单次定位命令，页面显示“未获得位置权限”；超时、不可用和不支持状态仍有对应提示。
- [x] AC4: Web 构建仍调用 `navigator.geolocation.getCurrentPosition`，沿用 `enableHighAccuracy: false`、10 秒超时和 30 秒缓存上限。
- [x] AC5: Tauri 能力仅包含权限检查、权限请求和单次定位，不授予持续监听或后台定位能力。
- [x] AC6: iOS Release 产物含 `NSLocationWhenInUseUsageDescription`；Android Release 产物含 `ACCESS_COARSE_LOCATION` 和 `ACCESS_FINE_LOCATION`。
- [x] AC7: 单元测试覆盖浏览器成功与失败、原生已授权、首次请求、大致位置、拒绝、超时和旧请求失效；App Playwright 测试覆盖按钮到地图回中的浏览器回退链路。
- [x] AC8: Web format、lint、typecheck、单元测试、App Playwright、Web/App build、Rust `cargo check`、基础设施测试和规则检查通过。
- [x] AC9: 最新局域网 Release 安装到 Android `A059` 与 iOS `iPhone-texas` 后，两端应用可启动，用户可在真机上完成授权并回到当前位置。

## Out of Scope

- 后台定位、持续轨迹、位置历史或服务端存储。
- 自动打开系统设置页，或在用户永久拒绝后绕过操作系统权限。
- 强制声明设备必须具备 GPS 硬件。地图定位是可选功能，不应因此过滤可安装设备。
- 更改地图数据、API 合同、地图样式或默认缩放策略。
- 修复与定位无关的 Tauri 生成文件或现有工作区修改。
