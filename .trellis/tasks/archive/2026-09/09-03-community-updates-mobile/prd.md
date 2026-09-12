# 社区动态移动端适配

## Goal

让社区动态在移动端 Web 与 Tauri App 中具备完整、稳定且符合触控习惯的使用体验，同时保留现有桌面端行为。

## Background

- 用户已选择范围 B：本任务覆盖首页社区动态入口、公开列表和公开详情，不包含 Web 后台管理。
- 公开社区动态由共享路由 `/events` 和 `/events/:eventId` 提供，Web 与 App 使用同一组页面模块；App 将 `/events/*` 归入“社区动态”标签页（`apps/web/app/routes.ts:13-15`、`apps/web/app/components/app/app-tab-model.ts:30-46`）。
- 首页 `HomeFeed` 与 `ActivityHighlights` 也会展示社区动态入口并跳转到详情页（`apps/web/app/pages/home/components/home-feed.tsx:55`、`apps/web/app/pages/home/components/activity-highlights.tsx:13`）。
- `/admin/events` 列表和编辑器只存在于 Web；App 构建会排除整个后台路由树（`apps/web/app/routes.ts:197-207`）。
- 公开列表已经支持 App 标题栏、横向安全区、下拉刷新、虚拟列表和无限加载（`apps/web/app/pages/events/index.tsx:24-216`）。
- 当前明确缺口包括：手机端列表骨架与实载布局不一致、虚拟列表固定估高不适合图片纵向卡片、触屏看不到依赖 hover 的分类标签、长标题及富文本可能横向溢出、详情页未使用 App 横向安全区且重复显示返回入口（`apps/web/app/pages/events/components/events-list.tsx:52-150`、`apps/web/app/pages/events/event-detail-page.tsx:20-54`、`apps/web/app/components/editorial/community-post-detail.tsx:80-110`）。
- App Playwright 已覆盖 320×568、iPhone、Pixel 7、844×390 横屏和 WebKit，但尚无社区动态 App E2E；现有部分 Events E2E 文案和交互断言已过期（`apps/web/playwright.app.config.ts:35-76`、`apps/web/tests/e2e/events.accessibility.spec.ts:6-10`、`apps/web/tests/e2e/activity-cover-preview.spec.ts:127-153`）。

## Requirements

- R1：首页 `HomeFeed`、`ActivityHighlights`、`/events` 列表和 `/events/:eventId` 详情组成的公开发现与阅读流程需要同时支持移动端 Web 与 Tauri App，并共用现有页面与 API。
- R2：列表的加载、错误、空态、刷新、分页和成功状态需要在 320px 起的小屏中保持稳定布局，不得产生横向溢出或明显跳动。
- R3：详情页需要适配 App 横向安全区与底部标签栏空间；App 使用壳层返回按钮，Web 保留页面内返回入口。
- R4：标题、联系方式、相关文章链接和 CMS 富文本中的长单词、URL、图片、列表及预格式化内容不得撑破视口。
- R5：分类等重要信息在触屏设备上无需 hover 即可读取；可操作控件需要具备稳定的触控尺寸和按压反馈。
- R6：首页目标内容带、列表和详情需要复用 App 壳层的 `--app-safe-inline`、顶部栏、标签栏、下拉刷新与滚动恢复能力，不新建独立移动端页面。
- R7：不得改变 API 合约、鉴权语义、CMS 数据模型、发布流程或桌面端业务行为。
- R8：修复本次范围内已经失效的社区动态 E2E，并增加 Web 手机视口与 App 多视口回归测试。

## Acceptance Criteria

- [x] 320×568、390×844、Pixel 7、844×390 横屏以及桌面视口中的目标页面没有横向滚动、布局重叠或意外裁切；列表按设计限行并明确提供详情入口。
- [x] 用户可以在移动端 Web 与 App 中完成目标范围内的社区动态发现、列表浏览、刷新、分页、进入详情、查看封面和打开相关链接。
- [x] App 详情内容避开四向安全区和底部标签栏，且不重复显示页面内返回入口；Web 导航保持现状。
- [x] 超长标题、联系方式、链接和富文本测试数据不会撑破视口，触屏可见信息无需 hover。
- [x] 加载骨架与实载列表使用一致的小屏轨道和固定高度；延迟封面加载前后，首屏前三个实载行的纵向位置与窗口滚动位置变化均不超过 2px。
- [x] 桌面端社区动态页面没有可见回归，键盘焦点和无障碍语义保持可用。
- [x] 相关单元测试、Web E2E、App E2E、格式化、lint、类型检查与生产构建全部通过。

## Out of Scope

- API、CMS 数据模型、迁移数据与后台权限变更。
- Tauri 原生标签栏或原生插件重构。
- 社区动态后台列表和编辑器的移动端适配。
- 其他社区模块、账户页面和地图页面的响应式改造。
