# 统一 API 请求响应契约实施计划

## 任务结构

本父任务只维护需求、架构决策、研究证据、最终验收和发布判断。全部产品代码迁移收敛到一个执行子任务：

- `.trellis/tasks/09-06-unified-json-wire-contract-migration`

不再按业务域建立 Trellis 子任务。业务域只作为该子任务内部的并行 work package，由 Terra agents 在独立
worktree 中执行，最终由一个集成阶段顺序合并。

## 执行阶段

1. 完成父任务与唯一子任务的规划收敛、context manifests 和启动门禁。
2. 串行完成 contracts common、API schema validator、Web JSON parser、规则文档和 report-only inventory。
3. 通过基础层聚焦测试后，冻结共享文件所有权和迁移基线。
4. 在同一个子任务内并行执行 Backoffice/Admin、Wiki、Platform、Fudaba/Namecards、Content/Editorial、
   Delivery/Site Packages 六个 Terra work packages。
5. 按完成顺序审查并合并 worktree；全局 exports、root namespace、README、Web `admin.ts` 和门禁脚本由
   集成阶段统一处理，避免并行覆盖。
6. 清理剩余 API-local JSON interface、Web-local response schema/generic 和未解析 JSON opt-out。
7. 启用 fail-closed AST/type-aware 门禁，并运行全量验证。
8. 将每条 Acceptance Criterion 映射到文件和测试证据，完成父任务集成审查。

## 最低验证

基础层和每个业务 work package 合并后运行：

```sh
pnpm --filter @imsweb/contracts run build
pnpm run check:rules
pnpm run check:boundaries
python3 -m unittest tests/test_source_rules.py
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
```

业务批次聚焦门禁：

```sh
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run test:unit
```

最终发布门禁：

```sh
pnpm run check
pnpm run test
pnpm run test:web-routing
```

## 集成与回滚

- 每个 Terra worktree 必须形成独立 commit，记录修改范围和聚焦测试。
- 集成者逐个审查 commit，不做整批无条件合并。
- Schema、API adapter、Web parser 和对应测试作为一个业务回滚单元。
- 兼容 route、Cookie、CSRF、status 和错误文案不因回滚删除或改变。
- Fail-closed 门禁最后启用；若门禁误判，只回退其阻断开关，保留 contracts 迁移和报告。

## Stop-the-line 条件

出现以下任一情况时暂停并回写设计：

- 迁移改变既有 HTTP、Cookie、CSRF、redirect、unknown-key 或兼容行为。
- Response parse 仍可剥离 raw JSON 字段。
- API 非 request-validation 边界运行时加载 Zod。
- Web 在校验 shared error schema 前提取错误字段。
- 动态 route 只能通过目录级或通配豁免才能通过门禁。
- 两个并行 work packages 修改同一受保护共享文件。
- 聚焦测试无法证明完整 Wiki payload 或 editor 权限边界。

详细 agent 分批、文件所有权和验证命令由唯一子任务的 `design.md` 与 `implement.md` 维护。
