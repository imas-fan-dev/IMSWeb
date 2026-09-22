# 解析函数需要处理的真实 UA 样本清单

推导链（全部既可追溯又有边界，逐条标注性质）：

1. 写入侧的取值是 `c.req.header('user-agent')`，trim 后按 1024 截断（`apps/api/src/domains/identity/platform-auth/contracts/session.ts:136-151`）。**既有事实。**
2. 因此样本集合 = 能打到平台登录 / 注册 / OAuth 回调三个入口的所有客户端（`login.ts:157`、`register.ts:90`、`oauth-login.ts:162`）。**既有事实。**
3. 这三个入口都是浏览器或 WebView 发起的页面请求：OAuth 回调在浏览器里完成，处理器最后 `c.redirect(..., 303)`（`oauth-login.ts:169`）。**既有事实。**
4. Tauri 未配置自定义 UA，WebView 用系统默认值（见 `04-tauri-vs-browser-detection.md` 第 4 节）。**既有事实。**
5. 历史行 `user_agent` 为 NULL，迁移无回填（`20260902120000_platform_session_devices.sql` 注释）。**既有事实。**
6. 具体 UA 字面量属于平台 WebView / 浏览器默认值。**推断**，需要真机与真实浏览器取样确认后再固化进测试。

不相关但容易混淆的一条：`apps/api/src/infra/oauth/platform-oauth-client.ts:331` 里的 `'User-Agent': 'IMSWeb-Platform-OAuth'` 是 API 出站请求第三方 userinfo 接口时用的，从不写进会话行。解析器不应把它当作可出现的形态。

## 样本清单

### A. Web 构建，桌面浏览器（真实存在）

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0
Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0
```

要点：`Macintosh` 同时出现在 Chrome 与 Safari；`Windows NT 10.0` 需要映射到 Windows 10/11（UA 本身不区分）；`X11; Linux` 是 Linux 桌面。Chromium 系 UA 里 `Chrome/... Safari/537.36` 是固定搭配，不能用 `Safari` 一词判 Safari，要靠 `Version/... Safari/605` 或有无 `Chrome/` / `Firefox/` / `Edg/` 区分。

### B. Web 构建，移动浏览器（真实存在）

```
Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1
Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36
```

### C. Tauri 打包客户端，iOS（推断，待真机确认）

WKWebView 默认 UA，无 `Version/` 与 `Safari/604` 段：

```
Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148
```

iPad 上系统可能上报桌面模式（`Macintosh` + `maxTouchPoints > 1`），UA 会变成：

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15
```

注意第二例与桌面 Safari 的 UA 完全相同。既有代码 `native-glass.ts:52-53` 靠 `platform === "MacIntel" && maxTouchPoints > 1` 补救，但历史会话里没有 `maxTouchPoints`，服务端也无法拿到。**这是解析器无法解决的歧义**，需要产品接受或走第 6 节的补强方案。

### D. Tauri 打包客户端，Android（推断，待真机确认）

Android WebView 默认 UA，带 `; wv` 与 `Version/4.0`：

```
Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36
```

### E. 边界与退化输入（真实存在）

| 形态 | 产生条件 | 期望行为 |
| --- | --- | --- |
| `null` | 客户端未发 UA 头，或该行是迁移前的历史会话 | 显示 `unknownDevice`（`resources.ts:275` / `:693`） |
| `""` | 逻辑上不可能（`boundedHeader` 对空串返回 `null`，`session.ts:137-139`），但 `\|\|` 回落已覆盖 | 与 `null` 同路 |
| 长度 1024 的截断串 | 超长 UA 被 `slice(0, 1024)` 截断，可能停在某个 token 中间 | 不能因为末尾缺 `)` 就抛错；解析要按前缀匹配，遇到截断就退化为已知的系统/端类型或未知 |
| 任意自定义串 | 直接调 API 的脚本、SDK、curl | 不能抛错，回落到未知 |
| 旧系统 / 罕见 UA | 老 Android（`Android 4.x`）、Windows Phone、KaiOS 等 | 未知或仅识别系统 |

## 解析函数的行为要求（据此清单倒推）

1. 输入 `string | null | undefined`，永不抛错，任何形态都有返回值。
2. 输出建议结构化：`{ system: code | null, clientKind: "app" | "browser" | null, browserName?: code | null }`，由组件用 i18n 拼句子（理由见 `06-i18n-keys.md` 第 3 节）。
3. 判定顺序要先端类型后浏览器：Tauri iOS 与 iOS Safari 的区分点是 `Safari/` 段的有无（C 组 vs B 组）；Tauri Android 与 Android Chrome 的区分点是 `; wv` + `Version/4.0`（D 组 vs B 组）。
4. 「设备名」这一项现有数据里没有硬件型号（Android 桌面模式的 `Macintosh` 与 iOS 的 `iPhone` 只是平台名）。若产品要的是「iPhone 15 Pro」这类具体名称，现有数据做不到，需要写侧补字段，必须回到产品确认。
5. 建议为 C / D 两组先写一条「待真机取样后校准」的测试占位，把假设显式固定下来，避免解析器和真实 WebView 悄悄漂移。
