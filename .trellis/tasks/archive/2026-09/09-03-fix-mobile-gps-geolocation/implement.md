# 移动端 GPS 定位实施计划

## Checklist

- [x] 1. 使用 Web workspace 与 Cargo 的受控依赖命令添加 `@tauri-apps/plugin-geolocation` 和 `tauri-plugin-geolocation`，核对 `package.json`、`Cargo.toml`、`pnpm-lock.yaml` 与 `Cargo.lock`，不接受无关依赖变更。
- [x] 2. 在 mobile target 注册 Rust 插件，新增 mobile-only capability，并为 iOS 增加 `NSLocationWhenInUseUsageDescription`。
- [x] 3. 新增 `app/lib/geolocation.ts`，实现 Tauri 原生权限流、Android 大致位置支持、浏览器回退、稳定错误类型和可清理的 10 秒 deadline。
- [x] 4. 改造 `ExchangeOfficeMap` 使用异步适配器，保留 marker、缩放、减弱动效、无障碍状态与旧请求保护。
- [x] 5. 新增适配器单元测试，扩展地图组件测试，覆盖成功、拒绝、超时、不可用和旧请求。
- [x] 6. 扩展 App Playwright 与基础设施测试，固定浏览器回退、插件注册、最小 capability 和 iOS 用途说明。
- [x] 7. 更新 `docs/development/tauri-mobile.md`，记录一次性定位、权限边界和真机验收要求。
- [x] 8. 运行格式化和分层验证，修复本任务引入的问题，不处理无关现有修改。
- [x] 9. 重建局域网 Android/iOS Release，检查 merged manifest 和 IPA plist，安装到 `A059` 与 `iPhone-texas` 并启动。
- [x] 10. 在两台真机上验证权限提示、授权成功、地图回中和拒绝提示；记录无法自动观察的人工验收项。

## Validation Commands

```sh
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web exec vitest run tests/unit/lib/geolocation.test.ts tests/unit/pages/community/exchange/exchange-office-map.test.tsx
pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts tests/e2e/app-map.spec.ts
pnpm --filter @imsweb/web run build
pnpm --filter @imsweb/web run build:app
cargo check --manifest-path apps/web/src-tauri/Cargo.toml
node --test tests/tauri-build-configuration.test.js
pnpm run check:rules
```

真机交付前：

```sh
pnpm run app:doctor
pnpm run app devices
```

局域网 Release 使用当前开发机私网地址，并通过现有 `pnpm run app ...` 包装器构建、安装和启动。Android 本机验证签名保持临时环境变量，iOS Team ID 不写入仓库或 shell profile。

## Review Gates

- 依赖版本与当前 Tauri 2.11 兼容，JavaScript 和 Rust 插件版本匹配。
- desktop/Web build 不需要移动端 capability，也不加载原生定位命令。
- Android 大致位置授权可用，权限拒绝时不调用定位。
- timeout timer 在 resolve/reject 后清理，旧原生 promise 不产生未处理 rejection。
- `src-tauri/gen/` 只用于产物验证，不进入提交。
- 构建前后检查工作区，保留用户已有的 `apps/web/src-tauri/icons/icon.icns` 修改。

## Verification Evidence

- Web `check` 通过，包含完整 lint、typecheck、单元测试和生产构建。
- 定位聚焦单元测试 26 个通过；App 地图 Playwright 4 个通过，6 个按项目筛选规则跳过。
- Rust `cargo check`、App target build、规则检查和差异空白检查通过。
- 根基础设施测试通过：34 个 Node 测试和 86 个 Python 测试。
- Android `A059` 已安装 Release `0.1.0` 并运行。首次点击出现系统位置弹窗；选择大致位置后，仅粗略权限为 granted，地图显示“已回到您的位置”、当前位置标记，并回到设备坐标附近。
- Android APK 含粗略和精确位置权限，签名 v2/v3 校验通过；SHA-256 为 `64b0fb5b5d0c460cd06803a37fe9a864e31f1290d64214a5cfa836ba579d1fb9`。
- iOS `iPhone-texas` 已安装 Release `0.1.0` 并运行，进程 PID `66754`。IPA plist、严格签名和 Team ID 已验证；SHA-256 为 `b0cceb531e71e054c87fec9a2682a0b48923f06b03d98498ea97258649f0f987`。
- 用户已在 Android `A059` 与 iOS `iPhone-texas` 上完成系统权限交互，并确认两端定位、当前位置标记和地图回中均成功。

## Rollback Points

- 依赖安装后先审查 manifest 与 lockfile；出现无关变更时停止，不进入代码集成。
- 原生配置完成后先跑 `cargo check` 和基础设施测试；失败时不继续页面改造。
- 页面改造后先跑 focused unit，再扩大到 Web/App build。
- 真机安装只在自动门禁通过后执行，失败时保留已验证产物和完整错误，不修改生成工程绕过问题。
