# 迁移前基线（node:test / Python unittest / Vitest-Web）

采集时间：2026-09-19
分支：`chore/vitest-test-unification`（worktree `.worktrees/vitest-test-unification`）
基点提交：`bedb2b7debb03a2eb756580a833ef85c4a5c4b8a`
运行时：Node `v24.18.0`、pnpm `11.10.0`
环境：未设 `CI`；PostgreSQL 可达 `127.0.0.1:5432`，`IMS_TEST_POSTGRES_ENABLED` 走默认启用
原始日志：`/tmp/imsweb-vitest-baseline/<domain>.log`（不入库）

## 采集命令

顺序执行，逐段 tee 到日志：

```
node scripts/testing/run-test-owner.mjs governance
node scripts/testing/run-test-owner.mjs contracts
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/api run test
```

## 结果

| 域 / 段 | runner | 用例数 | 跳过 | 失败 | 耗时 |
| --- | --- | --- | --- | --- | --- |
| governance: 3 个 Node 契约测试 | node:test | 58 | 0 | 0 | 约 0.7s |
| governance: 9 个 Python unittest 文件 | unittest | 123 | 0 | 0 | 160.3s |
| contracts: non-json-boundaries + 2 个编译产物流水线 | node:test | 29 | 0 | 0 | 4.4s |
| web: tests/unit | Vitest 4.1.11 | 1532（220 文件） | 0 | 0 | 82.0s |
| api: 顶层契约测试（5 文件） | node:test | 74 | 0 | 0 | 5.8s |
| api: tests/server | node:test | 627 | 0 | 0 | 30.6s |
| api: tests/wiki | node:test | 60 | 0 | 0 | 1.1s |
| api: tests/migration | node:test | 114 | 0 | 0 | 4.0s |

汇总：node:test 侧 962 例（58 + 29 + 74 + 627 + 60 + 114），Vitest-Web 侧 1532 例，Python 侧 123 例，全部通过、无跳过。四个 run-test-owner 域总墙钟 297s（governance 161 + contracts 5 + web 84 + api 47）。

需要迁移到 Vitest 的是 node:test 侧的 962 例。仓库级 9 个 node:test 文件按 owner 分布如下（名字摘自 `scripts/testing/run-test-owner.mjs` 的显式清单）：

| 域 | 文件 | 本表里的用例数 |
| --- | --- | --- |
| governance | `tests/development-environment.test.js`、`tests/ci-affected-workspaces.test.js`、`scripts/testing/tests/run-test-owner.test.mjs` | 58 |
| contracts | `tests/contracts/non-json-boundaries.test.mjs`、`scripts/contracts/tests/compile-route-inventory.test.mjs`、`scripts/contracts/tests/compile-frontend-route-metadata.test.mjs` | 29 |
| delivery（root profile） | `tests/exchange-map-assets.test.js`、`tests/tauri-build-configuration.test.js`、`tests/tauri-device-delivery.test.js` | **未采集** |
| api | `tests/hono-app-contract.test.js`、`tests/node-listener-probe.test.js`、`tests/node-security.test.js`、`tests/operation-scripts.test.js`、`tests/postgres-test-lifecycle.test.js` | 74 |

采集缺口：上面四个命令里没有 `run-test-owner.mjs delivery root`，所以 delivery 域那 3 个文件（外加同 profile 的 Python `tests/test_public_assets.py`）没有基线数字。补采命令是 `node scripts/testing/run-test-owner.mjs delivery root`，量小，在批次前补上。

## 备注与后续补充

- Web 这次是用**已改过的** `apps/web/vitest.config.ts` 跑的（新增 reporter 与 coverage，`enabled: false` 且未设 `CI`），因此输出形状与改动前一致；1532 这个数字可以当作迁移前基线。
- PostgreSQL 本机默认为启用，所以 `tests/server` 的 627 例里包含真实连库用例，跳过数为 0。禁用路径已补采（`IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test`，日志 `/tmp/imsweb-vitest-baseline/api-postgres-disabled.log`）：

| api 段 | 总数 | 通过 | 跳过 |
| --- | --- | --- | --- |
| 顶层契约测试（5 文件） | 74 | 38 | 36 |
| tests/server | 627 | 460 | 167 |
| tests/wiki | 60 | 60 | 0 |
| tests/migration | 114 | 99 | 15 |
| 合计 | 875 | 597 | 218 |

  跳过数量必须迁移后一致（218）。注意跳过原因字符串在 node:test 的 spec reporter 里不显示，只输出 `﹣ <用例名> (<ms>) # SKIP`；`ctx.skip(reason)` 在 Vitest 下会把原因渲进去，所以验收对比口径是**数量**而不是原因渲染文本。
- governance 的 160s 几乎全部来自 Python unittest，这段在迁移中不动，不要拿它衡量 Vitest 的收益。
- 迁移后逐段对比口径：用例数不减、跳过数一致、失败数为 0；耗时只记录不设门禁（`pool: 'forks'` 与覆盖率的额外开销会体现在这里）。
