# 根契约与治理迁移：技术设计

父任务 `design.md` §1（配置布局、不跨 workspace 聚合的理由）与 §3（自举顺序）是权威设计。本文件只补子任务特有决策。

## 根配置与 owner 的对应关系

根 `vitest.config.mts` 的 include 覆盖两个位置：`tests/**/*.test.{js,mjs,ts}` 与 `scripts/**/tests/**/*.test.mjs`。配置只描述「哪些文件是测试」，不描述「谁拥有它们」；owner 边界仍由 `run-test-owner.mjs` 的显式文件清单表达。

保持显式清单是有意选择。当前三个计划各自列出文件，`run-test-owner.test.mjs` 断言清单内容，这让「某个测试从 owner 计划里掉出去」变成可见的失败而不是静默漏测。改成目录 glob 会让这个保证消失，因此本子任务只是一对一替换 runner 调用，不改成 glob。

替换形状：

```
// 现在
command("governance Node contracts", "node", ["--experimental-strip-types", "--test", ...governanceNodeTests])
// 迁移后
command("governance Node contracts", "pnpm", ["exec", "vitest", "run", "--config", "vitest.config.mts", ...governanceNodeTests])
```

用 `pnpm exec vitest` 而不是 `node node_modules/.bin/vitest`，与仓库其他脚本调用风格一致；`--config` 显式给出根配置，避免从子目录调用时解析到别的配置。vitest 对显式文件参数的支持用于保持 owner 的显式清单语义。

Python 段不动，`governance` owner 因此是「Vitest 段 + Python 段」两段，命令标签保持现有文案以维持日志可比性。

## 自举顺序

`scripts/testing/tests/run-test-owner.test.mjs` 是被测对象（计划函数）的测试，同时自身要迁移。顺序：

1. 改 `run-test-owner.mjs` 的三个计划函数为 vitest 调用。
2. 该测试文件此时仍由 node:test 执行，先用现状 runner 跑一次，确认断言失败点就是预期的那几处。
3. 迁移该测试文件到 Vitest，并就地重写 plan 断言。
4. 用 Vitest 再跑一次，确认全绿。

不允许跳过第 2 步：它是「断言确实覆盖了被改动的形状」的证据，否则重写断言时容易把断言写松。

## runner 归属与边界规则

本域要跑 Vitest，但根 `package.json` 只能声明 `husky`（`scripts/check-workspace-boundaries.mjs:22` 的 `allowedRootDevDependencies`），且根 `node_modules` 下没有 vitest。

**已决定（2026-09-19）：选项 B，由 `apps/api` 宿主。** 治理规则不动，允许列表保持只有 `husky`。

- 配置：`scripts/testing/vitest/vitest.repository.config.mts`，已建，只能写成**不导入任何东西的普通对象导出**。
- 命令：`pnpm --filter @imsweb/api exec vitest run --root ../.. --config <仓库根>/scripts/testing/vitest/vitest.repository.config.mts <files…>`。
- `run-test-owner.mjs` 的 `governancePlan()` / `contractsPlan()` / `deliveryPlan()` 的三个 Node 段要把 cwd 从仓库根改成 `apiRoot`（runner 的 spawn 读 `step.cwd`，机制上支持）。

关键实测结论：配置文件里的 `import { defineConfig } from 'vitest/config'` 会**从配置文件自己所在的目录**向上找 `node_modules`。放在 `scripts/testing/vitest/`（或仓库根）的配置找不到 vitest，rolldown 报 `[UNRESOLVED_IMPORT] Could not resolve 'vitest/config'`，配 `--root ../..` 或绝对 `--config` 都一样；普通对象导出则退出码 0。选项 A（把 `vitest` 加进根允许列表）能让根配置写成与另两域一致的**类型化 `defineConfig`**，本次未采纳。

已实测的加载证据：CI=1 下这份配置被正确加载，`include` 打印为相对仓库根的两条模式，JUnit 报告写到仓库根 `reports/junit-repository.xml`（`suiteName="repository"`），且被 `.gitignore` 忽略。

代价（明确接受）：这一份配置拿不到类型检查与编辑器补全，三份配置里只有它长得不一样。跨域不漂移靠收口阶段的仓库级 reporting 不变量测试守住值层面的不变量，不靠配置写法一致。本域只需要 JUnit 与失败可见性，覆盖率门禁的实际价值在 API 与 Web 两域，本域不开覆盖率。

结论已写回父任务 design §8 第 1 条与 §1.1。`test:infra` 相关断言（`tests/test_operations_docs.py:120-122` 断言的是 `node scripts/testing/run-test-owner.mjs governance` 这个外层命令）两条路都不改这串字符串。

## 与 Python 断言的同步

`tests/test_workspace_boundaries.py:222-237` 的计数（root 57 / api 43 / web 21）与 `tests/test_operations_docs.py:120-122` 的字符串断言都在 Python 侧，不受 runner 迁移影响。只有在这两个条件之一成立时才需要改它们：脚本数量变化，或 `test:infra` 的命令字符串变化。本设计的替换不改变两者，所以预期零改动；如果实现期出现改动，必须在该提交说明里写明原因。
