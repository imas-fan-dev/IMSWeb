# 移动端 GPS 定位修复设计

## Behavior Boundary

最小行为差距是：地图已经有一次性定位 UI 和成功后的地图处理，但发布 App 没有连接操作系统位置权限与定位服务。修复应落在 Tauri 原生能力和一个 Web 运行时适配器中，地图组件只消费统一的一次性坐标结果。

本任务预计修改：

- `apps/web/package.json` 与 `pnpm-lock.yaml`：添加匹配的官方 JavaScript 插件依赖。
- `apps/web/src-tauri/Cargo.toml` 与 `Cargo.lock`：添加 Rust 插件依赖。
- `apps/web/src-tauri/src/lib.rs`：仅在 mobile target 注册插件。
- `apps/web/src-tauri/capabilities/geolocation.json`：只允许检查、请求和单次定位命令，且只应用于 iOS/Android。
- `apps/web/src-tauri/Info.ios.plist`：添加使用期间的位置用途说明。
- `apps/web/app/lib/geolocation.ts`：统一原生 App 与浏览器的一次性定位行为和错误类型。
- 地图组件及对应单元测试：改用适配器，同时保留标记、状态和旧请求保护。
- `tests/tauri-build-configuration.test.js`：固定原生依赖、能力与 iOS 声明。
- App Playwright 测试和 `docs/development/tauri-mobile.md`：覆盖浏览器回退并记录当前原生契约。

不修改 API、共享 wire contract、地图数据和 `src-tauri/gen/`。若依赖安装生成额外的非派生配置修改，必须逐项解释后才能保留。

## Runtime Design

新增 `getCurrentCoordinates()` 作为非 UI 基础设施，返回 `{ latitude, longitude }`，失败时抛出带稳定 `kind` 的定位错误：

- `permission-denied`
- `timeout`
- `unavailable`
- `unsupported`

运行时选择：

1. `IS_APP_TARGET && isTauri()` 为真时，动态加载 `@tauri-apps/plugin-geolocation`。
2. 先调用 `checkPermissions()`。
3. 当精确和大致权限处于可提示状态时，调用 `requestPermissions(["location"])`，让 Android 用户仍可在系统提示中选择大致位置。
4. `location === "granted"` 或 `coarseLocation === "granted"` 时调用原生 `getCurrentPosition()`。
5. 两种权限都未授权时抛出 `permission-denied`，不调用定位命令。
6. 非真实 Tauri runtime 继续包装 `navigator.geolocation.getCurrentPosition()`，保持 Web 和 Playwright 行为。

## Timeout and Stale Requests

官方插件在 Android 单次定位和 iOS 上忽略 `PositionOptions.timeout`。适配器仍把当前选项传给插件，但额外用可清理的 JavaScript deadline 在 10 秒后抛出 `timeout`。原生调用无法取消，其迟到结果不会再传给组件。

地图组件保留 `locationRequestRef`。每次点击生成新请求编号，成功与失败都要同时检查编号和当前地图实例；组件卸载时递增编号，因此迟到结果不会创建 marker、移动地图或更新状态。

## Permissions and Privacy

- JavaScript capability 使用独立的 mobile-only 文件，避免 desktop build 在未注册插件时解析移动权限。
- 只授予 `geolocation:allow-check-permissions`、`geolocation:allow-request-permissions` 和 `geolocation:allow-get-current-position`。
- 不授予 `watch-position`、`clear-watch-position` 或后台定位。
- iOS 只声明 `NSLocationWhenInUseUsageDescription`。
- Android 权限由官方插件生成。接受用户选择大致位置，不添加 `android.hardware.location.gps required=true`。

## Error and UX Contract

地图继续使用现有中文状态：

- `permission-denied` -> `未获得位置权限`
- `timeout` -> `获取位置超时，请重试`
- `unsupported` -> `当前设备不支持位置服务`
- 其他原生或浏览器失败 -> `暂时无法获取您的位置`

按钮定位期间仍禁用并显示加载状态。成功后的 marker、`easeTo`、`prefers-reduced-motion` 和屏幕阅读器文本保持不变。

## Validation

静态和自动化验证包括：

- 适配器单元测试覆盖运行时选择、权限状态、Android 大致位置、错误和 JavaScript deadline。
- 地图组件测试覆盖成功、错误和旧请求，不依赖真实原生插件。
- App Playwright 在浏览器上下文授予模拟位置后点击按钮并验证地图回中。
- 基础设施测试读取 package、Cargo、capability、plist 和插件注册源，防止某一层遗漏。
- Web/App build 与 `cargo check` 证明 desktop/Web 不受 mobile-only 集成影响。
- 两端局域网 Release 重建后检查 IPA plist 和 merged Android manifest，再安装到 `A059` 与 `iPhone-texas`。

最后的 GPS 传感器和系统权限弹窗只能在真机上完成验收。自动化证据负责证明应用声明、调用链和安装包正确，真机点击负责确认操作系统交互。

## Rollback

依赖与原生注册、capability、plist、适配器和地图调用必须作为一组回滚。回滚后 Web 浏览器定位会恢复旧路径，但发布 App 的定位仍会失效，因此不能只移除其中一端权限或只回退页面适配器。
