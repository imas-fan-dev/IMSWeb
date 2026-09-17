# 提交计划

用户已确认正常提交本任务待提交改动，按以下范围形成一个工作提交。已重新核对全部 85 个待提交文件，均属于本任务，没有范围外改动。不改写已有提交、不 amend、不 push；旋转组合问题保留为未解决，任务暂不归档，journal 不在本次操作范围内。

## 1. feat(web): redesign mobile namecard browsing

源代码：

- `apps/web/app/pages/community/community-cards-page.tsx`
- `apps/web/app/pages/community/components/namecard-thumbnail.tsx`
- `apps/web/app/pages/community/hooks/use-namecard-preview-navigation.ts`
- `apps/web/app/pages/community/hooks/use-namecard-preview-return.ts`
- `apps/web/app/pages/community/hooks/use-namecard-masonry.ts`
- `apps/web/app/components/shared/namecard-preview.tsx`
- `apps/web/app/layouts/app-layout.tsx`
- `apps/web/app/pages/community/components/namecard-reaction-emoji.tsx`
- `apps/web/app/pages/community/hooks/use-namecard-pagination-visibility.ts`

资产与许可：

- `apps/web/public/emoji/twemoji/` 中的 46 张原始 SVG、manifest、NOTICE 和完整图形许可
- `docs/governance/assets.md`
- `apps/web/README.md`

测试：

- `apps/web/tests/unit/pages/community/community-cards-page.test.tsx`
- `apps/web/tests/unit/pages/community/components/namecard-thumbnail.test.tsx`
- `apps/web/tests/unit/pages/community/hooks/use-namecard-preview-navigation.test.ts`
- `apps/web/tests/unit/pages/community/hooks/use-namecard-preview-return.test.ts`
- `apps/web/tests/unit/pages/community/hooks/use-namecard-masonry.test.tsx`
- `apps/web/tests/unit/components/shared/namecard-preview.test.tsx`
- `apps/web/tests/e2e/activity-cover-preview.spec.ts`
- `apps/web/tests/e2e/namecard-mobile-browsing.spec.ts`
- `apps/web/tests/e2e/app-namecard-browsing.spec.ts`
- `apps/web/tests/e2e/fixtures/namecard-browsing.ts`
- `apps/web/tests/unit/layouts/app-layout.test.tsx`
- `apps/web/tests/unit/pages/community/components/namecard-reaction-emoji.test.tsx`
- `apps/web/tests/unit/pages/community/hooks/use-namecard-pagination-visibility.test.tsx`

规范与任务记录：

- `.trellis/spec/web/frontend/components-and-ux.md`
- `.trellis/spec/web/frontend/index.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/task.json`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/prd.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/design.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/implement.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/implement.jsonl`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/check.jsonl`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/research/current-browsing.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/research/validation.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/research/device-delivery.md`
- `.trellis/tasks/09-05-card-mobile-browsing-redesign/research/commit-plan.md`

## 排除项

忽略目录中的截图、日志、XCTest 工程、构建输出和环境配置不进入提交。本计划不包含 API、契约、交换区或全局样式改动。R7/R8 的紧凑反应、分钟时间及其测试和规范纳入上述页面与组件范围。

本任务相关 54 项 Web、10 项 App 浏览器回归、982 项单测及生产构建通过；R7/R8 模拟器 Release 已更新，竖屏原生流程通过。旋转组合问题仍未解决，全量浏览器套件未重跑，真机仍为 R6。具体限制见 [验证记录](./validation.md)。
