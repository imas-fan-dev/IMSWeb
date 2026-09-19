# 测试基建

主文件：`apps/web/tests/unit/pages/account/account-security-page.test.tsx`（截至当前 430 行）。
配置：`apps/web/vitest.config.ts`（环境 jsdom，`setupFiles: ["./tests/setup.ts"]`，include `tests/unit/**/*.{test,spec}.{ts,tsx}`）。

## 1. 运行语言是中文（既有事实）

`apps/web/tests/setup.ts` 的 `afterEach` 调用 `i18n.changeLanguage(defaultLanguage)`；`apps/web/app/i18n/resources.ts:2` 定义 `defaultLanguage = "zh-CN"`，`config.ts:15` 也用 `lng: defaultLanguage` 初始化。

所以该测试文件里的断言直接写中文文案（如 `"当前设备"`、`"吊销 ... 的登录"`），不走 `t()` 取词。

## 2. PlatformSessionDevice fixture 的构造方式

没有 import 契约类型，直接用字面量对象（`account-security-page.test.tsx:46-63`）：

```
const currentDevice = {
  id: "session-current",
  current: true,
  userAgent: "Mozilla/5.0 (Macintosh)",
  ipAddress: "203.0.113.7",
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_500_000,
  expiresAt: 1_800_000_000_000,
}

const otherDevice = {
  id: "session-other",
  current: false,
  userAgent: "Mozilla/5.0 (iPhone)",
  ipAddress: "198.51.100.4",
  createdAt: 1_700_000_100_000,
  lastSeenAt: null,
  expiresAt: 1_800_000_000_000,
}
```

两个 fixture 覆盖了 `lastSeenAt` 有值与为 `null` 的两条分支。UA 字符串是刻意缩短的假值：`"Mozilla/5.0 (Macintosh)"` 与 `"Mozilla/5.0 (iPhone)"`，只保留括号内的平台词。注意这两条都是**不完整 UA**，真实浏览器 UA 还会带 `Intel Mac OS X ...` / `CPU iPhone OS ... like Mac OS X` 等段，新解析器不能只依赖截断到第一个 `)` 的形态。

注入方式：`vi.mock("~/lib/api", ...)`（`:33-44`）替换 `getPlatformSessionDevices` 等端点函数为返回 `{ send: apiMocks.sendSessions }` 的桩（`:130-132`），再由 `:150-153` 设置

```
apiMocks.sendSessions.mockResolvedValue({
  success: true,
  sessions: [currentDevice, otherDevice],
})
```

## 3. 现有断言如何依赖 userAgent 原文

| 行 | 断言 |
| --- | --- |
| `:297` | `await screen.findByText("Mozilla/5.0 (Macintosh)")` |
| `:305` | `within(currentItem).getByText("当前设备")` |
| `:309` | `screen.getByText("Mozilla/5.0 (iPhone)").closest("li")` |
| `:312` | `getByRole("button", { name: "吊销 Mozilla/5.0 (iPhone) 的登录" })` |
| `:323` | 同一按钮名，用于点击 |
| `:332` | `screen.queryByText("Mozilla/5.0 (iPhone)")` 断言被移除 |
| `:425` | 同一按钮名，只读态下断言 `toBeDisabled()` |

既有事实：**这 7 处会在展示层改成解析标签后全部失败**，因为主文案与吊销按钮的无障碍名都读同一个 `deviceLabel`（`session-device-section.tsx:205-207`、`:271-274`）。改解析逻辑时这些断言必须同步更新，属于预期改动而不是回归。

`:305` 的 `"当前设备"` 来自 `currentBadge` 词条，与 UA 无关，不需要改。

## 4. 新增解析逻辑后该补的测试

**位置一：纯函数单测，新建 `apps/web/tests/unit/pages/account/account-security-model.test.ts`。**
现状核查：`apps/web/tests` 下 grep `account-security-model` 零命中，也就是说 `account-security-model.ts` 的现有导出（`formatTimestamp`、各错误判定）目前没有专属单测，只被页面测试间接覆盖。新增纯函数放这里符合 `*.test.ts` 命名与就近原则。

范式建议：
- 直接 `import { describeDevice } from "~/pages/account/security/account-security-model"`，不需要 `MemoryRouter` 或 `vi.mock`。
- 用 `it.each` 覆盖 `07-ua-samples.md` 列出的样本：桌面三引擎、iOS Safari、Android Chrome、Tauri iOS WebView、Tauri Android WebView、`null`、空串、超长截断串。
- 断言解析结果的结构化字段（system / clientKind / label），不要断言整个句子，否则每次改文案都要改测试。这一步是可测性设计的一部分：纯函数最好返回结构而不是成品句子，句子由组件用 `t()` 拼。

**位置二：页面测试，沿用 `account-security-page.test.tsx`。**
- 把 `:46-63` 两个 fixture 的 `userAgent` 换成真实样本（例如 Mac 用 `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15`，iPhone 用 Tauri WebView 形态），再同步更新 `:297`、`:309`、`:312`、`:323`、`:332`、`:425` 的期望文本。
- 新增一条「同一系统不同端类型能区分」的用例：加第三个 fixture（iOS 浏览器 vs iOS 应用），断言两行拿到不同的 `clientKind` 文案。这是本次需求的验收核心。
- 新增一条未知 UA 用例：`userAgent: null` 时整行显示 `unknownDevice`（`:275` 词条「未知设备」），且吊销按钮名回落到同一文案。
- 若解析器给图标加了 `data-*` 标记，可在 `:299-311` 已有的 `closest("li")` 取行范式上追加属性断言。

**不需要动的测试**：`apps/web/tests/unit/lib/api/endpoints/platform-account-security.test.ts:31` 里的 `userAgent: "Mozilla/5.0 (Macintosh)"` 属于端点契约测试，解析不改变 wire 数据，保持不变。

## 5. 推断（非既有事实）

- 纯函数返回结构化结果而不是成品句子，是让上面两个测试文件都不依赖具体措辞的关键。现有代码里 `formatTimestamp` 就是纯函数返回字符串，已经有先例；但时间戳不需要拆分为多段排版，设备标签大概率需要。
- 如果解析器直接吃 `t` 并在内部拼句子，页面测试能过，纯函数测试就必须走 i18n 初始化，成本更高。
