# 桌面端社区与推荐双列布局实施计划

## Preconditions

- 阅读 `apps/web/.rules`、`apps/web/DESIGN.md`、相关主题样式、前端组件与测试规范。
- 阅读社区动态、推荐页及其现有单元和浏览器测试，确认加载、错误、空态、分页、刷新与 App 分支的当前行为。
- 在开始产品代码前，确认仓库没有已存在的响应式媒体查询 Hook；若无，以最小实现添加一个可在浏览器与测试环境中安全订阅 `lg` 断点的逻辑。

## Implementation checklist

- [ ] 新增共享公共列表标题组件，封装非 App 目标的全宽标题带和统一内层容器；通过 props 接收 eyebrow、标题、说明与右侧操作，不管理页面状态。
- [ ] 调整社区动态页：桌面使用共享标题组件与 `max-w-7xl` 内容宽度；按 1 或 2 个项目构建虚拟行，正确映射行 key、测量、项目序号、刷新、加载和奇数尾项。
- [ ] 调整推荐页：使用同一标题组件和相同容器宽度；按相同列数策略构建虚拟行，并保留现有缓存、刷新、加载和链接行为。
- [ ] 调整两个骨架列表，在 `lg` 使用双列、在较小视口使用单列，同时维持加载态的稳定高度和边框层次。
- [ ] 更新单元测试的虚拟器替身，使它从传入的行数和估算值推导总尺寸与虚拟项目；新增双列打包、最后奇数项、角色/位置语义和断点回退覆盖。
- [ ] 新增或扩展公共列表桌面 Playwright 覆盖：断言两个页面在桌面为两列、标题区几何一致、无横向溢出；保留并运行现有移动与 App 覆盖以证明单列不变。

## Validation

1. `pnpm --filter @imsweb/web run format`
2. `pnpm --filter @imsweb/web run lint`
3. `pnpm --filter @imsweb/web run typecheck`
4. 运行受影响的 Events 和 Recommendations Vitest 文件。
5. 运行受影响的 Playwright 桌面、移动和 App 规格；不使用固定等待，继续使用自动 API fixture。
6. 在桌面和移动视口检查截图、标题区边界、相邻行、底部加载区和 `document.documentElement.scrollWidth === window.innerWidth`。
7. `pnpm --filter @imsweb/web run build`

## Review and rollback gates

- 代码评审确认公共标题组件没有把页面数据、网络或 App 行为移出页面所有权。
- 审查虚拟器按虚拟行而非原始条目计数，且 `measureElement`、`data-index`、行 key 与无障碍序号保持一致。
- 若出现滚动定位、分页追加或 `lg` 断点切换异常，先回退到单列虚拟行映射并保留标题统一改动，再单独修复双列虚拟化。
