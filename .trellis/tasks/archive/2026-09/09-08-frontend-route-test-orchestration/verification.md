# 前端路由与测试编排验证

Date: 2026-09-09

## 实现结果

- `apps/web/app/route-metadata.ts` 是 route path、page module、target、prerender 和 delivery mode 的规范来源；`routes.ts` 与 `react-router.config.ts` 从该来源派生。
- 八个 work slug 由 `apps/web/app/pages/works/work-slugs.ts` 统一提供。
- API 只消费生成的 `frontend-route-delivery.ts`；敏感路径、URL decode、SPA fallback 和 404 算法仍由 API policy 所有。
- 生成器提供 check/write 模式，拒绝缺失、额外、重复或 `segmentCount` 错误的 SPA pattern。生成结果按 descriptor 顺序稳定输出。
- 测试按 governance、contracts、API、Web 和 delivery owner 执行。root runner 在同一进程内证明构建完成后才进入 prepared API 阶段；外部 `--prepared` 和 `--unit-prepared` 均失败关闭。
- integration CI 继续独立构建 Web 与 API，没有引入跨 job artifact 假设。

## 独立审查修复

- 删除第二份手写 SPA pattern 清单，改为从 descriptor 推导精确集合。
- source、generated artifact 或 checker 缺失/损坏时，`check-source-rules` 均失败关闭。
- generator CLI 使用 realpath 比较入口，兼容 macOS `/var` 与 `/private/var`，普通 import 不执行 CLI。
- metadata 与生成导出均冻结；Web/App 测试比较完整 path、id、nesting 与 module。
- runner 不再信任任意既有 API dist 或未证明的 Web unit 结果，并保留子进程 cwd、环境、退出码和终止信号。

## 基线与行为

- Web/App route leaves：50 / 31。
- Web/App prerenders：30 / 28。
- SPA patterns：6。
- root/API/Web script 数：55 / 41 / 20；没有 `test:all`。
- `/community/cards/submissions/:id`、`/packages/:siteSlug`、未知或未策展 `/works/:workSlug` 继续由 API 返回 404，不进入 SPA fallback。
- route inventory 保持 315 registrations、230 request-consuming routes、306 carriers、608 responses。

## 验证

- generator 与 owner 单测：16 passed。
- source-rule fixtures：26 passed。
- Web/App route unit：6 passed。
- 编译后 API frontend routing contract：6 passed。
- `pnpm run test:infra`：governance Node 57、Python 106、contracts 29、delivery Node 16、public assets 2，全部通过。
- `pnpm run test`：API 711 passed；Web unit 1,032 passed；所有 root owner 阶段通过。
- `pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0`：252 passed、24 expected skips、0 failed，共 276 instances。
- `pnpm run check`：通过；client asset scan 覆盖 2,400 个构建文件。
- API/Web typecheck、build、lint、Hono architecture、rules、boundaries、contracts entrypoints、LSP diagnostics 和 `git diff --check`：通过。

一次使用 package script 加额外 `--` 的 Playwright 调用没有实际限制 worker，出现资源竞争型超时；该结果未作为验收证据。上面的直接 Playwright CLI 命令以一个 worker、零重试完成，是本任务的有效浏览器验收。

## 提交

- 测试 owner 与编排：`2980d9f6`、`1218ea48`。
- route metadata、生成器与审查修复：`92d6d376`、`2813a499`、`25993da1`、`f79b740d`。
- 跨分支 owner 接线与回归稳定：`73903fe9`。
