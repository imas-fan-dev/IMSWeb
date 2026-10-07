# 修复 E2E 顶栏竞态与用例预算并固化 CI 编写约束

## Goal

修复 release/v1.1 上 CI run [35011791691](https://github.com/imas-fan-dev/IMSWeb/actions/runs/35011791691) 残留的 5 个 E2E 失败（Web 2 个、App 3 个），并把这次暴露的两类失败模式写进 Web testing spec，作为后续编写 CI 测试的硬约束。

## 背景与证据

失败全部集中在两条 lane，且都已定位到用例层，不涉及产品行为回归：

- Web `Validate Web`：`tests/e2e/community-exchange-me.spec.ts:466` 在 chromium-desktop 与 chromium-mobile 各挂一次。trace 显示 7.0s 的 `帐号按钮` 点击没有打开 Popover（点击前 6.99s 与点击后 7.21s 的画面里弹层都是关着的），失败断言 `[data-slot="popover-content"] [data-slot="avatar-image"]` 因此找不到元素。同一时刻（7.0s）头像 PUT 返回并抛出 `头像已更新` toast，而 `root-layout.tsx:52` 配置的是 `<Toaster position="top-right" richColors closeButton />`，位置正是账号按钮所在的顶栏右侧。
- App `Validate App`：`tests/e2e/app-account.spec.ts:201` 在 app-iphone、app-android、app-webkit 全部超时。三份 error-context 的第一条错误都是 `Test timeout of 20000ms exceeded`，后面的 `toBeHidden`、`toHaveURL`、`locator.click` 只是 20s 预算耗尽时正好停在哪一步。本地用 CI 等价配置（`workers: 1`、`retries: 0`、`--repeat-each=2`）跑同一用例 6/6 通过，耗时 12.9–16.0s。

App 用例之所以在 CI 上刚好卡在 20s：它在一个 20s 预算内两次等待 sonner 的 4s 自动消失计时器（`toBeHidden({ timeout: 10_000 })`，两处约 8s），runner 的其余工作又比本地慢 2–3 倍。

## Requirements

- Web 用例在保存头像之后、驱动顶栏账号控件之前，必须等瞬时提示（toast）落定，并在点击后断言 Popover 真的打开，使“点击被吞掉”变成显式失败而不是静默无操作。
- App 用例不再靠等待定时器来让 toast 消失，改为显式关闭并断言消失；用例不做全局超时放宽，保持 20s 与零重试的既有约束。
- 两个 spec 共用同一个 toast 落定辅助函数，避免各自实现。
- 把“CI 上用例预算”“瞬时浮层遮挡顶栏控件”“变更后点击需断言新状态”三条写进 `.trellis/spec/web/frontend/testing.md` 的 Browser tests 契约，并在 `docs/development/testing.md` 留一处指针。
- 不改动任何生产代码、Playwright 配置或 CI workflow。

## Acceptance Criteria

- [x] `apps/web/tests/e2e/community-exchange-me.spec.ts` 在保存头像后先落定 toast，再点击账号触发按钮，并在断言头像前显式等待 `[data-slot="popover-content"]` 可见。
- [x] `apps/web/tests/e2e/app-account.spec.ts` 不再使用 `toBeHidden({ timeout: 10_000 })` 等待 toast 自动消失，改为显式关闭 + 断言消失；第一次 CI 过后该用例仍在 app-webkit 触碰 20s，已在「已持久化头像」边界拆成两个用例。
- [x] 新增的 toast 落定辅助函数被两个 spec 复用，且测试文件仍从 `./fixtures/test` 导入 `test`。
- [x] 本地 `CI=1` 下两条用例全绿，并在 CI run [35022627372](https://github.com/imas-fan-dev/IMSWeb/actions/runs/35022627372)（commit b7f190e8）验证：七个 job 全部 success，App 侧拆分后的两个用例在三个 project 全部通过（app-iphone 7.9s/7.3s、app-android 7.7s/7.4s、app-webkit 17.0s/10.6s），Web 侧 `community-exchange-me.spec.ts` 在 chromium-desktop 13.4s、chromium-mobile 15.9s 通过。app-webkit 的上传场景 17.0s 是本 lane 最紧的一条，已记入 spec 的预算段落作为不可再拆流程的实测下限。
- [x] `.trellis/spec/web/frontend/testing.md` 含上述三条 CI 编写约束，`docs/development/testing.md` 有一处指向它的链接。
- [x] `pnpm --filter @imsweb/web run lint`、`typecheck`、`test:unit` 通过；`pnpm run check:rules` 通过（CI 侧 Validate Web 同样跑通 185 个文件 / 1181 个单测）。

## Notes

- 任务是纯测试与规范改动，不进入产品行为面；如发现产品侧确实存在点击丢失，再另开任务。
- 修复前已复现失败证据（CI 日志、trace、artifact 截图），修复后以本地 CI 等价运行作为回归证据。
