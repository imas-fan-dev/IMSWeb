# Implement: 修复 E2E 顶栏竞态与用例预算

## 前置

- 分支 `release/v1.1`，任务目录 `.trellis/tasks/09-16-e2e-authoring-hardening/`。
- 参考 spec：`.trellis/spec/web/frontend/testing.md`（Browser tests 与 API mocks in Playwright 两节）。
- 只在 `apps/web/tests/e2e/` 与两份文档里改动，不碰生产代码、Playwright 配置、CI workflow。

## Checklist

1. [ ] 新增 `apps/web/tests/e2e/fixtures/toast.ts`，实现 `settleToasts(page)`：对 `[data-sonner-toast]:not([data-removed="true"])` 逐个点 `Close toast`（最多 4 轮），最后断言 `[data-sonner-toast]` 计数为 0。文件顶部写明为什么必须在驱动顶栏控件前落定提示、为什么循环而不是点一次、为什么排除 `data-removed`，以及关闭按钮只对 success/error/info 提示存在。确认 `apps/web/tests/unit/e2e/e2e-source-policy.test.ts` 只扫描 `*.spec.*` 文件，辅助模块不受其约束。
2. [ ] 修改 `apps/web/tests/e2e/community-exchange-me.spec.ts`（保存头像后、约 570–590 行）：把内联的 `page.locator('[data-slot="popover-content"] ...')` 提为局部 `accountPopover`，在 `accountTrigger.click()` 之前插入 `await settleToasts(page)`，点击后先 `expect(accountPopover).toBeVisible()` 再断言其中的 `avatar-image` src。
3. [ ] 修改 `apps/web/tests/e2e/app-account.spec.ts` 两处 toast 等待（约 398 行与 442 行）：保留 `toBeVisible()`，把 `toBeHidden({ timeout: 10_000 })` 换成 `await settleToasts(page)` 加 `await expect(toast).toHaveCount(0)`。两处都要改，否则预算问题只解决一半。
3b. [ ] 修改 `apps/web/tests/e2e/community-exchange-me.spec.ts` 保存资料之后的一处（约 624–627 行）：同样把 `not.toBeVisible({ timeout: 6_000 })` 换成“断言 toast 可见 → `settleToasts` → 断言消失”。这一处在 CI mobile 上实测耗掉 4.32s，与第 2 条的顶栏点击（4.58s）来自同一个 sonner 计时器。带句号的行内提示断言保持不变。
3c. [ ] 拆分 `apps/web/tests/e2e/app-account.spec.ts` 的单一巨型用例。第一次推送后（CI run 35019780072）只剩 app-webkit 失败：app-iphone 12.4s、app-android 11.8s、app-webkit 20.5s，同一份代码三个 project 差 8.7s。拆成“上传头像”与“启动解析已持久化头像并移除”两个用例，共用新增的 `openAccountRoot` 辅助函数（统一 mock、头像路由、请求计数），第二个用例用 `{ profile }` 预置已持久化头像以免重做上传。两个用例都保留三个 project 的 tag。
4. [ ] 检查这两个 spec（以及同一文件里其它 `accountTrigger.click()` / 顶栏交互）是否还有“动作刚引发提示就点顶栏控件”的同类点；有则一并用 `settleToasts` 收敛，没有则在任务记录里说明已确认无其它点。
5. [ ] 在 `.trellis/spec/web/frontend/testing.md` 的 Browser tests 之后新增一节 `## Scenario: CI-stable browser test authoring`，按该文件既有 scenario 结构（Scope/Trigger、Contracts、Good/Base/Bad Cases、Tests Required）写清三条约束：
   - 预算：同类用例在 CI runner 上的墙钟约为本地的 1.5–2.5 倍，且重试为零；单个用例的断言总量应留出对半余量，超过半个 `timeout` 就必须拆分或削减等待，而不是放宽超时。
   - 瞬时浮层：`Toaster` 固定在右上角（Web）与顶部整宽（App，窄屏），会盖住账号触发按钮与顶栏返回按钮。驱动这些控件前必须显式落定提示，用 `settleToasts` 关闭并断言消失，不要在预算内等待 4s 自动消失计时器。
   - 点击后断言新状态：动作会重渲染被点击控件时，点击后先断言该交互的可见结果（如 `[data-slot="popover-content"]` 可见），让被吞掉的点击显式失败，而不是延后到某个子元素断言上。
6. [ ] 在 `docs/development/testing.md` 增加一处指向该 spec 节的相对链接（`../../.trellis/spec/web/frontend/testing.md`），保持该文件既有的元数据头与风格，不要复述具体规则。
7. [ ] 运行验证命令并记录实际数字。

## 验证命令

```sh
cd apps/web
CI=1 pnpm exec playwright test tests/e2e/community-exchange-me.spec.ts \
  -g "edits the authenticated profile and card without viewport overflow" --repeat-each=2
CI=1 pnpm exec playwright test --config playwright.app.config.ts \
  tests/e2e/app-account.spec.ts -g "uses an account root and independent profile section stack" \
  --workers=1 --retries=0 --repeat-each=2
pnpm run lint
pnpm run typecheck
pnpm run test:unit
cd ../.. && pnpm run check:rules
```

- 运行 Web 用例前确认 4173 端口空闲（`lsof -iTCP:4173 -sTCP:LISTEN`），否则 `reuseExistingServer` 会挂到别的 checkout 上。
- 期望结果：两个 App 用例在三个 project 全部通过，单次耗时明显低于 20s（拆分后本地实测 2.9–5.0s，拆分前单用例 6.2–7.7s）；Web 目标用例在 chromium-desktop 与 chromium-mobile 通过（实测 desktop 7.5/9.5s、mobile 12.8s）。

## 审查门

- [ ] 两个 spec 都从 `./fixtures/test` 导入 `test`，新增模块只导出辅助函数。
- [ ] 没有引入 `page.waitForTimeout` 或任何墙钟等待（受 `e2e-source-policy.test.ts` 约束）。
- [ ] 没有改动 `playwright*.config.ts` 的超时与重试。
- [ ] 文档改动不复制规则正文，只留指针；`pnpm run check:rules` 通过。

## 回滚点

单次提交即可回滚：还原两个 spec 的调用点、删除 `fixtures/toast.ts`、回退两份文档。`app-account.spec.ts` 的拆分在同一提交内，回滚时用 `git show <回滚点>:apps/web/tests/e2e/app-account.spec.ts` 取回单一用例版本。
