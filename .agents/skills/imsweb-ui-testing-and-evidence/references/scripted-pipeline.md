# 脚本化截图、归并和 LLM 补充

普通桌面 Web 与正常手机响应式布局参见 [Web 批量捕捉](web-capture.md)，使用同一 CLI 的 `init --scope web`，无需原生模拟器或 Maestro。

批量任务优先使用 `scripts/ui-acceptance.mjs`。脚本完成设备发现、Maestro 执行、原生 PNG、回执、跨主机归并和目录式报告；LLM 只负责补齐业务 flow、定位失败、审图和补充说明。已有 flow 的每个点击、截图、重试和文件归并不再逐步交给 LLM。

以下命令从仓库根运行。`UI` 仅为示例 shell 变量，不增加 package script：

```sh
UI=.agents/skills/imsweb-ui-testing-and-evidence/scripts/ui-acceptance.mjs
node --experimental-strip-types "$UI" init --output data/verification/ui-plan-01
node "$UI" devices --platform android
```

## 配置一次，之后批量运行

`init` 从权威 App 路由生成全部页面目录、冻结源码文件 hash，并提供首页、社区、资料目录三个冒烟示例。**三个示例不是全量业务通过**；未配置的必需场景保持 UNRUN。按照实际业务 owner，把现有 `apps/web/tests/native/` Maestro flow 加入 `plan.json.scenarios`，或编写对应的断言流程。动态页面、身份、错误态、真实供应方与 fixture 各自明确场景和数据来源。

每条场景声明 `id / pageId / scenarioId / flow`，可带 `platforms`、`timeoutMs`、`required`。flow 路径相对 plan；其中 `{{appId}}` 是本脚本的模板参数，会在执行副本里替换为目标包名。原 flow 不改写。流程初态、事件等待和业务断言归 flow 所有，脚本不猜测页面、不改 token、不清应用数据、不用整页 reload 做隔离。

修改 plan 的 `targets[].dataMode` 为实际来源。机器配置另存于忽略目录或仓库外，例如：

```json
{
  "tools": { "maestro": "/本机/Maestro/bin/maestro" },
  "devices": { "android": "实际emulator序号", "ios": "实际模拟器UDID" },
  "bindings": { "android": "/本机/android-binding.json" },
  "env": { "JAVA_HOME": "/本机/JDK21" }
}
```

工具默认使用 PATH、`ANDROID_HOME` / `ANDROID_SDK_ROOT` 与 `MAESTRO_BIN`。devices/bindings 的 key 对应 plan 中的 target ID；相对配置路径按环境文件目录解析。只有一个已启动手机模拟器时可省略设备 ID；多个目标会明确报错，不任意挑选。Android 自动发现排除物理设备、小于 350dp 的小屏和 600dp 起的平板；iOS 只发现 Mac 上已启动的 iPhone 模拟器。默认捕获竖屏，实际横屏不会冒充默认范围通过。

构建安装继续使用 `pnpm run app:doctor`、`pnpm run app devices`、`pnpm run app android` / `pnpm run app ios`。本脚本只操作已经准备好的、任务自有模拟器。Maestro / Java 由各主机提供，不自动安装工具、不改签名或 SDK。

若需要形成当前原生覆盖，提供源码/构建绑定：

```json
{
  "source": { "commit": "实际commit", "dirty": true, "fingerprint": "冻结源码fingerprint" },
  "binarySha256": "实际构建产物的64位sha256",
  "buildReceipt": "构建与源码对应关系的实际回执或其内容"
}
```

Android 的 binary 是 APK；iOS 是 `.app` 内 `CFBundleExecutable`。脚本检查 source 与目录一致，再读取实际安装 APK/可执行文件的 hash 对照，保存新的安装核对回执。构建到源码的对应关系仍需由交付 owner 提供，不能只把当前安装 hash 填成期望值。缺少 binding 可以收图，但不会自动形成当前原生 PASS。

```sh
node "$UI" run \
  --plan data/verification/ui-plan-01/plan.json \
  --environment ~/.config/imsweb/ui-capture.json \
  --platform android \
  --output data/verification/ui-run-01
```

`run` 顺序完成 capture → collect → report。即使部分 flow 失败，仍归并失败和诊断截图并生成报告，进程返回非零。每次输出目录均为新目录；同一模拟器的场景串行执行，不运行内部自动重试。显式重跑得到新的 capture ID，旧记录继续保留。

## 多环境分别采集，再自动归并

iOS capture 在 Mac 执行，Android capture 在其 SDK 所在的 macOS/Linux 主机执行。plan 和冻结 manifest 保持相同；机器工具路径、设备 ID、JDK 与绑定放各自环境文件。跨机传输整个 capture 目录即可，未把 SSH、某个主机 IP 或检查路径写进采集器。

```sh
node "$UI" capture --plan /共享计划/plan.json --environment /本机/environment.json \
  --platform ios --output /本机/capture-ios-01

node "$UI" collect \
  --capture data/verification/capture-android-01/capture.json \
  --capture data/verification/capture-ios-01/capture.json \
  --output data/verification/ui-collected-01
```

归并要求相同目录和源码，校验原图 hash、唯一身份及关联。保留所有尝试、真实 exit/signal/timeout、渲染 flow、stdout/stderr、JUnit 和绑定，不按文件名猜页面，不选择最后一次 PASS 抹掉失败。中断后已有 `capture.json` 可单独归并；缺失场景由目录显示为 UNRUN。

## 报告先出，LLM 后补

`run` 输出页面验收工作台 `report/index.html`，`collection/` 中有 manifest、`review-queue.json`、`review-request.md` 和 `review-gallery.html`。`collect` 的报告位于其输出目录的 `report/`。目录式图片不嵌入数百 MB base64；完整目录可复制，或用小型 HTTP server 跨机查看。最终入口遵循 [页面与交付约定](../SKILL.md#报告页面与交付)。

LLM 先读队列里的 `attention`，再按批次直接打开对应图片。仅需说明时添加 notes，未实际看图的记录保持 NOT_REVIEWED。待审图不阻塞报告生成，也不自动标为视觉通过。队列给出精确输入 hash 和 JSON 格式。

LLM 完成后保存 JSON，再导入到**新的**审阅轮次：

```sh
node "$UI" review \
  --manifest data/verification/ui-run-01/collection/manifest.json \
  --annotations data/verification/llm-review-01.json \
  --output data/verification/ui-reviewed-01
```

导入核对 manifest/image hash 和审阅者/model/method；文字推断只能补说明。原始 verdict、命令、退出码、源码与绑定不改写。视觉拒绝记录保留；修复后采集新图。新报告在 `ui-reviewed-01/report/` 展示补充说明、审阅者及回执；原报告继续保存。

`review` 不内置厂商 API 或假定某个模型凭据；可以由当前视觉 LLM/代理消费请求文件，也可以由外部 LLM CLI 生成符合协议的 JSON。只有这个复核阶段需要模型介入。

## App 与 Web 同页交付

分别完成 App / Web 的归并和审阅后，向生成器传两次 `--manifest`，直接产出一个工作台：

```sh
node .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.mjs \
  --manifest data/verification/app-reviewed-01/manifest.json \
  --manifest data/verification/web-reviewed-01/manifest.json \
  --output data/verification/combined-01/report \
  --asset-mode directory
```

一个输入只含 App 目录，另一个只含 Web 目录；清单中的用例 ID 和截图 ID 必须全局唯一。生成器按各输入目录解析截图、回执和 binding 路径，保留原输入字节与 SHA-256；App / Web 的同名 run 绑定使用独立目录。两类目录和源码身份独立，联合呈现不会改变原执行、审图或覆盖结论。

`index.html` 在同一界面提供移动端 / Web Tab，以及 iOS / Android 或桌面 / 手机环境切换。联合模式的 `inventory.json`、`coverage.json` 使用 `version: 2`，在 `app` / `web` 下分别保留原目录和结果；单类型输出结构保持不变。交付这个新工作台的直接链接。

## 验证

```sh
node --test .agents/skills/imsweb-ui-testing-and-evidence/scripts/ui-acceptance.test.mjs \
  .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.test.mjs \
  .agents/skills/imsweb-ui-testing-and-evidence/scripts/app-report-model.test.mjs
node .agents/skills/imsweb-ui-testing-and-evidence/scripts/check-app-report.mjs \
  --report data/verification/ui-reviewed-01/report \
  --output data/verification/ui-reviewed-01/report-check
pnpm run check:rules
```

模拟器命令测试和报告 UI 检查分别报告；测试替身不作为真实原生证据。报告检查覆盖长缩略图条、主图容纳、较矮窗口及常规手机阅读视口，不扩展 App 原生设备矩阵。
