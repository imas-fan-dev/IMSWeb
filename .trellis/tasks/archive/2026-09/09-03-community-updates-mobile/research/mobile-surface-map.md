# 社区动态移动端代码定位

## 产品范围

用户选择公开发现流：

- 首页社区动态摘要：`apps/web/app/pages/home/components/home-feed.tsx`
- 首页动态行：`apps/web/app/pages/home/components/home-feed-items.tsx`
- 首页人工推荐动态：`apps/web/app/pages/home/components/activity-highlights.tsx`
- 公开列表：`apps/web/app/pages/events/index.tsx`
- 公开列表行与骨架：`apps/web/app/pages/events/components/events-list.tsx`
- 公开详情页面：`apps/web/app/pages/events/event-detail-page.tsx`
- 共享文章详情：`apps/web/app/components/editorial/community-post-detail.tsx`

Web 后台 `/admin/events` 与编辑器不在本任务范围内。App 构建会在 `apps/web/app/routes.ts:197-207` 排除全部后台路由。

## 已确认实现

- `/events` 与 `/events/:eventId` 是 Web 和 App 共享路由，App 将 `/events/*` 归入社区动态标签页。
- `EventsCenter` 已使用 App 横向安全区、下拉刷新、窗口虚拟列表和无限加载。
- `EventRow` 在小屏为单列大图，`EventsSkeleton` 则始终为双栏媒体行。
- `EventRow` 的分类标签默认透明，只在 hover 或键盘焦点时显示。
- `EventDetailPage` 使用固定 `px-4 sm:px-6`，没有复用 App 的 `--app-safe-inline`。
- `CommunityPostDetail` 始终根据 `showBackLink` 显示页面内返回链接；App 顶栏已经提供返回按钮。
- 富文本样式没有约束长 URL、`pre` 或其他固有宽度内容。
- `ActivityHighlights` 在 320px 仍使用双列，标题与箭头共享狭窄文本区。
- `HomeFeed` 与 `ActivityHighlights` 的内容容器使用固定 `px-4 sm:px-6 lg:px-8`，App 横屏时没有应用 `--app-safe-inline`。
- `HomeEventRow` 已是紧凑横向媒体行，可作为 `/events` 手机列表的布局参考。

## 现有验证能力

- Web Playwright 项目：桌面 Chromium、Pixel 7、桌面 Firefox。
- App Playwright 项目：320×568、390×844、Pixel 7、844×390 横屏和 WebKit。
- App 测试可注入四向安全区变量，并检查 `scrollWidth <= clientWidth`、固定控件边界和壳层 CSS token。
- `events.accessibility.spec.ts` 仍断言旧标题“活动中心”。
- `activity-cover-preview.spec.ts` 仍试图从列表直接打开封面，但当前列表封面不是按钮。
- 当前没有 `app-events.spec.ts`，App E2E 尚未访问 `/events`。
- Web Playwright 配置通过 `testIgnore: "app-*.spec.ts"` 排除 App 测试，所以 Web Pixel 7 流程需要独立的非 `app-*` 测试文件。

## 设计依据

- `apps/web/DESIGN.md` 要求公开页面使用 `PageShell`，移动端边距为 16px，并由 App 壳层提供安全区和系统栏尺寸。
- `.trellis/spec/web/frontend/components-and-ux.md` 要求所有状态维持稳定布局，并验证移动端和桌面端的溢出、固定控件与安全区。
- `.trellis/spec/web/frontend/testing.md` 要求可见变更覆盖代表性桌面和移动视口，并检查键盘、语义角色、固定控件和无障碍。
