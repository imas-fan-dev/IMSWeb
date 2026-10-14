# 帐号安全页设备标记展示：执行计划

设计依据：同目录 `design.md`。改动面只允许落在 `apps/web/app/{pages/account/security,i18n}` 与 `apps/web/tests/unit/pages/account`；`packages/contracts` 与 `apps/api` 必须零 diff（AC9）。

所有命令都从仓库根目录执行，Node `>=22.13.0`、pnpm `>=11.10.0`（见 `docs/development/ai-environment.md` 第 1 节）。

## 步骤 1 — 新建解析模块（纯函数，无消费方）

- 产出：`apps/web/app/pages/account/security/session-device-model.ts`
- 内容：`DeviceSystem` / `DeviceType` / `DevicePlatformWord` / `SessionDeviceDescriptor` 类型；`parseSessionUserAgent`；`shortSessionDeviceId`；`DEVICE_LABEL_SEPARATOR`；`DEVICE_SYSTEM_KEYS` / `DEVICE_PLATFORM_KEYS` 两张 `as const satisfies` 映射表。
- 规则按 `design.md` §2.3 的两阶段顺序实现，全部样本落点见 §2.4。禁止 import `navigator`、React、i18n 运行时。
- 自检：`python3 -c "print(open('apps/web/app/pages/account/security/session-device-model.ts').read().count('\n'))"` 确认无残留 TODO；用 `grep -n "navigator\|window\." apps/web/app/pages/account/security/session-device-model.ts` 确认零命中。
- 回滚点：本步是新增文件，删除即回滚，无行为变化。

## 步骤 2 — 补 i18n 键（zh-CN + en 成对）

- 产出：`apps/web/app/i18n/resources.ts`，在 `common.platformAccount.security.sessions` 下加 `design.md` §4 的 14 个键。
- zh-CN 块在 `:267-291` 的 `sessions` 对象内；en 块在 `:685-708` 的同名对象内。新增子对象 `deviceSystem` / `devicePlatform` 放在 `unknownDevice` 之后、`unknownAddress` 之前，两个语言块保持完全一致的键序。
- 必须在 zh-CN 块先写（`apps/web/app/i18n/i18next.d.ts:6` 以 zh-CN 定义键名类型）。
- 验证：`pnpm --filter @imsweb/web run typecheck`（`react-router typegen && tsc`，会校验新键可被 `t()` 接受）。
- 回滚点：纯新增键，删除即回滚；`resources.ts` 只有这一处 diff。

## 步骤 3 — 新建纯函数单测

- 产出：`apps/web/tests/unit/pages/account/session-device-model.test.ts`
- 内容：`design.md` §2.4 全样本表驱动断言（含 A1–A4、B1–B2、C1–C2、D1、E1–E10），边界输入，`shortSessionDeviceId` 三态，以及两张映射表对 `resources["zh-CN"]` / `resources.en` 的键覆盖守卫（AC8 失败关闭）。
- 用 `~/pages/account/security/session-device-model` 导入；不 `vi.mock`、不需要 `MemoryRouter`。
- 验证：
  ```sh
  pnpm --filter @imsweb/web run format
  pnpm --filter @imsweb/web exec vitest run tests/unit/pages/account/session-device-model.test.ts
  pnpm --filter @imsweb/web run lint
  pnpm --filter @imsweb/web run typecheck
  ```
- **评审闸门 A**：解析器单测全绿、键覆盖守卫全绿、typecheck 通过。此时产品行为尚未改变（组件仍读原始 UA），既有页面测试必须仍然全绿：
  ```sh
  pnpm --filter @imsweb/web run test:unit
  ```
- 回滚点：步骤 1–3 是纯新增（模块 + 键 + 测试），可单独回滚而保持运行态不变。

## 步骤 4 — 组件接入标签与原始 UA

- 产出：`apps/web/app/pages/account/security/session-device-section.tsx`
  - `:23-27` 增加 `./session-device-model` 导入。
  - `:205-207` 换成 `parseSessionUserAgent` + 三档 `head`（`DEVICE_PLATFORM_KEYS` / `deviceUnknownSystem` / `unknownDevice`）+ `shortSessionDeviceId` 拼接；Android 且有版本时用 `devicePlatform.androidVersion` 插值 `{{version}}`。
  - `:220-223` 主标签拆 head 与弱化后缀 `<span className="text-muted-foreground">`，`deviceLabel` 仍是完整拼接串（`:271-274` 的 aria-label 不改）。
  - `:257` 之后在 `<dl>` 内加原始 UA 行，仅当 `device.userAgent` 非空；`sm:col-span-2` + `break-all`。
- 不改 `account-security-model.ts`、`account-security-page.tsx`、任何 contracts / API 文件。
- 验证：`pnpm --filter @imsweb/web run typecheck` 通过（证明 `t(MAP[code])` 的键类型合法）。
- 回滚点：与步骤 5、6 同属一次行为翻转，必须一起落地；单独回滚本步会留下未被测试锁定的标签。

## 步骤 5 — 图标映射与测试钩子

- 产出：同一文件。
  - `:4` 的 `LaptopIcon` 换成 `CircleHelpIcon, MonitorIcon, SmartphoneIcon, TabletIcon`（`lucide-react` 本地已存在这四个图标）。
  - `:214-218` 图标按 `deviceType` 选择：`phone → SmartphoneIcon`、`tablet → TabletIcon`、`desktop → MonitorIcon`、`null → CircleHelpIcon`。
  - `<li>` 增加 `data-device-type={descriptor.deviceType ?? "unknown"}`。
- 不做：不为系统选品牌图标（`design.md` §3.4 已说明 AC4 的字面差异，闸门 B 确认）。
- 回滚点：同上，与步骤 4、6 一起。

## 步骤 6 — 更新既有页面测试并补新用例

- 产出：`apps/web/tests/unit/pages/account/account-security-page.test.tsx`
  - `:46-63` fixture：换成真实 UUID（`3a7f1c2e-…` / `9b2d4e6f-…`）与真实 UA（macOS Safari 全串 / Tauri iOS 全串）。
  - `:297`、`:309`、`:312`、`:323`、`:332`、`:425` 六处断言改为 `Macintosh · 3a7f` / `iPhone · 9b2d` / `吊销 iPhone · 9b2d 的登录`（`design.md` §5.2 对照表）。`:305` 不改。
  - 新增：tier-1（`iPod touch` → `iOS 设备 · 5c1e`）与 tier-2（`userAgent: null` → `未知设备 · 7d40`）两行并存且文案不同；`data-device-type` 断言；原始 UA 全串可见且空 UA 行不渲染。
- 验证：
  ```sh
  pnpm --filter @imsweb/web run format
  pnpm --filter @imsweb/web exec vitest run tests/unit/pages/account/session-device-model.test.ts tests/unit/pages/account/account-security-page.test.tsx
  pnpm --filter @imsweb/web run test:unit
  ```
- **评审闸门 B**：两个测试文件全绿；确认 AC4 的图标口径（只随端类型变化）被评审接受；确认没有为了过测试而放宽任何解析探针。
- 回滚点：步骤 4–6 构成一次原子行为翻转，回滚时三者一起退回。

## 步骤 7 — 最终校验与边界确认

```sh
cd /Users/texas/Workspace/IMSWeb
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run test          # web owner 全量（含 Playwright，需要可用的预览/服务）
pnpm run check:rules                        # agent/source 规则 + contracts 非 JSON 边界 + 文档
pnpm run check:boundaries                   # workspace 依赖边界未被触碰
git status --short                          # 只应出现 apps/web/** 与 .trellis/**
git diff --stat -- packages/contracts apps/api   # 必须为空
```

说明：`pnpm --filter @imsweb/web run test` 会走 `run-test-owner.mjs web` 并包含 Playwright；本任务没有浏览器级改动，若本地缺少预览服务，以 `test:unit` + `typecheck` + `lint` 作为最小证据，并在回报里按 `docs/development/ai-environment.md` 记录未跑项与原因，不要静默跳过。

- **评审闸门 C**：`check:rules` 与 `check:boundaries` 通过；`packages/contracts`、`apps/api` 零 diff（AC9）；`git status` 只列 Web 与任务目录。
- 回滚点：整任务回滚 = 还原 `resources.ts`、`session-device-section.tsx`、`account-security-page.test.tsx` 三个文件 + 删除 `session-device-model.ts` 与其单测文件。

## 顺序依赖与并行边界

| 步骤 | 依赖 |
| --- | --- |
| 1 | 无 |
| 2 | 无（与 1 可并行） |
| 3 | 1、2（键覆盖守卫读两张映射表与两边语言块） |
| 4 | 1、2 |
| 5 | 4（同一 JSX 块） |
| 6 | 4、5 |
| 7 | 全部 |

唯一建议的并行点是步骤 1 与步骤 2（不同文件、无共享符号）；其余严格串行，避免 `session-device-section.tsx` 与页面测试出现半改状态。

## 交付物清单

- 新增：`apps/web/app/pages/account/security/session-device-model.ts`
- 新增：`apps/web/tests/unit/pages/account/session-device-model.test.ts`
- 修改：`apps/web/app/pages/account/security/session-device-section.tsx`
- 修改：`apps/web/app/i18n/resources.ts`
- 修改：`apps/web/tests/unit/pages/account/account-security-page.test.tsx`
