# 调研索引：设备列表简短标记展示

子任务：`.trellis/tasks/09-18-account-security-device-display`
范围：只读调研，未改任何代码。全部结论带 `file:line` 锚点，事实与推断分列。

## 结论速览

| 问题 | 结论 | 详见 |
| --- | --- | --- |
| 1. 当前渲染逻辑 | `userAgent` 是整行主标题（`session-device-section.tsx:205-207`、`:221-223`），原样展示，无 JS 截断，只靠 CSS `break-all` 折行。图标写死 `LaptopIcon`（`:215-218`）。最小插入点是 `:205-207` 一处赋值，图标另在 `:215-218`。 | `01-device-list-render.md` |
| 2. 是否已有 UA 工具 | 不存在。两个 workspace 的 package.json 都没有 UA 解析库；lockfile 里的 `bowser` 是 `@aws-sdk/core` 的传递依赖，不可用。只有 `native-glass.ts:46-71` 两个运行时正则，签名对历史 UA 不适用。 | `02-ua-parsing-tooling.md` |
| 3. 会话里的设备信息 | 只有 `user_agent` 与 `ip_address`，来自 `contracts/session.ts:143-151` 的原始请求头，trim 后截 1024。没有 device id、没有 client 类型。刷新轮换不更新这两列。历史行为 NULL。 | `03-session-record-and-write-path.md` |
| 4. Tauri / 浏览器区分 | 客户端有 `isTauri()`（WebView 注入的 JS 全局，`@tauri-apps/api/core.js:278-281`）与构建期 `IS_APP_TARGET`（`app-target.ts:8`），但服务端完全看不到。Tauri 未设置自定义 UA，所以列表只能靠 WebView UA 特征启发式判断，不能保证准确。 | `04-tauri-vs-browser-detection.md` |
| 5. 测试基建 | fixture 是 `account-security-page.test.tsx:46-63` 的两个字面量对象；有 7 处断言直接匹配 UA 原文（`:297`、`:305`、`:309`、`:312`、`:323`、`:332`、`:425`），改展示层必须同步改。纯函数单测建议新建 `tests/unit/pages/account/account-security-model.test.ts`。 | `05-test-infrastructure.md` |
| 6. i18n | sessions 分组在 `resources.ts:267-291`（zh）与 `:685-708`（en），无任何系统名或端类型键。新键需同名加到两个语言块，键名类型以 zh-CN 为准（`i18next.d.ts:6`）。专有名词是否入 i18n 有两种做法，需产品确认。 | `06-i18n-keys.md` |

附：`07-ua-samples.md` 给出解析器要覆盖的真实 UA 样本清单（浏览器、Tauri iOS、Tauri Android、边界输入）。

## 需要产品 / 设计先定的三点

1. 「简短唯一标记」的「唯一」用什么保证。UA 相同的两台同型号设备无法区分，`id` 唯一但不可读。需要定：标签 + 后缀、短 id，还是接受重复。
2. 「设备名」指什么。现有数据只有平台词（`iPhone`、`Macintosh`、`Linux; Android 14`），没有硬件型号。要具体型号就得改写入侧。
3. 「已知系统但端类型未知」与「完全未知设备」是否分开显示。`unknownDevice` 词条目前只有一条。

## 关键风险

- Tauri 自定义 UA 未配置，因此 iOS 应用与 iOS Safari 的区分是启发式。iPadOS 桌面模式的 UA 与桌面 Safari 完全相同，历史会话无法补救。
- 改 `deviceLabel` 会同时改变吊销按钮的无障碍名，现有 7 条断言会失败，属预期改动，需在实现任务里显式列出。
