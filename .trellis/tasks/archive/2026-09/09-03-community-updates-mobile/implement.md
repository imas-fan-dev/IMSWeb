# 社区动态移动端适配实施计划

## 实施顺序

- [x] 1. 执行 Web 工作区预检，确认现有未提交改动与本任务文件边界；读取前端规范和相关组件测试。
- [x] 2. 先扩展单元测试，固定首页标题区、推荐网格、动态行、详情返回入口、长文本、触控尺寸和共享详情后台预览的预期行为。
- [x] 3. 调整 `HomeFeed` 与 `HomeEventRow` 的 App 横向安全区、窄屏标题区、长文本和触控入口，不改变数据请求及摘要数量。
- [x] 4. 调整 `ActivityHighlights` 的 App 横向安全区及 `<360px` 单列、`>=360px` 双列、`>=768px` 三列断点，保留封面预览与详情导航。
- [x] 5. 调整 `EventRow` 与 `EventsSkeleton`，统一手机端紧凑媒体轨道、触屏分类可见性和长文本约束；验证虚拟列表估高与测量行为。
- [x] 6. 将 `EventDetailPage` 接入 `PageShell` 和 App 返回差异，并加强 `CommunityPostDetail` 的富文本宽度、触控链接和安全区约束。
- [x] 7. 修复现有 Events 无障碍与封面 E2E，新增 `events-mobile.spec.ts` 的 Web Pixel 7 流程和 `app-events.spec.ts` 的 App 首页、列表、详情及安全区流程。
- [x] 8. 运行格式化、静态检查、相关单元测试、Web 工作区完整检查和 `build:app`，修复本任务引入的问题。
- [x] 9. 运行 Web 桌面与移动端 Playwright，以及 App 五视口矩阵；显式保存截图，并核对横向溢出、左右安全区、固定导航、触控边界和延迟封面加载前后的 2px 布局稳定门槛。
- [x] 10. 运行 `pnpm run app:doctor`；工具链和设备可用时执行 iOS 与 Android 模拟器烟雾测试，分别记录原生结果。缺失的端必须报告具体阻塞条件并标记为未完成原生验证。
- [x] 11. 进行最终 Trellis 质量检查，确认没有触碰 API、后台管理、原生插件和其他并行任务改动。

## 预计修改文件

- `apps/web/app/pages/home/components/home-feed.tsx`
- `apps/web/app/pages/home/components/home-feed-items.tsx`
- `apps/web/app/pages/home/components/activity-highlights.tsx`
- `apps/web/app/pages/events/index.tsx`
- `apps/web/app/pages/events/components/events-list.tsx`
- `apps/web/app/pages/events/event-detail-page.tsx`
- `apps/web/app/components/editorial/community-post-detail.tsx`
- 对应的 `apps/web/tests/unit/**` 测试文件
- `apps/web/tests/e2e/events.accessibility.spec.ts`
- `apps/web/tests/e2e/activity-cover-preview.spec.ts`
- 新增 `apps/web/tests/e2e/events-mobile.spec.ts`
- 新增 `apps/web/tests/e2e/app-events.spec.ts`
- 共享详情组件或后台预览对应的 `apps/web/tests/unit/**` 回归测试

若实现期间发现共享组件已经具备所需能力，优先减少修改文件，不扩大到 `app.css`、路由清单或 Tauri 原生代码。

## 验证命令

```sh
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run check
pnpm --filter @imsweb/web run build:app
pnpm --filter @imsweb/web exec playwright test \
  tests/e2e/events.accessibility.spec.ts \
  tests/e2e/activity-cover-preview.spec.ts \
  tests/e2e/events-mobile.spec.ts \
  --project=chromium-desktop --project=chromium-mobile
pnpm --filter @imsweb/web run test:e2e:app -- tests/e2e/app-events.spec.ts
pnpm run app:doctor
pnpm run app ios
pnpm run app android
```

路由清单和所有权不在计划修改范围内，因此默认不运行 `test:web-routing`。若实现需要改动 `routes.ts`、预渲染配置或服务端回退规则，则追加该检查并回到设计阶段确认范围。

## 审查门槛

- 所有目标视口都满足无横向溢出、无重叠、无遮挡和安全区约束。
- Web 与 App 的首页到详情流程可用，App 不显示重复返回入口。
- 键盘焦点、触控目标、Axe 扫描和 reduced-motion 行为没有回归。
- 延迟封面加载前后，首屏前三个实载行的纵向位置与窗口滚动位置变化均不超过 2px；初次渲染、刷新和追加分页没有重叠或跳回。
- 桌面布局、API 调用数量、游标分页和缓存行为保持不变。

## 回滚点

1. 首页调整可独立回滚，不影响 `/events`。
2. 列表行和骨架需要作为一组回滚，避免再次出现加载与实载布局不一致。
3. 详情 `PageShell`、返回入口与富文本约束需要作为一组回滚。
4. 测试修复必须随对应产品行为一起回滚，不能恢复已失效的旧文案断言。
