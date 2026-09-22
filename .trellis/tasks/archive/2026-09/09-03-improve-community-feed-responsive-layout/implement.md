# 社区动态固定高度列表实施计划

## 实施顺序

- [x] 1. 按 `docs/development/ai-environment.md` 执行 Web 工作区预检，确认当前脏工作树中与本任务无关的修改并保持不动；`dev:doctor` 仅报告 Valkey `6379` 已被本机容器运行时占用，以及无关 API package 状态导致的 lockfile 提示。
- [x] 2. 读取 Web 前端规范、列表组件、虚拟列表调用点及现有单元和浏览器测试，确认实载行、骨架和虚拟估高必须同步变更。
- [x] 3. 扩展 `events-list.test.tsx`，覆盖 `144px` 固定行高、单行标题、右侧分类标签、摘要退出列表、右侧整体居中、所有视口元信息独立成行以及骨架结构一致性。
- [x] 4. 调整 `EventRow`：将行高从 `176px` 收紧为 `144px`，缩短内边距和桌面封面轨道，把分类标签从封面移到右侧标题下方，移除摘要，垂直居中信息块；所有视口保持发布者、日期和可选联系方式独立成行。
- [x] 5. 同步调整 `EventsSkeleton` 的行高、媒体轨道、占位层级和垂直对齐，并把 `EventsCenter` 的虚拟列表估高改为 `144px`。
- [x] 6. 对七个目标文件运行 Prettier，完成 LSP、lint、类型检查和相关单元测试，并修复桌面日期绝对定位与错误测试假设。
- [x] 7. 扩展 Events Web/App Playwright 几何断言，覆盖 320px、390px 和桌面端的固定高度、封面尺寸与比例、中心对齐、单行标题、字段可读宽度、独立元信息行、横向溢出及延迟图片稳定性。
- [x] 8. 使用 Playwright 截图核对目标视口；检查标题、封面、元信息和底部导航无不合理重叠。
- [x] 9. 运行 Web 工作区检查、目标 E2E、规则检查和最终质量复核；`app:doctor` 通过，未执行原生设备安装，Apple 开发团队未配置只影响签名发布。

## 预计修改文件

- `apps/web/app/pages/events/components/events-list.tsx`
- `apps/web/app/pages/events/index.tsx`
- `apps/web/tests/unit/pages/events/events-list.test.tsx`
- `apps/web/tests/unit/pages/events/events-center.test.tsx`
- `apps/web/tests/unit/pages/events/events-app-header.test.tsx`
- `apps/web/tests/e2e/events-mobile.spec.ts`
- `apps/web/tests/e2e/app-events.spec.ts`

`events/index.tsx` 只修改虚拟列表估高，从 `176px` 同步为 `144px`；分页、测量、overscan 和滚动行为保持不变。

## 验证命令

```sh
pnpm run dev:doctor
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web exec vitest run tests/unit/pages/events/events-list.test.tsx tests/unit/pages/events/events-center.test.tsx
pnpm --filter @imsweb/web run build
pnpm --filter @imsweb/web exec playwright test tests/e2e/events-mobile.spec.ts --project=chromium-desktop --project=chromium-mobile
pnpm --filter @imsweb/web run test:e2e:app -- tests/e2e/app-events.spec.ts
```

路由和服务端所有权不在修改范围内，因此默认不运行 `test:web-routing`。如实现触及路由、预渲染或服务端回退，再追加该检查。

## 验证结果

- 目标 Prettier、LSP 和 `git diff --check`：通过。
- Events 单元测试：3 个文件、14 个测试通过。
- Web Playwright：Chromium 桌面与移动端 2 个项目通过。
- App Playwright：320px、iPhone、Android、横屏和 WebKit 5 个项目通过。
- Web 完整检查曾完成 161 个文件、837 个测试全通过，并完成生产构建。最终复跑出现 2 个无关并发测试超时；对应文件隔离重跑 12 个测试全部通过，最终生产构建再次通过。
- `pnpm run check:rules`：Agent、源码边界和文档规则全部通过。
- `pnpm run app:doctor`：通过；仅提示未设置 `TAURI_APPLE_DEVELOPMENT_TEAM`。

## 审查门槛

- `EventRow`、`EventsSkeleton` 和虚拟列表估高统一为 `144px`，媒体轨道与间距匹配。
- 标题限制为一行，分类标签在右侧标题下方且不再覆盖封面，摘要不显示；所有视口中的发布者、日期和联系方式分别占一行，日期不遮挡其他内容。
- 320px、390px 和桌面端无横向溢出、重叠、图标孤立或文字区域明显偏心。
- 短内容、长内容、无联系方式及延迟图片都不改变条目高度。
- 分页、虚拟滚动、详情导航、键盘焦点、触控反馈和分类可见性没有回归。
- 相关单元测试、Playwright、lint、类型检查和构建通过。

## 回滚点

1. `EventRow` 与 `EventsSkeleton` 作为一个回滚单元。
2. 单元测试随对应布局行为一起回滚。
3. 浏览器几何断言仅在产品布局恢复时一起回滚，保留通用的横向溢出与图片稳定性检查。
