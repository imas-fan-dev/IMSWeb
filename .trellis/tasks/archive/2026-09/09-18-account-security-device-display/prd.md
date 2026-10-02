# 网页端帐号安全页与设备标记展示

## Goal

网页端帐号安全页的设备列表不再把整段原始 User-Agent 当作设备名丢给用户看，而是给出可读的简短标记：操作系统、端类型（手机 / PC）、设备名。这是**纯展示层适配**——存储结构与 wire 契约的既有字段语义不变。

用户价值：用户能一眼认出"哪条是我当前这台设备"，从而正确执行"登出其他设备"这类安全操作。原始 UA 字符串让这个判断无法完成。

## Background

### 现有渲染逻辑

- `apps/web/app/pages/account/security/session-device-section.tsx:205-207` 是**唯一的标签计算点**，渲染（`:221-223`）与吊销按钮的无障碍名（`:271-274`）都读同一个 `deviceLabel`
- 图标写死在 `:215-218`，当前只有 `LaptopIcon`
- `userAgent` 是整行主标题，原样展示，没有 JS 截断，只靠 CSS `break-all` 折行
- `readOnly` 与 `refreshToken` 是既有 props；`refreshToken` 由页面在改密等外部失效后 bump

因此实现改动集中在 `:205-207`（标签）与 `:215-218`（图标）两处，加一个纯解析模块。

### 数据现实

- 会话记录只有 `user_agent` 与 `ip_address`（`apps/api/src/domains/identity/platform-auth/contracts/session.ts:143-151`），来源是请求头原文，trim 后截 1024
- 没有 device id，没有 client 类型；刷新轮换不更新这两列；迁移前的历史会话为 NULL
- 客户端有 `isTauri()`（WebView 注入的 JS 全局）与构建期 `IS_APP_TARGET`，但**服务端完全看不到**
- Tauri 未配置自定义 UA，因此「iOS 应用 / iOS Safari」只能靠 WebView UA 特征启发式判定，无法保证准确
- iPadOS 桌面模式的 UA 与桌面 Safari 完全一致，历史会话无法补救

### 无既有解析工具

两个 workspace 的 `package.json` 都没有 UA 解析依赖。lockfile 里的 `bowser` 是 `@aws-sdk/core` 的传递依赖，不可直接使用。`apps/web/app/lib/native-glass.ts:46-71` 的两个正则签名依赖本机 `navigator`，对历史记录不适用。解析逻辑需要自己写，且必须是可单测的纯函数。

### 测试与 i18n 现状

- fixture 是 `apps/web/tests/unit/pages/account/account-security-page.test.tsx:46-63` 的两个字面量对象
- 有 7 处断言直接匹配 UA 原文（`:297`、`:305`、`:309`、`:312`、`:323`、`:332`、`:425`），改展示层必须同步改，属预期改动
- i18n 的 sessions 分组在 `apps/web/app/i18n/resources.ts:267-291`（zh）与 `:685-708`（en），目前没有任何系统名或端类型键；新键需同名加到两个语言块，键名类型以 zh-CN 为准（`app/i18n/i18next.d.ts:6`）

### 约束

- 存储结构不变：不新增设备字段，不改 `platform_refresh_sessions`
- `packages/contracts/src/platform/account-security.ts:49` 的 `platformSessionDeviceSchema` 字段语义不变
- 解析逻辑为纯函数，不依赖运行时 `navigator`，可在 Node 测试环境直接断言
- 新增文案同时补 zh-CN 与 en

## Requirements

- DR1 设备列表以简短标记展示，取代原始 User-Agent 作为主标题
- DR2 标记能区分操作系统：iOS / Android / Windows / Linux / macOS
- DR3 标记能区分端类型：手机 / PC
- DR4 无从判定时降级到明确的未知态，不显示原始 UA，也不编造。已确认分两档：
  - 「已知系统但端类型未知」展示为带系统名的形态（如 `iOS 设备`）
  - 「完全未知设备」展示为通用未知态，与上一档文案不同
- DR5 同一用户的多个设备在列表中可区分。已确认采用**平台词 + 会话 id 前 4 位**的形式（如 `iPhone · 3a7f`）；后缀短、跨刷新稳定、不泄露凭据（`id` 本已在契约中暴露，吊销会话需要它）
- DR6 设备名使用**平台词**（`iPhone` / `Macintosh` / `Android 14`），不使用硬件型号——后者需要改写入侧，与约束冲突
- DR7 图标随**端类型**变化（手机 / 平板 / PC / 未知各一种），不再恒为 `LaptopIcon`。**不随系统变化**：Lucide 已移除品牌图形，没有 `Apple` / `Windows` 这类 OS 图标，系统差异由平台词承担
- DR8 解析为纯函数，不依赖运行时 `navigator`，覆盖浏览器、Tauri iOS、Tauri Android 及边界输入
- DR9 原始 UA 仍可被用户查看（作为次级信息或悬停/展开），以便用户自查与支持排障
- DR10 新增文案同时存在于 zh-CN 与 en，两档未知态各有一套
- DR11 展示层不改动存储、契约或 API

## Acceptance Criteria

- [x] AC1 iOS / Android / Windows / Linux / macOS 各能解析出对应系统标记，未知输入降级为未知态
- [x] AC2 手机与 PC 能区分；平板等模糊形态有明确定义的归属，不出现空白或串味
- [x] AC3 同型号但 UA 不同的设备可区分；UA 完全相同的设备靠 `id` 前 4 位后缀区分，后缀在会话刷新后保持稳定。测试 fixture 必须换掉现有的 `session-current` / `session-other`——两者 `slice(0,4)` 都是 `sess`，会掩盖后缀区分能力，本条无法被证明
- [x] AC3a 「已知系统但端类型未知」与「完全未知设备」渲染为不同文案，不存在两者撞成同一行的输入
- [x] AC4 图标随端类型变化（手机 / 平板 / PC / 未知），未知态有对应图标，且错误判定不会让图标与文案互相矛盾
- [x] AC5 原始 UA 仍可在界面上取到，不因改版丢失
- [x] AC6 纯函数单测覆盖真实 UA 样本清单与边界输入（空串、null、超长、畸形）
- [x] AC7 `account-security-page.test.tsx` 中依赖 UA 原文的断言同步更新（6 处断言 `:297/:309/:312/:323/:332/:425`，外加 2 处 fixture 字面量 `:49/:59`），改后测试通过。`:300` 附近是「当前设备」徽标断言，与 UA 无关，不要误改
- [x] AC8 zh-CN 与 en 均为新增文案补齐键，无缺键回退
- [x] AC9 `platformSessionDeviceSchema` 无字段增删或语义变更；无 API 层改动

## Out of Scope

- 存储结构变更与历史 User-Agent 回填
- 写入侧补充 device id / 硬件型号 / client 类型
- 服务端侧解析（解析只在 Web 展示层，API 契约与视图投影不动）
- 精确区分 Tauri 应用与同平台浏览器（受自定义 UA 缺失限制，只做启发式）

## Open Questions

- 无

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
