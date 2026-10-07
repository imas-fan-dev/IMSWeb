# 归档核对（2026-09-19）

方式：只读 agent 逐条把 10 条验收项对照当前代码与测试。行为均有落地证据，三处断言偏薄已记在下面。
未执行测试套件（本轮核对只读）。

## 逐条证据

| AC | 证据 |
| --- | --- |
| AC1 | `apps/web/app/pages/account/security/session-device-model.ts:detectSystem`；`apps/web/tests/unit/pages/account/session-device-model.test.ts` 用例 A1–A4、B1–B2、E1/E4/E5/E6 |
| AC2 | 手机 / PC / 平板的归属在 `detectDeviceType`；E5「Android tablet」、E3「truncated Android」、E7「iPod touch」覆盖系统已知但端类型未知的一档 |
| AC3 | fixture 已换掉会撞 `slice(0,4)` 的 `session-current` / `session-other`，现为 `3a7f…` / `9b2d…` / `5c1e…` / `7d40…`（`account-security-page.test.tsx:101/111/121/131`）；`session-device-model.test.ts` › "separates two ids that share a prefix boundary" 显式钉住旧的 `sess` 冲突；端到端断言 `Macintosh · 3a7f` / `iPhone · 9b2d` |
| AC3a | `account-security-page.test.tsx` › "renders the two unknown tiers as distinct rows"（`iOS 设备` 与 `未知设备`） |
| AC4 | `session-device-section.tsx` 的 `DeviceIcon` 按端类型切到 SmartphoneIcon / TabletIcon / MonitorIcon / CircleHelpIcon |
| AC5 | `platform-account-menu` 之外的会话行仍以 `userAgentLabel` 的 dl 行保留原始 UA；测试 "keeps the raw user agent available as secondary information" |
| AC6 | `session-device-model.test.ts` 20 条表驱动用例 + "never throws on malformed or hostile input"（undefined、50k 字符串、畸形输入） |
| AC7 | 原 UA 原文断言改到 `account-security-page.test.tsx:616-617` 作为次级信息；`:300` 附近的「当前设备」徽标断言未被改动 |
| AC8 | `apps/web/app/i18n/resources.ts:305-341`（zh-CN）与 `:897-933`（en）；测试 "new device-label i18n keys" 逐键核对两种语言 |
| AC9 | `platformSessionDeviceSchema` 最后修改在 `f47edbfb`；`c3bbc5f3` 未触及 `packages/contracts/src` 与 `apps/api` |

## 断言偏薄（行为已实现，缺直接断言）

- **AC4 图标绑定**：测试只断言 `data-device-type`，没有断言实际渲染出的 lucide 图标。
- **iPad 分支**：`detectDeviceType` 的 `/\biPad\b/` 分支有代码但无用例喂真实 iPad UA（C2 是桌面模式的 Macintosh UA）。
- **AC3 后缀跨刷新稳定**：靠模块注释里的 `id` 语义论证，没有用例模拟 token 轮换。
