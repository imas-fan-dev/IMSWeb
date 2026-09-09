# 全项目测试治理收敛：实施计划

## 0. 启动前检查

- [x] 汇总研究报告并关闭所有代码可回答的问题。
- [x] 确认生产和测试R2资源、认证身份边界、候选策略和回滚方式。
- [x] 为六个子任务写完PRD、design和implement。
- [x] 配置父子任务的`implement.jsonl`与`check.jsonl`。
- [x] 重新运行`task.py validate`和规划门禁，向用户提交更新后的最终规划摘要并取得实施批准。

## 1. PostgreSQL 测试生命周期

- [x] 为当前启用条件、URL 安全校验、数据库隔离和清理行为添加回归。
- [x] 建立共享 PostgreSQL test lifecycle 核心。
- [x] 让 `TestContext` 自动清理和手动 harness 通过薄适配器使用共享核心。
- [x] 迁移全部调用方并删除重复生命周期实现。
- [x] 运行所有 PostgreSQL repository、migration 和 integration 测试。
- [x] 独立审查并提交；保留可单独 revert 的检查点。

## 2. API 测试辅助层

- [x] 盘点重复 JSON、认证、CSRF、cookie 和迁移 fixture 的调用方与差异。
- [x] 先提取有共同业务语义的最小 helper，并添加负向或行为回归。
- [x] 按领域迁移调用方，保留业务专用断言。
- [x] 删除已无调用的重复实现和 fixture。
- [x] 运行受影响领域测试、API typecheck、architecture、rules 和 boundaries。
- [x] 独立审查并提交。

## 3. Web Playwright dispatcher

- [x] 为未注册 API、错误 method/path 和无效 response schema 添加失败用例。
- [x] 实现 contracts 驱动的严格 dispatcher 和命名 pass-through。
- [x] 先迁移共享 Backoffice/Platform auth fixture。
- [x] 再迁移 Editorial、Homepage、Namecard 和其余高重复 fixture。
- [x] 清除直接 `page.route("**/api...` 的重复路径，仅保留经审查的特殊边界。
- [x] 分领域运行 Chromium 子集，再运行 CI 模式完整矩阵。
- [x] 修复 CI 暴露的 seeded-content 代理依赖和 App 刷新几何同步问题。
- [x] 独立审查并提交。

## 4. 路由元数据、目录和脚本编排

- [x] 确定当前所有前端路由清单及消费者，建立单一规范化来源。
- [x] 迁移 prerender、fallback 和路由测试消费者；导航/权限继续作为经审查的 curated model，不作为完整路由清单。
- [x] 建立测试 taxonomy 和单一执行 owner 映射。
- [x] 添加新脚本入口并更新 CI、文档与治理测试。
- [x] 移动测试目录时保持名称和断言，修复聚合器与路径引用。
- [x] 删除重复构建或重复执行的旧编排。
- [x] 运行 affected-workspace、script-surface、routing 和全量 workspace 门禁。
- [x] 独立审查并提交。

## 5. Node、Platform 与 route inventory

- [x] 建立 `node-security` 当前断言到现有 owner 的逐项映射。
- [x] 拆分 owner 前补齐非 JSON listener/shared-adapter 证据；未证明完全等价的断言不删除。
- [x] 把 Platform 测试移动到对应所有者并更新聚合入口。
- [x] 将 route inventory 收敛为单一机器可读权威产物。
- [x] 改为按需生成 Markdown，并更新 freshness、文档和治理测试。
- [x] 验证生成前后语义 totals 与 route-level reconciliation 完全一致。
- [x] 独立审查并提交。

## 6. R2 字体 CORS

### 6.1 测试桶

- [ ] 保存`imsweb-media-public-test`完整CORS快照和变更前响应证据。
- [ ] 应用候选策略，完成控制面readback和已授权测试字体/PNG精确URL cache purge；当前OAuth请求返回`10000 Authentication error`，已回滚。
- [ ] 通过HTTP正反样例和隔离三浏览器`document.fonts.load()`验证测试域字体。
- [ ] 运行测试桶资产/range回归；失败时恢复测试桶快照。
- [ ] 记录测试证据并停止远端操作，申请独立生产授权。

### 6.2 生产桶

- [ ] 获得新的生产桶更新授权；测试桶授权不可复用。
- [ ] 保存生产完整CORS快照，应用同一候选策略并完成readback和HTTP正反验证。
- [ ] 必要时只purge生产字体URL，通过三浏览器验证生产页面字体。
- [ ] 生产验证成功后移除对应Playwright `fixme`并更新资产验收和文档。
- [ ] 记录生产远端变更、回滚内容和验证证据。

## 7. 最终集成

- [ ] 运行 `pnpm --filter @imsweb/api run check`。
- [ ] 运行 `pnpm --filter @imsweb/api run test`。
- [ ] 运行 `pnpm --filter @imsweb/web run check`。
- [ ] 运行普通 Web Playwright CI 模式完整矩阵。
- [ ] 运行 `pnpm run check`。
- [ ] 运行 `pnpm run test`。
- [ ] 运行 `pnpm run check:pre-commit` 与 `git diff --check`。
- [ ] 运行 `lens_diagnostics mode=all`，处理所有阻塞错误。
- [ ] 更新 Trellis spec、研究证据和父子验收映射。
- [ ] 确认工作区干净、提交已推送且远端 CI 可观察。

## 风险与回滚点

- PostgreSQL 生命周期：共享核心建立和调用方迁移分开提交，迁移失败时保留旧适配器。
- Playwright dispatcher：按领域迁移；完整矩阵未绿时不启用全局 fail-closed。
- 路由和脚本：新旧入口短暂并存，消费者全部切换后才删除旧入口。
- inventory：机器产物 totals 或 route-level 对账变化时停止删除 Markdown。
- R2：测试桶与生产桶分开授权、快照、验证和回滚；测试成功后必须暂停，不能自动进入生产。
