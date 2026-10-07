# i18n 现状与加键规则

文件：`apps/web/app/i18n/resources.ts`（834 行）。
结构：单个 `export const resources`（`:4`），两个语言键 `"zh-CN"` 与 `"en"`，命名空间 `common`（`:1` `defaultNamespace`）。

## 1. 现有键

安全页 sessions 分组：

- 中文块：`:267-291`
- 英文块：`:685-708`

| 键 | 中文（行） | 英文（行） |
| --- | --- | --- |
| `title` | 登录设备（268） | Signed-in devices（686） |
| `description` | 这些设备上的登录仍然有效。（269） | These devices still hold a valid sign-in.（687） |
| `loading` | 正在载入登录设备（270） | Loading signed-in devices（688） |
| `reload` | 刷新列表（271） | Refresh list（689） |
| `empty` | 没有其他有效的登录记录。（272） | No other sign-ins are active.（690） |
| `loadFailed` | 登录设备载入失败，请重试。（273） | The device list could not be loaded. Try again.（691） |
| `currentBadge` | 当前设备（274） | This device（692） |
| `unknownDevice` | 未知设备（275） | Unknown device（693） |
| `unknownAddress` | 未记录 IP（276） | No IP recorded（694） |
| `addressLabel` | IP 地址（277） | IP address（695） |
| `createdAtLabel` | 登录时间（278） | Signed in（696） |
| `lastSeenAtLabel` | 最后活跃（279） | Last active（697） |
| `neverSeen` | 暂无活跃记录（280） | No activity recorded（698） |
| `revoke` / `revoking` | 吊销 / 正在吊销（281-282） | Revoke / Revoking（699-700） |
| `revokeLabel` | 吊销 {{device}} 的登录（283） | Revoke the sign-in on {{device}}（701） |
| `revoked` | 该设备的登录已吊销。（284） | That device has been signed out.（702） |
| `revokeFailed` | 吊销失败，请稍后重试。（285） | The sign-in could not be revoked. Try again later.（703） |
| `notFound` | 该登录记录已经失效。（286） | That sign-in is no longer active.（704） |
| `revokeOthers` / `revokingOthers` | 登出其他所有设备 / 正在登出（287-288） | Sign out all other devices / Signing out（705-706） |
| `revokedOthers` / `revokedOthersNone` | 已登出其他 {{count}} 台设备。/ 没有需要登出的其他设备。（289-290） | （707-708） |

既有事实：当前**没有任何**与系统名、端类型、浏览器名相关的键。整个 `resources.ts` grep `iOS|Android|macOS|Windows|Linux|iPad|iPhone` 零命中，即这些专有名词在 i18n 里目前不存在。

## 2. 加键规则（从现有代码归纳）

1. 同一组键在两个语言块用**完全相同的键名**，且必须在 `zh-CN` 里先存在。`apps/web/app/i18n/i18next.d.ts:6` 把资源类型定义为 `(typeof resources)["zh-CN"]`，`t()` 的键名类型检查以中文块为准。只加英文键不会得到类型补全。
2. 键名用 camelCase，落在 `common.platformAccount.security.sessions` 下，与 `unknownDevice` / `currentBadge` / `revokeLabel` 同一层。
3. 插值用 `{{name}}`，与 `revokeLabel`、`revokedOthers` 一致。复数用 `_one` / `_other` 后缀，`revokedOthers` 目前是单键加 `(s)` 写法，属于既有的偷懒写法，新键不必模仿。
4. 英文缺键会回落中文（`config.ts:10` `fallbackLng: defaultLanguage`），所以漏翻译不会报错，但会出现中英混排，check 阶段也不会拦。
5. 语言只有 `zh-CN` 与 `en`（`resolveLanguage` 在 `language.ts:6-19` 只识别这两个前缀），没有第三种语言要照顾。

## 3. 专有名词是否需要重复

两种做法都能跑，取舍如下。

**做法 A：专有名词进 i18n，两个语言写同样的值。**
符合「所有面向用户的文案都在 `resources.ts`」的现有惯例。代价是两个语言块各写一遍 `iOS` / `Android` / `Windows` / `macOS` / `Linux`，且后续加语言要跟着加。适合需要把「端类型」也做成词条（如 `clientTypeApp` = 应用 / App）的场景。

**做法 B：专有名词作为解析器常量，只有包裹词进 i18n。**
解析器返回结构（system code、client kind code），组件只对「应用 / 浏览器 / 未知」这类需要翻译的部分取词。专有名词由解析器输出，不入 i18n。

**推断（非既有事实）**：做法 B 的重复更少，也更符合「解析结果结构化、文案由组件拼」的可测性要求（见 `05-test-infrastructure.md`）。但仓库目前没有把用户可见字符串放在 i18n 之外的先例，grep `resources.ts` 之外的硬编码中文文案会命中 `session-device-section.tsx` 吗：不会，该组件所有文案都走 `t()`。所以做法 B 会是第一个例外，需要在实现说明里写清理由；如果审核偏好保守，选做法 A，把 `ios` / `android` / `windows` / `macos` / `linux` 五个键在两边写成相同值即可。

## 4. 建议新增的键（推断，供设计确认）

只列键名与用途，不预定最终措辞：

| 键 | 用途 |
| --- | --- |
| `deviceSystem.*` 或 `device.system.ios` 等 | 系统名，做法 A 时使用 |
| `clientTypeApp` | 端类型「应用 / App」 |
| `clientTypeBrowser` | 端类型「浏览器 / Browser」 |
| `clientTypeUnknown` | 端类型未知 |
| `deviceLabel`（带 `{{system}}` / `{{client}}` / `{{name}}` 插值） | 可选，若整行标题要一次成句 |

若沿用现有 `unknownDevice` 作为完全无法解析时的回落，可以不加 `clientTypeUnknown`，两者语义会在同一行重复，需要产品先定清楚「未知设备」与「已知系统但未知端类型」是否分开显示。
