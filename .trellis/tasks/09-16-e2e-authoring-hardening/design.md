# Design: 修复 E2E 顶栏竞态与用例预算

## 范围边界

改动只落在 `apps/web/tests/e2e/`、`.trellis/spec/web/frontend/testing.md` 与 `docs/development/testing.md`。

不动的部分，以及原因：

- `apps/web/playwright.config.ts` 与 `apps/web/playwright.app.config.ts` 的 `timeout: 20_000`、`retries: 0` 保持原样。放宽超时会让“用例本身过重”这件事继续隐藏，零重试是 09-15-e2e-ci-stability 已确立的约束。
- `apps/web/app/layouts/root-layout.tsx` 的 `<Toaster position="top-right" />` 保持原样。toast 位置是可见的产品选择，测试不该为消除竞态去改写产品观感；如果之后要调整，应作为独立的产品任务评估移动端顶栏遮挡。
- 生产组件不参与本任务。trace 证据指向“点击发生在保存头像引发的重渲染/浮层挂载那一帧”，属测试时序问题。

## 实测时间线

用 CI artifact 里 chromium-mobile 的 trace 还原（dt 为相对测试开始的秒数）：

```text
 4.74  mock fulfill 首次出现            CI mobile 光启动就花 4.7s
 6.40  click 保存头像
 6.65  click 帐号按钮     耗时 4.58s    被 toast 挡住，Playwright 重试到 toast 自动消失
11.24  expect popover 内头像            这时弹层才真正打开
13.56  click 保存资料
13.66  expect 制作人资料已保存 不可见  耗时 4.32s   又是等同一个 4s 计时器
20.27  click 搜索                       随后 20s 预算耗尽，死在 671 行
```

20s 预算里 8.9s 花在同一个 sonner 计时器上：一次是点击被 toast 挡住的重试，一次是 `not.toBeVisible` 等自动消失。两个调用点都改用 `settleToasts` 后，本地 App 用例从 12.9–16.0s 降到 6.0–7.7s，Web mobile 从 13.0/15.4s 降到 12.8s。

## 失败机制

Web 失败发生在一次跨帧交互上：

1. `保存头像` 触发 `PUT /api/platform/me/avatar`，返回后同时发生两件事：会话状态更新（顶栏头像 src 变化并触发重渲染）与 `profile-editor.tsx` 的 `toast.success`（把 `头像已更新` 挂到右上角，x 坐标与账号按钮重叠）。
2. 用例在同一个时刻点击账号触发按钮。若 toast 在 Playwright 的命中判定与 pointerdown 之间挂载，或者按钮节点在 pointerdown 与 pointerup 之间被 React 替换，`click` 事件就不会落到触发按钮上；Playwright 不会报错，Popover 也不会打开。
3. 后面的断言按“元素不存在”失败，而真正的失效点是那次没有生效的点击。

App 失败是预算问题：用例在 20s 内两次等待 sonner 的 4s 自动消失计时器，本地约 13–16s，CI 的其余工作慢 2–3 倍后正好越过 20s，失败落在哪一行取决于时钟在哪里耗尽。

## 契约

新增 `apps/web/tests/e2e/fixtures/toast.ts`，导出瞬时提示落定函数。它需要同时满足两个 lane：

```ts
export async function settleToasts(page: Page): Promise<void> {
  const liveToasts = page.locator(
    '[data-sonner-toast]:not([data-removed="true"])'
  )

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await liveToasts.count()) === 0) break
    await liveToasts.first().getByRole("button", { name: "Close toast" }).click()
  }

  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
}
```

约束与依据：

- `data-sonner-toast` 是 sonner（当前 2.0.8）给每条提示的容器属性，`closeButton` 已在应用 Toaster 上开启，因此关闭按钮存在。两者都是 sonner 的稳定输出，不是本仓库自造的选择器。
- 优先点击关闭按钮而不是等 4s 自动消失：App 用例正是被这个计时器吃掉预算。
- 用循环而不是点一次：同一次交互可能和上一步的提示重叠（移除头像后一秒内保存资料），只关最前面那条会让旧提示退回 4s 计时器。
- 只点存活提示：正在退场的提示会保留一个退场动画周期并带 `data-removed`，此时点击会等一个已经移出视口的目标；最终的 `toHaveCount(0)` 再等它们全部离开 DOM。
- 关闭按钮只对 success/error/info 提示渲染；sonner 对 loading 和自定义 jsx 提示不渲染它。当前应用没有这类提示，将来引入后会在这里显式失败而不是静默留下遮罩。
- 调用点必须放在“引发提示的动作已完成”之后，否则会出现提示还没挂载就已经断言消失的空窗。

## 调用点

`apps/web/tests/e2e/community-exchange-me.spec.ts`，保存头像之后的顶栏交互：

```ts
await expect(
  accountTrigger.locator('[data-slot="avatar-image"]')
).toHaveAttribute("src", directAvatarUrl)
await settleToasts(page)
await accountTrigger.click()
const accountPopover = page.locator('[data-slot="popover-content"]')
await expect(accountPopover).toBeVisible()
await expect(
  accountPopover.locator('[data-slot="avatar-image"]')
).toHaveAttribute("src", directAvatarUrl)
```

新增的 `toBeVisible()` 是这次修复的一半价值：被吞掉的点击会停在“弹层没打开”，而不是停在后面某个找不到子元素的断言上。

`apps/web/tests/e2e/app-account.spec.ts`，两处 `toBeHidden({ timeout: 10_000 })`：

```ts
const avatarUpdatedToast = page.getByText("头像已更新", { exact: true })
await expect(avatarUpdatedToast).toBeVisible()
await settleToasts(page)
await expect(avatarUpdatedToast).toHaveCount(0)
```

保留 `toBeVisible()`（用户可见反馈仍被验证），把“等待自动消失”换成“显式关闭并断言已消失”。`返回` 按钮与顶栏在移动端会被整条 toast 覆盖，所以关掉提示仍是点击前必须完成的一步。

`apps/web/tests/e2e/community-exchange-me.spec.ts` 的第二处，保存资料之后（原 `not.toBeVisible({ timeout: 6_000 })`）：

```ts
await expect(page.getByText("制作人资料已保存。")).toBeVisible()
const profileSavedToast = page.getByText("制作人资料已保存", { exact: true })
await expect(profileSavedToast).toBeVisible()
await settleToasts(page)
await expect(profileSavedToast).toHaveCount(0)
```

带句号的行内提示由 i18n `saved` 渲染，不带句号的 toast 由 `profile-editor.tsx:97` 的 `toast.success` 抛出，两者在同一次保存里一起出现，所以补 `toBeVisible()` 是安全的。后续动作是点击 `交换名片` 内容导航，移动端窄屏下顶部整宽 toast 同样会盖住该区域。

## 取舍

- 显式关闭 vs 等待自动消失：等待会自动验证 sonner 的计时行为，但那不是本仓库的契约，代价是每条提示 4s、App 用例两次共约 8s。选显式关闭。
- 修用例 vs 修产品：顶栏控件被 toast 覆盖在产品上确有可讨论之处（移动端尤其明显），但用例里先做显式落定是确定性最高、影响面最小的收敛方式；产品侧若确认要改，另开任务。
- 共用辅助函数 vs 每个 spec 自己写：两处需要同一语义，共用可以避免下一次只修一半。

## 兼容性与回滚

- 辅助函数依赖 sonner 的两处输出；sonner 升版本导致属性变化时，`settleToasts` 会在空 locator 上失败，属于显式失败而非静默跳过。
- 回滚方式：还原两个 spec 的调用点并删除 `fixtures/toast.ts`，规范段落单独回滚。生产代码与 CI 配置没有改动，回滚不影响构建产物。

## 验证方式

本地以 CI 等价参数运行两条用例（`CI=1`、`--workers=1 --retries=0`，App 侧 `--repeat-each=2`），记录耗时是否明显低于 20s；再跑 Web 的 lint、typecheck、unit 与 `pnpm run check:rules`。
