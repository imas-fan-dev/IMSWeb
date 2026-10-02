# H 批：Web unit 二级 describe 归类报告

- 日期：2026-09-19
- Worktree：`/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy`
- 范围：`apps/web/tests/unit` 中「恰好一个顶层 describe，且其直接 `it` ≥10」的文件
- 归类规则：在顶层 describe 回调内，对一段**连续**、≥2 条用例共享的 ≥3 词**字面前缀**建二级 describe；标题为该前缀，用例标题去掉该前缀；不重排、不合并、不改断言与 hook

## 逐文件结果

| 文件 | it 数 | 二级 describe | 逐字保留 | 加前缀 | 失败 |
| --- | ---: | --- | ---: | ---: | ---: |
| `components/platform/platform-session-provider.test.tsx` | 10 | `does not let a profile update restore state during a deferred`（2：`reload` / `logout`） | 10/10 | 0 | 0 |
| `components/shared/theme-toggle.test.tsx` | 10 | `falls back to a fade when`（2）、`synchronizes Android system bars`（3） | 10/10 | 0 | 0 |
| `lib/geolocation.test.ts` | 13（源码）/ 16（执行，含 1 条 `it.each` 展开 3 条） | `does not request a position when`（2） | 16/16 | 0 | 0 |
| `mocks/data/fudaba.test.ts` | 15 | `builds a series`（2）、`builds a card`（2）、`builds an office`（3）、`builds an owner`（4） | 15/15 | 0 | 0 |
| `mocks/data/wiki.test.ts` | 21 | `builds a public`（6）、`builds a random`（2）、`builds an admin`（4）、`builds a story`（3） | 21/21 | 0 | 0 |

「逐字保留」= 归类前后的 `fullName` 列表逐字节相同（见下）；「加前缀」= 用例标题被改动的情况，均为 0。

## 未改动的 19 个文件

理由分布只有一种：文件内不存在任何「连续 ≥2 条用例共享 ≥3 词字面前缀」的片段。典型形态是用例首词各异（如 `app-navigation-provider.test.tsx` 的 19 条导航用例）、参数化或桩名驱动的组件用例（如 `community-post-detail.test.tsx`、`account-security-page.test.tsx`），以及端点契约用例（如 `lib/api/endpoints/wiki.test.ts`）。这些文件没有可提取的字面前缀，按规则保持原样，没有另造语义类别。

被排除的 3 个文件（`lib/api/api.test.ts`、`lib/api/media-urls.test.ts`、`lib/platform-oauth-deep-link.test.ts`）含 ≥10 的 describe，但文件内有多个顶层 describe，不符合「恰好一个」判据，未处理。清单见 `h-web-unit-census.md`。

## 名字无损证据

采集命令（只跑被改的 5 个文件）：

```
cd apps/web
VITE_IMS_APP_TARGET=web pnpm exec vitest run \
  tests/unit/components/platform/platform-session-provider.test.tsx \
  tests/unit/components/shared/theme-toggle.test.tsx \
  tests/unit/lib/geolocation.test.ts \
  tests/unit/mocks/data/fudaba.test.ts \
  tests/unit/mocks/data/wiki.test.ts \
  --reporter=json --outputFile=/tmp/web-unit-<phase>.json
```

- 归类前：退出码 0，5 文件 / 72 用例，`h-web-unit-before.txt`
- 归类后：退出码 0，5 文件 / 72 用例，`h-web-unit-after.txt`
- `diff before after`：无输出（逐字节一致）
- 用例数：72 → 72
- 失败状态：0

Vitest JSON reporter 的 `fullName` 把 describe 路径与用例标题用空格拼接。因为二级 describe 的标题正是从用例标题里切出的前缀，拼接后的 `fullName` 与归类前完全相同，所以「旧全名是新全名的字面尾段」按最强形式成立（相等）。

## 最终一次运行

```
cd apps/web
VITE_IMS_APP_TARGET=web pnpm exec vitest run \
  tests/unit/components/platform/platform-session-provider.test.tsx \
  tests/unit/components/shared/theme-toggle.test.tsx \
  tests/unit/lib/geolocation.test.ts \
  tests/unit/mocks/data/fudaba.test.ts \
  tests/unit/mocks/data/wiki.test.ts
```

退出码 0。输出：`Test Files 5 passed (5)`、`Tests 72 passed (72)`。

## 偏离与说明

- 没有引入任何 import 改动：5 个文件都已从 `vitest` 具名导入 `describe`。
- `apps/web/.prettierignore` 的 `data/` 规则覆盖了 `tests/unit/mocks/data/**`，prettier 不处理这两个文件，缩进按周围风格手工补齐；另外 3 个文件跑了 `pnpm exec prettier --write`，只有被包进二级 describe 的行发生缩进与折行变化。
- `lib/geolocation.test.ts` 归类后顶层直接 `it` 仍为 11 条（≥10）。该文件只有一段连续共享前缀（2 条），按规则只能加这一组；其余单条留在顶层，未发明新类别。
- 未运行整域 `pnpm --filter @imsweb/web run test:unit`、`typecheck` 或 `pnpm run check`，遵守本批并行施工的约束。
