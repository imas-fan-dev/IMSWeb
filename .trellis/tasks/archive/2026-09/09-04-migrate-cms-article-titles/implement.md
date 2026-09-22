# CMS 文章标题回填执行计划

## 实现清单

- [x] 在 `apps/api/scripts/migration/cms-article-title-backfill.ts` 定义参数、报告和数据库行类型。
- [x] 实现并导出标题拆分纯函数，覆盖开头匹配、空标题、未闭合、中间括号、多个括号和边界空白。
- [x] 实现并导出纯文本 TipTap 段落构造及正文前置函数，用 `hardBreak` 保留换行，并复用正文校验和 HTML 渲染。
- [x] 实现扫描和计划函数，统计未匹配、候选与转换错误，不按来源或内容类型过滤。
- [x] 实现默认 dry-run、`--apply`、`--report` 和 `--help`，拒绝未知或缺值参数。
- [x] 实现 `0600` 报告的临时文件写入与原子 rename，stdout 仅输出摘要。
- [x] 使用 `parseNodeDatabaseConfig` 和 `PostgresConnection` 管理 CLI 数据库生命周期。
- [x] 实现 apply 整批事务、advisory lock、`FOR UPDATE`、原值比较、revision 增加和 `updated_at` 刷新。
- [x] 在同一事务内同步关联 `events.title`；冲突、转换错误或 SQL 失败时回滚整批操作。
- [x] 在 `apps/api/package.json` 注册 `migration:cms-article-titles` 并把测试加入 `test:migration`。
- [x] 在 `apps/api/tests/migration/cms-article-title-backfill.test.js` 添加纯函数、参数和报告行为测试。
- [x] 使用 PostgreSQL harness 测试 dry-run、所有文章类型、空正文、已有正文前置、关联活动同步、第二次 apply、冲突和中途失败回滚。

## 验证命令

```sh
pnpm run dev:doctor
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
pnpm --filter @imsweb/api run test:migration
pnpm --filter @imsweb/api run check
pnpm run check:rules
```

在受控本地数据库上额外验证 CLI；不对共享或生产数据库运行 `--apply`：

```sh
pnpm --filter @imsweb/api run migration:cms-article-titles -- --report data/migration/cms-article-title-backfill-local-dry-run.json
pnpm --filter @imsweb/api run migration:cms-article-titles -- --apply --report data/migration/cms-article-title-backfill-local-apply.json
pnpm --filter @imsweb/api run migration:cms-article-titles -- --apply --report data/migration/cms-article-title-backfill-local-repeat.json
```

## 执行证据

- `pnpm run dev:doctor` 确认 Node、pnpm、workspace 依赖、容器运行时和 Compose 配置可用；只因现有本地 Podman Valkey 已占用 `6379` 而返回非零。PostgreSQL 由同一 Podman 环境监听 `5432`。
- 本地 dry-run 扫描 20 条文章，得到 9 条候选、11 条未匹配、0 个错误；其中 7 条需要前置正文，2 条只更新标题。
- apply 前备份写入 `data/migration/cms-article-title-backfill-local-pre-apply.dump`，大小 5,097,085 字节，权限 `0600`，SHA-256 为 `2ade97d3a49cdfe685209727311f5ef6cb3a56fa32b53bc1f963f6827f374422`。
- 首次本地 apply 更新 9 条，0 冲突、0 错误。逐条回读标题、`body_json`、`body_html`、revision 和关联活动标题，所有不一致计数均为 0。
- 第二次本地 apply 候选 0、更新 0、冲突 0、错误 0，证明脚本可重复执行。
- 专项测试 9/9 通过；完整 API migration 套件 111/111 通过，0 失败、0 跳过。
- API typecheck、architecture、完整 `check`、根 `check:rules` 和 `git diff --check` 全部通过。
- pnpm 检查持续提示现有 `node_modules` 与 lockfile 不同步，但没有导致验证失败。

## 风险与回滚点

- 修改 `apps/api/package.json` 的手工测试列表时，确认新测试实际由 `test:migration` 执行。
- 正文转换前后都调用现有正文校验；如果历史正文结构无效，apply 必须在写入前中止。
- 事务内任一行更新数不符合预期时抛出冲突并回滚，不能继续提交剩余行。
- 报告只写入被 Git 忽略的 `data/migration/`，不得暂存或提交生产数据。
- 生产 apply 前建立数据库备份并保存 dry-run 报告。需要撤销时从备份恢复，或根据 apply 报告中的执行前值制定受审查的恢复操作。

## 完成门槛

- [x] PRD 中每条验收标准都有对应自动化测试或明确的命令证据。
- [x] PostgreSQL 集成测试证明没有部分提交、不会重复前置正文，并同步活动兼容标题。
- [x] typecheck、architecture、migration tests、API check 和规则检查全部通过。
- [x] 最终 diff 不包含 `data/` 报告、数据库、凭据或无关格式化改动。
