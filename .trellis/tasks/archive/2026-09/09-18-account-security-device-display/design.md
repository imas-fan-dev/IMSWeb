# 帐号安全页设备标记展示：技术设计

## 1. 现状与约束

### 1.1 渲染唯一汇聚点

| 锚点 | 事实 |
| --- | --- |
| `apps/web/app/pages/account/security/session-device-section.tsx:205-207` | `deviceLabel = device.userAgent \|\| t("...unknownDevice")`，全组件唯一的标签计算点 |
| `:221-223` | 主标题 `<p className="min-w-0 text-sm font-medium break-all">{deviceLabel}</p>`，无 JS 截断 |
| `:271-274` | 吊销按钮 `aria-label` 用 `t("...revokeLabel", { device: deviceLabel })`，与主标题共用一个变量 |
| `:215-218` | `<LaptopIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />`，恒定 |
| `:230-258` | `<dl>` 展示 IP / 登录时间 / 最后活跃，含 `break-all` 的 `<dd>` 先例（`:235-238`） |
| `:23-27` | 组件已从 `./account-security-model` 导入纯函数（`formatTimestamp` 等） |

结论：改标签只需替换 `:205-207` 一处赋值；图标只需替换 `:215-218`；原始 UA 落点复用 `<dl>` 结构。aria-label 自动跟随，无需第二处修改。

### 1.2 数据现实

- 会话记录只有 `user_agent` / `ip_address`，来源是请求头原文，`trim` 后截 1024：`apps/api/src/domains/identity/platform-auth/contracts/session.ts:136-151`；DB 约束 `length(user_agent) <= 1024`。
- 会话 id 由 `crypto.randomUUID()` 生成（`contracts/session.ts:160`、`:221`），即小写 UUID v4；刷新轮换只更新 token hash 等列，不换 `id`（研究 `03` 第 4 节）。
- 无 device id、无 client 类型；`X-IMS-Auth-Mode` 头不落库（`platform-token-store.ts:17-18`、`session.ts:107-109`）。Tauri 不设自定义 UA，服务端看不到 `isTauri()`。
- `packages/contracts/src/platform/account-security.ts:47-58` 的 `platformSessionDeviceSchema` 字段语义保持不变（AC9）。

### 1.3 工具缺口

两个 workspace 的 `package.json` 均无 UA 解析依赖；lockfile 里的 `bowser` 只是 `@aws-sdk/core` 的传递依赖。`apps/web/app/lib/native-glass.ts:46-71` 的正则依赖本机 `navigator.maxTouchPoints` / `platform`，签名对历史 UA 不适用，仅正则片段可参考。解析器必须新写、纯函数、可在 Node 环境断言。

### 1.4 i18n 与测试

- sessions 组：`apps/web/app/i18n/resources.ts:267-291`（zh-CN）、`:685-708`（en）；现无任何系统名 / 端类型键。
- 键名类型以 zh-CN 为准：`apps/web/app/i18n/i18next.d.ts:6`；`pnpm --filter @imsweb/web run typecheck` 会编译期校验新键。
- 测试默认语言 zh-CN（`apps/web/tests/setup.ts` + `resources.ts:2`），断言写中文原文。
- fixture 内联在 `apps/web/tests/unit/pages/account/account-security-page.test.tsx:46-63`。
- 依赖 UA 原文的断言实为 **6 处**（`:297`、`:309`、`:312`、`:323`、`:332`、`:425`），另有 **2 处** fixture 字面量（`:49`、`:59`）。PRD 中的 `:305` 是 `getByText("当前设备")`，与 UA 无关，无需改动。实现时要按 6+2 处理，不要照着 PRD 的行号列表机械替换。

## 2. 解析器设计

### 2.1 模块与落点

新建 `apps/web/app/pages/account/security/session-device-model.ts`，与 `session-device-section.tsx` 同目录、页面私有，符合 `architecture.md`「纯 labels / formatting 用聚焦的 `*-model.ts`」。

不放进 `account-security-model.ts`：该文件自己的文档注释是 "Error predicates for the account-security endpoints"（`:3-8`），塞入 UA 规则会稀释职责；本模块带一张判定规则表和一组 key 映射，是第二个明确概念。不新建组件、不加依赖。

单测镜像到 `apps/web/tests/unit/pages/account/session-device-model.test.ts`（`testing.md` 要求测试镜像生产所有者）。

### 2.2 导出与返回结构

```ts
export type DeviceSystem = "ios" | "android" | "macos" | "windows" | "linux"
export type DeviceType = "phone" | "tablet" | "desktop"
/** 主标签里出现的平台词 code，非翻译文案 */
export type DevicePlatformWord =
  | "iphone" | "ipad" | "android" | "macintosh" | "windows" | "linux"

export interface SessionDeviceDescriptor {
  /** 未识别出系统时为 null */
  system: DeviceSystem | null
  /** 系统已知但形态无法判定时为 null */
  deviceType: DeviceType | null
  /** 仅在 system 与 deviceType 都已知且能映射到平台词时非 null */
  platform: DevicePlatformWord | null
  /** Android 主版本号，取自 UA 的 `Android 14` 段，供插值使用 */
  platformVersion: string | null
}

export function parseSessionUserAgent(
  userAgent: string | null | undefined
): SessionDeviceDescriptor

export function shortSessionDeviceId(id: string): string

export const DEVICE_LABEL_SEPARATOR = " · "

/** 系统 code → i18n 键，供两档未知态的 tier-1 文案使用 */
export const DEVICE_SYSTEM_KEYS: Record<DeviceSystem, string>
/** 平台词 code → i18n 键，供主标签使用 */
export const DEVICE_PLATFORM_KEYS: Record<DevicePlatformWord, string>
```

约束：输入 `string | null | undefined`，永不抛错；非字符串、空串、纯空白一律返回全 `null` 描述符。不使用 `navigator`、不读 `Date`、不读环境变量。

不放 `clientKind`（app vs browser）。理由：产品已拍板「设备名使用平台词」，标签形态是 `iPhone · 3a7f`，没有应用/浏览器词；启发式结果展示给用户会误导。Tauri iOS / Android 样本仍进规则表，作为「不得误判为未知」的回归输入（DR8 的覆盖语义）。若后续产品要加该词，规则表已预留 `; wv` / 缺 `Safari/` 的判定位置。

### 2.3 判定顺序：先系统，后端类型

两阶段，阶段一 first-match-wins，顺序是 load-bearing 的：

| 序 | 探针 | system | 为什么必须在这个位置 |
| --- | --- | --- | --- |
| 1 | `/Windows Phone/i` | `windows` | Windows Phone UA 内嵌 `Android 4.2.1`，必须早于 Android |
| 2 | `/\b(iPhone\|iPad\|iPod)\b/i` 或 `/CPU (iPhone )?OS \d/` | `ios` | iPhone UA 内含 `like Mac OS X`、iPad 靠 `CPU OS`，必须早于 macOS |
| 3 | `/\bAndroid\b/i` | `android` | Android UA 内含 `Linux`，必须早于 Linux |
| 4 | `/\bMacintosh\b/i` | `macos` | iPadOS 桌面模式 UA 与桌面 Safari 完全一致，只能落这里（已知歧义） |
| 5 | `/Windows NT\|Windows \d/i` | `windows` | `Windows NT 10.0` 同时覆盖 10/11，因此平台词不带版本 |
| 6 | `/\bLinux\b/i` 或 `/\bX11\b/i` | `linux` | 最后，Android 已在前一步分流 |
| 7 | 以上皆不匹配 | `null` | 进入 tier-2 |

阶段二按 system 取端类型：

| system | 规则 | deviceType |
| --- | --- | --- |
| `ios` | `/\biPad\b/i` | `tablet` |
| `ios` | `/\biPhone\b/i` | `phone` |
| `ios` | 其余（`iPod`、只有 `CPU OS`、截断） | `null` → tier-1 |
| `android` | `/\bMobile\b/i` | `phone` |
| `android` | 其余 | `tablet`（Android 平板 UA 惯例省略 `Mobile`） |
| `macos` / `linux` | 恒定 | `desktop` |
| `windows` | `/Windows Phone/i` | `phone` |
| `windows` | 其余 | `desktop` |
| `null` | 不推断 | `null` |

一个细节：Android 的**平台词不依赖端类型**（手机与平板都映射为 `android` + 版本），所以「截断丢掉 `Mobile`」这类错误只影响图标，不会写出错误的平台词；iOS 侧同类错误降级为 tier-1（少说一点），不会谎报 `iPhone`/`iPad`。这是选 `Mobile` 缺失 ⇒ `tablet` 而不是 ⇒ `null` 的主要安全论据。

冲突优先级与理由：

- **系统优先于端类型**。`Mobile` 同时出现在 iOS / Android / Windows Phone，`Linux` 同时出现在 Android 与桌面 Linux，形态 token 不具系统唯一性；而标签档位由「系统是否已知」决定（tier-1 = 已知系统、形态未知），必须先解系统才能定档。
- **系统 unknown 时丢弃形态信息**：有 `Mobile` 但无系统 token 的输入落 tier-2，不显示任何设备词，保证 AC3a（两档永不撞行）。
- `platform` 只在 `system` 与 `deviceType` 都已知且组合成立时非 null（`macos/windows/linux` 要求 `desktop`，`ios` 要求 phone/tablet，`android` 要求 phone/tablet）。
- `platformVersion`：`/Android[ /](\d{1,3}(?:\.\d{1,3})*)/i` 取捕获组；system 非 `android` 时为 null。

### 2.4 规则表（以 `research/07-ua-samples.md` 为输入集）

| # | 输入（缩写见 07 原文） | system | deviceType | platform | 版本 | zh 主标签 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | `Macintosh` + `Chrome/131` | `macos` | `desktop` | `macintosh` | — | `Macintosh` |
| A2 | `Macintosh` + `Version/18.1 Safari/605.1.15` | `macos` | `desktop` | `macintosh` | — | `Macintosh` |
| A3 | `Windows NT 10.0` + `Edg/131` | `windows` | `desktop` | `windows` | — | `Windows` |
| A4 | `X11; Linux x86_64` + `Firefox/133` | `linux` | `desktop` | `linux` | — | `Linux` |
| B1 | `iPhone; CPU iPhone OS 18_1` + `Version/18.1 … Safari/604.1` | `ios` | `phone` | `iphone` | — | `iPhone` |
| B2 | `Linux; Android 14; Pixel 8` + `Chrome/131 … Mobile Safari` | `android` | `phone` | `android` | `14` | `Android 14` |
| C1 | `iPhone; CPU iPhone OS 18_1` + `Mobile/15E148`（无 `Version/`、无 `Safari/`）| `ios` | `phone` | `iphone` | — | `iPhone`（与 B1 相同，见 §6） |
| C2 | 同 A2（iPadOS 桌面模式） | `macos` | `desktop` | `macintosh` | — | `Macintosh`（与 A2 相同，不可解） |
| D1 | `Linux; Android 14; … Build/…; wv)` + `Version/4.0 Chrome/131 … Mobile` | `android` | `phone` | `android` | `14` | `Android 14`（与 B2 相同） |
| E1 | `null` | `null` | `null` | `null` | — | 未知设备（tier-2） |
| E2 | `""` | `null` | `null` | `null` | — | 未知设备（tier-2） |
| E3 | 1024 截断串（停在 token 中间） | 由前缀决定 | 由前缀决定 | 由前缀决定 | — | 前缀支持的档位，不抛错 |
| E4 | `curl/8.7.1` 等自定义串 | `null` | `null` | `null` | — | 未知设备（tier-2） |
| E5 | `Linux; Android 4.4.2; Nexus 7`（无 `Mobile`） | `android` | `tablet` | `android` | `4.4.2` | `Android 4.4.2` |
| E6 | `Windows Phone 10.0; Android 4.2.1; Lumia 950` | `windows` | `phone` | `windows` | — | `Windows` |
| E7 | `iPod touch; CPU iPhone OS 15_0` | `ios` | `null` | `null` | — | `iOS 设备`（tier-1） |
| E8 | `Linux; Android 14`（现有 fixture 之外的极短形态） | `android` | `tablet` | `android` | `14` | `Android 14` |
| E9 | `Mozilla/5.0 (Macintosh)`（现有 fixture 原文） | `macos` | `desktop` | `macintosh` | — | `Macintosh` |
| E10 | `Mozilla/5.0 (iPhone)`（现有 fixture 原文） | `ios` | `phone` | `iphone` | — | `iPhone` |

E9/E10 证明现有 fixture 的短 UA 在新解析器下仍然有解，不需要为了测试而放宽探针。

## 3. 展示设计

### 3.1 标签组装与 `· 后缀`

```ts
const descriptor = parseSessionUserAgent(device.userAgent)
const shortId = shortSessionDeviceId(device.id)          // 稳定、可读、不含凭据
const head = /* 见 §3.2 的三档选择 */
const deviceLabel = shortId ? `${head}${DEVICE_LABEL_SEPARATOR}${shortId}` : head
```

- `shortSessionDeviceId` 取 `id.slice(0, 4)`；`id` 短于 4 时返回全部；空串返回空串（契约 `id.min(1)` 保证实际不会为空）。
- **4 位是否足够**：id 是 UUID v4，前 4 个字符即 4 位十六进制，`16^4 = 65536` 个取值（版本 nibble 在 index 12，不占用前 4 位）。只有**同一平台词**的行才会竞争，同一用户的同平台会话数 `n` 下的碰撞概率约为 `n²/(2·65536)`：`n=5` → 0.019%，`n=10` → 0.076%，`n=20` → 0.3%。契约上限 200 条时才到约 26%，而一个帐号不会有 200 条同平台会话。结论：4 位足够，维持拍板结果。
- 后缀取自 `id`，而 `id` 是主键、刷新轮换不修改，因此满足 AC3「后缀跨刷新稳定」。
- 后缀**同时进入可见标签与吊销按钮的 aria-label**（两者共读 `deviceLabel`），这样多个 `iPhone` 行的按钮名不再完全相同。
- 视觉：主标签 `<p>` 保留 `break-all`；后缀建议放在 `<span className="text-muted-foreground"> · 3a7f</span>` 里弱化，`deviceLabel` 仍是拼接后的完整字符串，因此 aria-label 与语义不受影响。`·` 是标点而非文案，以 `DEVICE_LABEL_SEPARATOR` 常量定义并在注释里说明，不进 i18n；若要严格「所有可见字符串过 i18n」，则需额外一键，本设计不采用。

### 3.2 三档文案选择

| 条件 | 键 | zh 结果（示例 id `3a7f`） |
| --- | --- | --- |
| `platform !== null` | `DEVICE_PLATFORM_KEYS[platform]`（android 且版本非空时用 `devicePlatform.androidVersion` 并插值 `{{version}}`） | `iPhone · 3a7f` / `Macintosh · 3a7f` / `Android 14 · 3a7f` |
| `platform === null && system !== null`（tier-1） | `deviceUnknownSystem`，`{{system}}` 取 `DEVICE_SYSTEM_KEYS[system]` | `iOS 设备 · 3a7f` |
| `system === null`（tier-2） | 既有 `unknownDevice` | `未知设备 · 3a7f` |

三档都带后缀，保证 AC5/DR5 的「可区分」在所有档位成立，且吊销按钮名在任意档位都有可辨识对象。

### 3.3 原始 UA（DR9）

在既有 `<dl>`（`:230-258`）末尾追加一行，仅当 `device.userAgent` 非空时渲染：

```tsx
<div className="flex min-w-0 gap-1 sm:col-span-2">
  <dt>{t("...userAgentLabel")}</dt>
  <dd className="min-w-0 break-all">{device.userAgent}</dd>
</div>
```

选择理由：可见、可键盘聚焦、可被辅助技术读取、无需新 primitive，且 `break-all` 有现成先例（`:235`）。悬停/展开被 `components-and-ux.md` 的「hover-only 展示需限定 `hover:hover` + `pointer:fine` 并补 focus 态」规则排除，`<dl>` 行成本更低。空 UA 不渲染该行，避免出现「未记录 UA」这类需要新键的空态。

### 3.4 图标映射（DR7 / AC4）

模块内常量 + 局部变量，不新增文件、不新增组件：

| deviceType | 图标 | 说明 |
| --- | --- | --- |
| `phone` | `SmartphoneIcon` | 覆盖 iPhone、Android 手机、Windows Phone |
| `tablet` | `TabletIcon` | 覆盖 iPad、Android 平板 |
| `desktop` | `MonitorIcon` | 覆盖 macOS / Windows / Linux，UA 无法区分笔记本与台式机 |
| `null` | `CircleHelpIcon` | tier-1 与 tier-2 共用 |

`lucide-react` 已本地存在 `smartphone` / `tablet` / `monitor` 图标（`apps/web/node_modules/lucide-react/dist/esm/icons/`），删除已不再使用的 `LaptopIcon` 导入。

AC4 字面写「图标随系统与端类型变化」：本设计让图标**只随端类型变化**，因为 Lucide 没有按 OS 区分的产品级图形（用 `AppleIcon` 这类品牌标是新的视觉决策），系统信息由平台词文本承载；未知态有专用图标。这一点在评审闸门 B 明确确认，避免被当成漏实现。

同时给 `<li>` 加 `data-device-type={descriptor.deviceType ?? "unknown"}`，供组件测试断言图标分支（图标本身 `aria-hidden`，SVG 形状不可断言）。

### 3.5 组件改动清单

| 位置 | 改动 |
| --- | --- |
| `:4` | `LaptopIcon` → `CircleHelpIcon, MonitorIcon, SmartphoneIcon, TabletIcon` |
| `:23-27` | 增加从 `./session-device-model` 的导入 |
| `:205-207` | 换成 `parseSessionUserAgent` + 三档 `head` + `shortSessionDeviceId` 拼接 |
| `:214-218` | 图标按 mapping 替换，`<li>` 增 `data-device-type` |
| `:220-223` | 主标签内拆分 head 与后缀（后缀弱化） |
| `:257` 之后 | 增加原始 UA 的 `<dl>` 行 |
| `:271-274` | 不改（继续读 `deviceLabel`） |

不改：契约、API、`account-security-model.ts`、`account-security-page.tsx`（props 与刷新语义不变）。

## 4. i18n

全部落在 `common.platformAccount.security.sessions` 下，zh-CN（`resources.ts:267-291`）与 en（`:685-708`）成对添加，共 **14 键 × 2 语言**。

| 键 | zh-CN | en |
| --- | --- | --- |
| `deviceSystem.ios` | `iOS` | `iOS` |
| `deviceSystem.android` | `Android` | `Android` |
| `deviceSystem.macos` | `macOS` | `macOS` |
| `deviceSystem.windows` | `Windows` | `Windows` |
| `deviceSystem.linux` | `Linux` | `Linux` |
| `deviceUnknownSystem` | `{{system}} 设备` | `{{system}} device` |
| `devicePlatform.iphone` | `iPhone` | `iPhone` |
| `devicePlatform.ipad` | `iPad` | `iPad` |
| `devicePlatform.android` | `Android` | `Android` |
| `devicePlatform.androidVersion` | `Android {{version}}` | `Android {{version}}` |
| `devicePlatform.macintosh` | `Macintosh` | `Macintosh` |
| `devicePlatform.windows` | `Windows` | `Windows` |
| `devicePlatform.linux` | `Linux` | `Linux` |
| `userAgentLabel` | `原始 UA` | `Raw user agent` |

说明：

- 专有名词按研究 `06` 的「做法 A」进 i18n，两个语言写同值（android/windows/linux 三组在 `deviceSystem` 与 `devicePlatform` 之间重复一次）；这是刻意的，换取「所有用户可见字符串都在 `resources.ts`」的既有惯例，以及键名类型检查覆盖到新文案。
- 两档未知态各有独立键：tier-1 用 `deviceUnknownSystem`（新键），tier-2 复用既有 `unknownDevice`（`:275` / `:693`），不新增重复语义的键。
- 数量词不做复数：本组文案均为单数名词，不引入 `_one` / `_other`。
- 新增键必须在 zh-CN 块先存在（`i18next.d.ts:6`），否则 `t()` 类型不认。

## 5. 测试设计

### 5.1 纯函数单测（新建 `apps/web/tests/unit/pages/account/session-device-model.test.ts`）

表驱动，输入集取 §2.4 全部 A/B/C/D/E 样本：

- `it.each` 断言 `system` / `deviceType` / `platform` / `platformVersion` 四字段，**不断言整句**（文案由组件拼，避免改词就改测试）。
- 显式记录假设：`C1` 与 `B1` 结果相同、`C2` 与 `A2` 结果相同、`D1` 与 `B2` 结果相同 —— 用「相等断言 + 注释」把「Tauri 与浏览器不可分、iPadOS 桌面模式不可分」固化下来，未来若真机取样拿到不同 UA，测试会指出需要校准的位置。
- 边界：`null`、`undefined`、`""`、`"   "`、`curl/8.7.1`、1024 截断串、超长重复 token（不得抛错、不得灾难性回溯）。
- `shortSessionDeviceId`：标准 UUID → 4 位；`"abc"` → `"abc"`；`""` → `""`。
- **键覆盖漂移守卫**：遍历 `DEVICE_SYSTEM_KEYS` 与 `DEVICE_PLATFORM_KEYS` 的值，断言 `resources["zh-CN"]` 与 `resources.en` 在 `common.platformAccount.security.sessions` 下都存在该键（含 `userAgentLabel`）。这把 AC8 的「无缺键回退」变成可失败关闭的断言，而不是靠人眼比对两个语言块。

### 5.2 组件测试：6 处 UA 断言的替换

fixture（`account-security-page.test.tsx:46-63`）改为真实样本 + 真实 UUID：

- `currentDevice.id = "3a7f1c2e-…"`（后缀 `3a7f`），`userAgent` = A2（macOS Safari 全串）。
- `otherDevice.id = "9b2d4e6f-…"`（后缀 `9b2d`），`userAgent` = C1（Tauri iOS 全串）。

替换方式（原行号 → 新期望）：

| 行 | 原断言 | 新断言 |
| --- | --- | --- |
| `:297` | `findByText("Mozilla/5.0 (Macintosh)")` | `findByText("Macintosh · 3a7f")` |
| `:309` | `getByText("Mozilla/5.0 (iPhone)")` | `getByText("iPhone · 9b2d")` |
| `:312` | `name: "吊销 Mozilla/5.0 (iPhone) 的登录"` | `name: "吊销 iPhone · 9b2d 的登录"` |
| `:323` | 同上（点击） | 同上 |
| `:332` | `queryByText("Mozilla/5.0 (iPhone)")` 不存在 | `queryByText("iPhone · 9b2d")` 不存在 |
| `:425` | 同上（只读态） | 同上 |
| `:305` | `getByText("当前设备")` | 不改 |

不需要为 `getByText` 担心的细节：拆成 head + 后缀两个文本节点后，`<p>.textContent` 仍是 `Macintosh · 3a7f`，Testing Library 的默认归一化匹配命中该 `<p>`。

### 5.3 组件测试新增用例

1. **tier-1 与 tier-2 分开**：加第三个 fixture（`iPod touch` UA，后缀 `5c1e`）断言可见 `iOS 设备 · 5c1e`；加第四个 fixture（`userAgent: null`，后缀 `7d40`）断言可见 `未知设备 · 7d40`，并断言两条文案互不相等（AC3a）。
2. **同系统不同端类型**：iOS 浏览器行（`iPhone · …`）与 iOS tier-1 行（`iOS 设备 · …`）同时存在时文案不同。
3. **图标分支**：对各行断言 `data-device-type` 为 `desktop` / `phone` / `unknown`（沿用既有 `closest("li")` 取行范式）。
4. **原始 UA 仍可见**（AC5/DR9）：`screen.getByText(<A2 全串>)` 在该行内可见；`userAgent: null` 的行不渲染该 `<dl>` 行。
5. 沿用既有 `vi.mock("~/lib/api")` 与 `sendSessions` 桩，不新增 mock 机制。

### 5.4 明确不动的测试

- `apps/web/tests/unit/lib/api/endpoints/platform-account-security.test.ts:31` 的 `userAgent: "Mozilla/5.0 (Macintosh)"`：端点契约测试，wire 数据未变，保持。
- `native-glass*` / `theme-toggle` / `native-image` 里的 UA 字面量：不同模块，保持。
- 无 e2e 覆盖设备列表（`app-account.spec.ts` 与 `admin-accounts.spec.ts` 均不含 `userAgent` / 吊销断言），本任务不新增 e2e。

## 6. 风险清单

| 风险 | 用户会看到什么 | 处置 |
| --- | --- | --- |
| iPadOS 桌面模式 UA 与桌面 Safari 完全一致 | iPad 上的一条会话显示 `Macintosh` | 数据层不可解（服务端拿不到 `maxTouchPoints`，历史行无补强字段）。接受，并在单测里用 `C2 === A2` 固化；真正的修复需要自定义 UA 或新列，属 Out of Scope |
| Tauri iOS/Android 与同平台浏览器不可分 | 应用会话与 Safari 会话都显示 `iPhone`，只靠 `· 3a7f` 区分 | 产品已接受（DR5 用后缀保证可区分，Out of Scope 只承诺启发式）。单测固化 `C1 === B1`、`D1 === B2` |
| 1024 截断丢掉 `Mobile` | Android 手机被画成平板图标 | 平台词不随端类型变化，因此文案仍为 `Android <版本>`，只有图标不同；属可接受降级 |
| 截断丢掉 `iPhone`/`iPad` | 显示 `iOS 设备 · …`（tier-1） | 少说而不是说错，符合「宁可未知不编造」 |
| Windows Phone UA 内嵌 `Android` | 若探针顺序写反，WP 设备显示 `Android` | 规则表把 `Windows Phone` 放在第一位，E6 用测试锁住 |
| 误判导致用户吊销错行 | 安全操作打到了另一台设备 | 三重缓解：① 探针保守，绝不用 `Mozilla/5.0` / `AppleWebKit` 单独推断系统；② `· 后缀` 由主键派生，稳定可辨识；③ 原始 UA 行始终可见，用户可自查 |
| 4 位后缀碰撞 | 同平台两行后缀相同 | 单帐号同平台会话数现实 ≤ 20，概率 ≤ 0.3%；碰撞时两行仍以原始 UA / IP / 时间可区分，不做额外处理 |
| 新键漏加一边语言 | 英文界面混入中文（`fallbackLng` 静默回落） | `session-device-model.test.ts` 的键覆盖漂移守卫 + `typecheck` 双重拦截 |

## 7. 验收映射

| AC | 落点 |
| --- | --- |
| AC1 / AC6 | §2.4 规则表 + `session-device-model.test.ts` 表驱动 |
| AC2 | §2.3 端类型阶段（平板归属 `tablet`，无空白/串味） |
| AC3 | `shortSessionDeviceId` + `id` 为轮换不变量 |
| AC3a | §3.2 三档 + §5.3 用例 1 |
| AC4 | §3.4 图标表 + `data-device-type` 断言 |
| AC5 | §3.3 `<dl>` 行 + §5.3 用例 4 |
| AC7 | §5.2 的 6+2 处替换 |
| AC8 | §4 键表 + §5.1 键覆盖守卫 |
| AC9 | 改动面只落在 `apps/web/app/{pages,i18n}` 与 `apps/web/tests`，`packages/contracts` 与 `apps/api` 零 diff |
