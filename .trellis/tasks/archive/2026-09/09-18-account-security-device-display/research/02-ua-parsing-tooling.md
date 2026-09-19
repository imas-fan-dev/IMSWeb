# 是否已有 User-Agent 或设备解析工具

结论：**不存在可直接复用的 UA 解析库或设备名生成工具，需要自己写。**

## 1. 依赖清单核查（既有事实）

`apps/web/package.json` 的 `dependencies` / `devDependencies` 全量读取，没有任何 UA 解析库。没有 `ua-parser-js`、`device-detector-js`、`platform`、`mobile-detect`、`react-device-detect`。

`apps/api/package.json` 同样没有。

根 `package.json` 的 dependencies / devDependencies 经 grep 过滤 `ua|device|useragent|bowser`，零命中。

## 2. lockfile 里的 bowser 是传递依赖

`pnpm-lock.yaml:3953` 有 `bowser@2.14.1`，出处是 `@aws-sdk/core` 的依赖（`pnpm-lock.yaml:9069`、`:9080` 两条 `bowser: 2.14.1` 都在 `@aws-sdk/*` 条目下）。

既有事实：`bowser` 只被 `apps/api` 的 AWS SDK 传递引入，`apps/web` 无法 import 它，`apps/api` 也不能在没有显式 `dependencies` 声明的情况下依赖它（仓库要求依赖留在所属 workspace，且传递依赖不可直接使用）。所以它不算可复用资产。

## 3. 仓库里现存的 UA 相关代码

只有一处，`apps/web/app/lib/native-glass.ts`：

| 位置 | 内容 |
| --- | --- |
| `:46-56` | `isIosRuntimeIdentity({ maxTouchPoints, platform, userAgent })`：`/\b(iPad\|iPhone\|iPod)\b/i.test(userAgent)` 或 `platform === "MacIntel" && maxTouchPoints > 1`（iPad 桌面模式） |
| `:69-71` | `isAndroidRuntimeIdentity(userAgent)`：`/\bAndroid\b/i.test(userAgent)` |
| `:73-80` | `isAndroidTauriRuntime()` 把 `IS_APP_TARGET && isTauri()` 与上面两个判定组合起来 |

这些函数的用途是决定是否调用原生插件（`:58-62`、`:82-84`），输入说的是**当前运行时自己的** device 身份，不是解析任意一条历史 UA。

可以复用吗：函数是 `export` 的，正则本身也能直接抄。但它们：
- 只区分 iOS / Android 两类，没有桌面系统、没有浏览器名、没有版本；
- 依赖 `navigator.maxTouchPoints` 与 `navigator.platform`（`:46-48`），这两个值对**别的**设备的 UA 拿不到，所以签名不适用于解析 `PlatformSessionDevice.userAgent`；
- `isAndroidTauriRuntime` 还依赖本机 `isTauri()`，对历史记录无意义。

既有事实层面的结论：正则片段可以借用，函数签名不可复用，等于需要新写一个纯 `string -> 描述` 的解析器。

## 4. Web 端其它 ad-hoc 判定

grep `apps/web/app` 里 `iPhone|Android|Macintosh|Windows NT|Linux x86|iPad` 的命中全部落在文档注释（如 `app-tab-bar.tsx:53`、`app-navigation-provider.tsx:281`）和上面那两个函数上。没有第二个 UA 解析入口。

`apps/web/app/lib/media/native-image.ts:37` 与 `native-glass-panel.ts:83` 也是把 `window.navigator.userAgent` 传给同一个 native-glass 判定，不产出设备名。

## 5. 推断（非既有事实）

- 新增一个约 40 到 80 行的本地正则解析器足够覆盖本项目真实会遇到的客户端（见 `07-ua-samples.md`）。引入 `ua-parser-js` 会新增一个运行时依赖，且该库体量（含正则数据）远超本页需求。
- 如果后续要做完整解析（浏览器版本、设备型号），再评估引入依赖更有依据。当前设备列表只需要「系统 + 端类型 + 设备名 / 浏览器名」三类标签。
