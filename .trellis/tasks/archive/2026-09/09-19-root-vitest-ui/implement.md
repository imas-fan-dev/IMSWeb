# 实施计划：根级 Vitest UI

## 1. 基线

- [x] 1.1 记录当前根脚本数 57、根 devDependencies 只有 `husky`、根无 `node_modules/.bin/vitest`
- [x] 1.2 记录三域单域运行计数：API `pnpm --filter @imsweb/api run test`（134 文件 / 884 用例；CI API
  lane 带 `--exclude tests/assets/**` 时为 132 / 874）、Web `pnpm --filter @imsweb/web run test:unit`
  （220 / 1534）、仓库域 governance 5 文件 / 70 用例 + Python `Ran 123 tests`、contracts 3 / 29、
  delivery root 3 / 27、delivery repository 1 / 6

## 2. 依赖

- [x] 2.1 根 `package.json` 加 `vitest ^4.1.11`、`@vitest/ui 4.1.11`、脚本 `test:ui`
- [x] 2.2 `pnpm install`（非 frozen 这一次以更新 lockfile），根 `node_modules/.bin/vitest` 存在
- [x] 2.3 只新增这两个包及其传递依赖（`@polka/url`、`sirv`、`mrmime`、`totalist`），另有两处既有
  peer 后缀多出 `@vitest/ui`；无版本升级。收尾时 `pnpm install --frozen-lockfile` 报
  `Already up to date`

## 3. 根配置

- [x] 3.1 写根 `vitest.config.mts`（`projects` 三条路径，不启用 coverage）
- [x] 3.2 实测 `root`/`include` 解析：必须用对象形式显式钉 `root`（string 条目的隐式 root 是配置
  文件所在目录，repository 域会扫错目录）；同组项目 `maxWorkers` 不同时 Vitest 直接抛错，故三个
  项目各带唯一 `sequence.groupOrder`
- [x] 3.3 实测 environment 隔离与 alias（api `node` + `@ -> apps/api/src`、web `jsdom` +
  `~ -> apps/web/app`），三项目同进程 365 文件 / 2544 用例全绿
- [x] 3.4 实测三域计数与单域运行一致（`vitest list` 逐项目名称集与单域运行 `diff` 完全一致）
- [x] 3.5 `test:ui` 可启动：`UI started at http://localhost:<port>/__vitest__/`，`GET` 该地址
  HTTP 200 且返回 `<title>Vitest</title>`；无头环境无法做浏览器点击，见 `verification.md`

## 4. 治理

- [x] 4.1 `scripts/check-workspace-boundaries.mjs` 白名单扩展；并从 `forbiddenRoot` 删除
  `vitest.config.mts` 一项（不删则该列表直接拒绝新根配置）
- [x] 4.2 `tests/test_workspace_boundaries.py`：非法依赖拒绝用例改用仍非法的 `prettier`；根脚本
  上限 57 → 58
- [x] 4.3 新增 `tests/vitest-projects.test.mjs` 并注册进 `run-test-owner.mjs` 治理段
- [x] 4.4 `scripts/testing/tests/run-test-owner.test.mjs` 治理文件清单同步
- [x] 4.5 `docs/development/testing.md`：脚本数 58/43/21、`test:ui` 用途与限制；README 命令表加一行

## 5. 验收

- [x] 5.1 `pnpm run check:boundaries`
- [x] 5.2 `python3 -m unittest tests.test_workspace_boundaries tests.test_operations_docs`（Ran 40 OK）
- [x] 5.3 `node scripts/testing/run-test-owner.mjs governance`（含新守卫 6 例）
- [x] 5.4 `pnpm run check:root`
- [x] 5.5 反向验证守卫：`include` 收窄、`projects` 路径改名、`root` 删除、cwd 桥删除四种改动均
  能触发失败；改回后逐字节还原（md5 一致）
- [x] 5.6 提交；推送后确认 `ci.yml` 与 `deploy-preview.yml` 全绿（推送前无法验证）。2026-09-20 在推送的 `ddd0fd7e` 上验证：CI run 35457618842（pull_request）与 Deploy preview run 35457615068（push）均 success；Deploy preview 内部执行 `pnpm run check` 与完整 `pnpm run test`。

## 6. 收尾

- [x] 6.1 写 `verification.md`（计数表、守卫正反向证据、门禁输出）
- [x] 6.2 更新 `.trellis/spec/repository/ci.md` 的根 UI 说明
- [x] 6.3 归档子任务
