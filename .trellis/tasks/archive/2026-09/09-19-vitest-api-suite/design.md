# API 测试套件迁移：技术设计

父任务 `design.md` 的 §2（模块解析、进程模型、生命周期映射、类型门禁、脚本替换）是本子任务的权威设计，不在此重复。本文件只补子任务特有的决策与批次边界。

## 配置归属

`apps/api/vitest.config.mts` 由父任务阶段 1 创建，本子任务只消费它。该路径本身被治理规则锁住：`scripts/check-workspace-boundaries.mjs:557-572` 把 `apps/api/vitest.config.mts` 列入 retired Cloudflare Worker 措面清单，不移除这一条则 `pnpm run check:boundaries` 会失败（实测）。文件名也不能改成 `.ts`：`apps/api/package.json` 是 `"type": "commonjs"`，`.ts` 配置会以 CJS 语义加载，而 `require('vitest')` 在 4.1.11 直接抛错。因此子任务 1 的前置包含一项治理决定，不是纯机械前置。

在父任务阶段 1 完成后，本子任务在批次 A 验证这四项：

1. `@` alias 解析到 `apps/api/src`（`postgres-test-database.ts` 与 `postgres-harness.ts` 依赖 `@/infra/db/postgresql/connection`）。
2. ESM 测试能具名 import CJS helper（`tests/contracts/runtime-contracts.js`、`tests/postgres-test-lifecycle.js`）。失败则 helper 改名 `.mjs` 并同步 `.d.ts` 与引用路径。
3. `tests/**/*.test.{ts,js}` 的 include 不误收 helper（`postgres-test-lifecycle.js`、`runtime-contracts.js`、`fixtures/*` 都不是 `*.test.*`，天然排除）。
4. `maxWorkers` 在真实 PG 下的稳定性（建库吞吐、allocator `maxConnections: 4`、drain 5 秒窗口）。

## 生命周期改写的形状

目标形状（两个包装器同构）：

```ts
// tests/server/postgres-test-database.ts
export function postgresTest(name: string, body: () => void | Promise<void>): void {
    const enabled = postgresIntegrationEnabled();
    test(name, async (ctx) => {
        if (!enabled) {
            ctx.skip(postgresIntegrationSkipReason() || DISABLED_REASON);
            return;
        }
        await body();
    });
}

export async function createPostgresTestDatabase(label: string): Promise<PostgresConnection> {
    const database = await getSharedPostgresTestAllocator().allocate({ label });
    onTestFinished(() => database.close());   // 替代 t.after
    // …其余逻辑不变：失败时 AggregateError 聚合、WeakMap 记账、连接幂等关闭
}
```

要点：

- 跳过语义从「`nodeTest.skip` 声明的测试」变成「声明后由 `ctx.skip(reason)` 跳过」，报告里仍是 skipped 且带共享 reason。批次 A 必须同时验证启用与禁用两条路径的计数。
- `onTestFinished` 在包装器内、body 前注册，语义等价于 `t.after`：按注册逆序、在下一个用例前执行。已被探针验证。
- `closeSharedPostgresTestAllocator()` 的模块级 `after` 移到 runner 归属方：Vitest 适配器用 `afterAll`，仍跑 node:test 的 4 个 migration 文件用各自的 `after`。runner 中立的 harness 模块不再承担它——理由见文末「runner 归属带来的批次划分」。
- 显式 close 适配器 `tests/integration/postgres-harness.ts` 保留 `close()` 由调用方负责的语义，不把它的清理偷偷搬进 `onTestFinished`。
- 核心 `postgres-test-lifecycle.js` 不改行为；它导出的 `resolvePostgresTestConfig` / `assertSafePostgresTestDatabaseName` 等纯函数在 Vitest 下继续被生命周期自身测试直接调用。

## 批次边界

| 批次 | 范围 | 独立回滚 | 收口证据 |
| --- | --- | --- | --- |
| A | 两个包装器 + `tests/postgres-test-lifecycle.test.js` | 是 | PG 启用与禁用两条路径计数；生命周期契约全绿 |
| B | `tests/server/`（102） | 是 | server 计数比对 + typecheck |
| C | `tests/wiki/`（7） | 是 | wiki 计数比对 |
| D | `tests/migration/`（18） | 是 | migration 计数比对 |
| E | `tests/assets/`（2）+ 顶层 5 | 是 | assets 与顶层计数比对 |
| F | 脚本、typecheck、owner plan、owner 测试 | 是（需成对回滚） | 全 owner 绿 |

批次之间不做交错提交：每批的 `verification.md` 记录迁移前后的 file/test/skip 与失败集合。

## node:test → Vitest 的逐类映射

| node:test | Vitest | 判定要点 |
| --- | --- | --- |
| `test` / `it` | `test` / `it` | 直接对应 |
| `describe` | `describe` | 直接对应 |
| `t.after` | `onTestFinished` | 逆序、下一个用例前执行 |
| `t.before/after`（套件级） | `beforeAll` / `afterAll` | 注意 `postgres-harness` 的模块级 after |
| `t.mock.fn` / `t.mock.method` | `vi.fn` / `vi.spyOn` | 校验调用计数与参数断言等价 |
| `t.mock.timers` | `vi.useFakeTimers` / `vi.advanceTimersByTime` | 注意 `restoreMocks`/`unstubGlobals` 与 web 配置对齐 |
| `t.diagnostic` | `ctx.task.meta` 或结构化输出 | 不得静默丢弃诊断信息 |
| `t.test` 子测试 | `test` 嵌套或 `describe` | 保持失败定位能力 |
| `assert.*`（`node:assert/strict`） | 保留原样 | 本迁移不改断言语汇，减少口径变化 |
| `nodeTest` 别名 | `test` | 机械替换，去掉别名以减少噪音 |

断言保持 `node:assert/strict` 是有意选择：迁移期把 runner 与断言语汇一起换，会让「计数差异」与「断言差异」两类问题混在一起，难以定位。断言语汇的收敛不在本任务范围。

## 待实现期确认

- CJS helper 具名导出 interop 的实际结果（决定 3 个 helper 是否改名）。
- `maxWorkers` 的安全值，以及是否需要按 label 分组降并发。
- 顶层 5 文件与 `tests/assets` 是否与 `tests/server` 共用一个进程池仍稳定。

## runner 归属带来的批次划分（2026-09-19 实测）

原计划把「生命周期与包装器」当作独立批次 A，实测后不成立，三条硬约束：

1. **目录级原子性**：`test:server` 是 `node --test tests/server/*.test.ts`（一个 glob），`test:wiki` 与 `test:migration` 同理。同目录里存在一个 `import 'vitest'` 的文件，`node --test` 就会在加载阶段失败；反向地，未迁移的 node:test 文件被 Vitest 收集时显示 `0 test` 并通过，属于静默漏测。因此「哪一目录跑哪个 runner」必须整个目录一起切。
2. **共享 helper 的consumer 分布**（已逐个文件确认）：`tests/integration/postgres-harness.ts` 被 21 个文件导入——17 个在 `tests/server`，4 个在 `tests/migration`；`tests/server/postgres-test-database.ts` 的 17 个导入者全在 `tests/server`；`postgresTest` 共出现在 34 个文件里，4 个 migration 文件都不用它（它们只用 `createPostgresTestHarness()`，本来就是 t-free 的显式 close 形状）。
3. **跨 runner 模块不能静态 import vitest**：只要还有 node:test 文件导入 harness 模块，该模块就不能 `import { test } from 'vitest'`（在 node:test 进程里加载 vitest 入口会报错）。

由此得到的形状：harness 模块降为 runner 中立的 `createPostgresTestHarness`（不导出 `postgresTest`，不注册 allocator 收尾钩子，不 import 任何 runner）；`postgresTest` 与两个连接工厂只住在 Vitest 适配器 `tests/server/postgres-test-database.ts`；allocator 收尾钩子由 runner 归属方各自注册（Vitest 适配器 `afterAll`，4 个 migration 文件在窗口期用 node:test 的 `after`，它们迁到 Vitest 时改为 `afterAll`）。因此批次顺序是 `tests/server` → `tests/wiki` → `tests/migration` → 顶层与 `tests/assets` → 收口，且 `tests/server` 一批就是 102 个文件。

## 被测 CJS 脚本 `require` TypeScript 源码（批次 C 实测）

迁移到 Vitest 后出现一个新失败面：3 个 migration 测试加载的是 CJS 脚本（`scripts/migration/*.js`），而这些脚本在模块顶层或惰性路径上 `require('....ts')`。旧 runner 用 `node --import tsx --test`，tsx 的 require 钩子能直接加载 `.ts`；Vitest 把内联 CJS 文件自己的 `require` 交给 native Node（Vitest 只接管 `import`/`export` 的转换），而 `apps/api` 是 `"type": "commonjs"` 包，Node 24 无法从这种包里 `require` ESM 格式的 `.ts`（`SyntaxError: Cannot use import statement outside a module`）。

定案：需要它的那 3 个文件顶部写 `import 'tsx/cjs';`，并写明两个事实——生产命令本来就跑在 tsx 加载器下（`migration:fudaba-media`、`migration:object-keys` 等脚本里写着 `--import tsx`），而这里注册的是同一个钩子。不采用两个全局方案：`poolOptions.forks.execArgv` 会在每个 worker 里装上连测试都不需要的 tsx ESM 加载器，`setupFiles` 里的全局钩子会把加载器强加给其余 600+ 个用例；把一个加载器收在真正需要它的测试文件里更窄也更好解释。后续批次（顶层 `tests/operation-scripts.test.js` 等同样加载 CJS 脚本）遇到同一症状时沿用这个做法，不自创第二种。
