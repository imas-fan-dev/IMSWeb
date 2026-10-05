# 执行计划

- [x] 加载规则、开发环境、规范、相邻代码与测试；记录根因及官方 provider 文档。
- [x] 完成规划与 curated manifests，validate/start 当前任务。
- [x] 修复共享显式搜索 UI 与事务所 Enter 行为；加入地图结果选择、临时标记与重定位。
- [x] 调整最小只读搜索策略，修复 Compose provider 环境转发，增加认证/缓存/限流/隐私回归。
- [x] 执行 API 专属检查和真实 provider 应用端点验证；完成 focused unit、typecheck、lint、Web/App build、桌面/移动及 App Playwright。
- [x] 更新独立地图规范和 acceptance/verification，报告确切修改与主会话最终审核范围；未 stage/commit/archive/push。

验证命令：`pnpm --filter @imsweb/api run typecheck`、`pnpm --filter @imsweb/api run check:architecture`、`pnpm --filter @imsweb/api exec vitest run tests/server/fudaba.test.ts`；Web focused unit 使用 `tests/unit/pages/community/exchange` 受影响文件及 endpoint 测试，Playwright 使用地图与事务所 spec，独立端口及输出目录。根规则/边界和配置 passthrough 回归在实现后执行。
