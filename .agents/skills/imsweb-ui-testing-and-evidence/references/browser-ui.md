# Web 与 App 浏览器 UI 自动化

本指南补充 [Playwright 技能](../../imsweb-playwright-e2e/SKILL.md)，不另建测试入口。命令均从仓库根执行。

## 执行与记录

1. 先读当前 `apps/web/playwright.config.ts`、`apps/web/playwright.app.config.ts` 和 `docs/development/testing.md`。按现有 project 名选择场景，不把 `app-iphone` 的设备模拟误称为 Safari/UIKit。
2. 普通 Web 使用 `pnpm --filter @imsweb/web run test:e2e <spec> --project <project>`；App WebView 浏览器使用 `pnpm --filter @imsweb/web run test:e2e:app <spec> --project <project>`。扩展矩阵由 `node scripts/testing/run-test-owner.mjs web extended` 拥有。
3. 使用 `apps/web/tests/e2e/fixtures/test.ts` 和 API dispatcher；JSON 夹具遵循 contracts。CI/compiled-client 的构建与 origins 前置条件从当前 config/owner 获取。一次运行单独保留 stdout/stderr、真实退出码、浏览器 project、viewport、origin、fixture/真实后端属性、截图和 trace。
4. 只在已有语义/请求/布局完成条件满足后截图。需要动画终态时观测实际几何与有限动画完成；hydrate、图片 decode、滚动和字形也需按当前页面条件确认。不要用固定等待、自动重试或 `force` 点击制造通过。

## 检查矩阵

- 基础：加载、空、错误、已填输入、结果、选中/清除、Dialog、关闭返回。
- 交互：显式提交、组合输入保护、键盘操作、可见焦点、pointer 命中、遮挡、滚动及 overflow。
- 响应式：代表性桌面、窄屏、横屏和实际断点转换；主题/字级/减少动效按变更风险加入，先写 required，再跑场景。
- 生命周期：路由切换、返回、未完成请求、过期回调、反向操作和卸载清理。

测试用户可观察行为，避免为纯装饰、任意像素或 class 顺序扩成宽矩阵。真实键盘、UIKit、系统浏览器回跳和原生命中需要设备证据。

地图底部停靠需使用实际可见导航主体，区分浮动表面间距与滚动内容的全局预留。导航自己的位置已包含 safe area；再次叠加 `--app-bottom-clearance` 会在较大 inset 下拉开空白。按 0/非零 inset 与字号变化检查真实间距，保留导航缺失、键盘裁切时的 fallback；不要移动导航 owner 来掩盖页面的计算错误。

## 截图归档

Playwright 当前配置把运行产物写进 OS 临时目录。根据当前 config/实际命令定位输出，不把某一次 `/tmp` 或 macOS `/var/folders` 路径写死。结束后先复制原图和失败证据到本轮忽略目录并校验 hash，再做缩放/总览。

旧截图可能包含遮字、瞬态动画或失败前置条件。保持原图和结论，修复后的截图用新身份保存。合成地图/fixture 截图只证明该夹具范围；真实供应方、字体或资源加载另行验证。
