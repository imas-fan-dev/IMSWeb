# 全量 App 页面验收与报告

全量验收使用同一份页面目录，分别生成 iOS 与 Android 的场景覆盖。默认范围为**常规手机竖屏**：正常尺寸原生模拟器，浏览器辅助选 `app-iphone`、`app-android`。小屏、`app-small`、短横屏、平板和桌面不进入默认 App 功能矩阵；已存在的小屏图片保持历史辅助身份。按用户另行指定的专项范围执行补测。

## 1. 从权威路由建立目录

从仓库根执行，输出文件必须是新文件：

```sh
node --experimental-strip-types \
  .agents/skills/imsweb-ui-testing-and-evidence/scripts/create-app-inventory.mjs \
  --output data/verification/<run>/manifest.json
```

脚本读取 `apps/web/app/route-metadata.ts`，选择 App target、合并 canonical 别名、展开个人 section、保留动态模板和未找到页。五栏目归属直接使用路由元数据，不用截图数量推导页面数。新页面自动入目录；没有标题映射时使用路由作为可追踪标题，执行前补齐可读名称与业务场景。

生成的每页场景是**待执行计划**。逐页检查实际源码与入口，完成这些补充才开始运行：

- 入口、正常首屏、加载/空/错误、主操作、导航返回/重入。某个状态不适用时写明原因并标为补测，不静默删除必需业务能力。
- 私有页面覆盖登录前后与权限；表单覆盖真实键盘、校验、提交及失败恢复；媒体覆盖上传/预览/返回；动态详情选有名称的实际实例，并覆盖失效链接。
- 地图至少包含首次引导、事务所入口、真实地点搜索与选择、真实键盘、长按创建、附近地点候选及创建表单位置预填。真实供应方与 fixture 数据分别声明。

完成条件：目录包含全部 App 路由归一化页面；所有页面都有必需场景；每个动态/身份状态有明确实例或未完成原因。记录实际 `source.commit / dirty`；脏源码通过 `fingerprint` 绑定冻结的源文件清单和 hash。生成器仅比较身份声明，不自行认证来源。

## 2. 双平台独立执行并关联证据

按 [原生指南](native-app-ui.md) 与设备交付 owner 执行，iOS 使用 Mac 模拟器，Android 使用本机模拟器。一个 `run` 对应同一源码、包、设备、配置与数据模式。配置变化、重装或重试使用新身份，保留之前失败；实际设备名、OS、profile、方向从运行环境取得。

以下片段添加到生成的 manifest；示例表示协议，**不是已执行结果**。实际使用时将文件名、设备、版本、命令、退出码与结果替换为真实记录：

```json
{
  "app": {
    "inventory": "保留生成器输出的完整 inventory 对象",
    "runs": [
      {
        "id": "ios-run-01",
        "platform": "ios",
        "renderer": "ios-native",
        "device": "实际模拟器名称与标识",
        "os": "实际系统版本",
        "deviceClass": "standard-phone",
        "orientation": "portrait",
        "profile": "debug-self-contained",
        "dataMode": "实际后端或明确 fixture",
        "source": { "commit": "实际提交", "dirty": false },
        "binding": "bindings/ios-source-build-install.json"
      }
    ]
  },
  "cases": [
    {
      "id": "ios-home-initial-01",
      "title": "iOS 首页正常首屏",
      "renderer": "ios-native",
      "pageId": "home",
      "scenarioId": "initial",
      "runId": "ios-run-01",
      "required": true,
      "verdict": "UNRUN",
      "exitCode": null,
      "reason": "尚未执行"
    }
  ],
  "screenshots": []
}
```

执行后为用例保存实际 `command`、`receipt`、`exitCode`、`verdict` 与 `reason`。一条用例归属一个页面/场景/run，跨场景专项结果先拆出有回执支持的场景记录；拆分理由注明原始来源。同一回执不能凭摘要补造未执行的行为。

图片继续使用 [原有图片协议](results-and-screenshots.md)，通过 `caseId` 继承页面、场景与 run。例如：

```json
{
  "id": "ios-home-initial-screen",
  "title": "iOS 首页首屏",
  "caseId": "ios-home-initial-01",
  "renderer": "ios-native",
  "state": "initial",
  "kind": "runtime",
  "review": "NOT_REVIEWED",
  "path": "screenshots/ios-home-initial.png",
  "note": "实际设备、方向、数据模式和画面说明"
}
```

- `pageId`、`scenarioId`、`runId` 显式填写时必须与 owner 一致；跨页、跨 run、跨 renderer 关联会报错。页面 ID 是目录里的 slug，route 独立保存 `/`、参数和别名。
- DOM/Web 辅助图可只填 `pageId`，没有原生关联也能进 Dialog，但不贡献原生通过。没有页面关联的旧证据完整保存在 `evidence.html`。
- `binding` 是 manifest 相对路径，保存源码、构建 executable、实际安装 executable 的绑定及 hash；生成器读取原字节、复制并记录 SHA-256。记录回执不是认证来源，作者仍需核实内容。
- 运行结果与审图分开：命令通过后先保留 `review: NOT_REVIEWED`；逐图审阅后才记 PASS/REWORK。kind 为 diagnostic/reference 的图片保留实际身份。

## 3. 页面状态的计算规则

场景结果按平台独立计算。贡献**当前原生覆盖**需要：

1. `renderer` 为对应平台原生，run 明确常规手机竖屏，源码与目录一致；clean 源码提交相同，dirty 源码还须有一致且非空 fingerprint。
2. 有实际可读取的源码/包 `binding`；场景的必需用例有原始执行回执、命令与退出码。
3. 通过用例的退出码为 0，每个用例有同一 case/run 对应的 `runtime` 原生截图且审阅 PASS。

缺少证据保持 UNRUN；执行 BLOCKED 或 REWORK 原样显示；执行通过但截图 REWORK 的场景为 REWORK。同场景多次必需尝试按 REWORK → BLOCKED → UNRUN → PASS 汇总，后续 PASS 不抹除旧失败。若已修复失败是独立历史轮次，将其记录与实际源码/run 保持分离，而不是改写旧结论。

页面按必需场景聚合：有 REWORK 则 REWORK，其次 BLOCKED；全部 PASS 才 PASS；部分 PASS 为 PARTIAL；全部未完成为 UNRUN。PARTIAL 仅是页面/平台聚合状态，不扩展 case verdict。补测不补齐缺失的必需场景。清单内用例结果和全量页面覆盖各自报告，不能互相替代。

历史 commit、身份未知、其他尺寸/方向、App DOM/Web、参考/诊断图和未审图不会自动形成当前原生 PASS。图册仍可显示这些图片及其原始来源、执行结果、审图状态。缺失字段显示未知。

## 4. 生成并交付

```sh
node .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.mjs \
  --manifest data/verification/<run>/manifest.json \
  --output data/verification/<run>/report \
  --asset-mode directory \
  --overview
```

全量模式需要 Web workspace 已安装的依赖以嵌入 Geist / Lucide；无在线字体或 CDN。目录模式使用相对 PNG，适合大量截图和跨机器 HTTP；省略 `--asset-mode` 保持内嵌模式。仅 `--overview` 启动浏览器。原格式 manifest 不带 `app` 时继续输出原专项图册。批量运行与后续 LLM 补充使用 [脚本流水线](scripted-pipeline.md)。

报告入口遵循 [页面与交付约定](../SKILL.md#报告页面与交付)；联合 Web 验收时按 [脚本流水线](scripted-pipeline.md#app-与-web-同页交付) 生成同一个 Tab 工作台。交付包含：

- `index.html`：直接交付的页面验收工作台；五栏目、iOS / Android 切换、路由/别名搜索、状态筛选；点击每页打开截图/检查项/环境来源 Dialog，支持切图、原图放大下载与前后页。无截图页面也能查看计划。
- `inventory.json`：冻结的页面/必需场景目录；`coverage.json`：两平台逐页逐场景结果；`results.md`：页面覆盖与原始用例表。
- `evidence.html`：全部原始截图的专项图册，含未关联和历史记录；`originals/`、`receipts/`、`bindings/` 与 `hashes.json` 保留字节及来源摘要。
- `overview.png`：显式选择不超过 12 张时的可选排版图，数量不代表覆盖。

验证平台切换、别名搜索、筛选、无截图页、Dialog 切图、Escape/Tab 焦点、原图 hash 与当前平台全目录导出。以常规手机视口（例如 390×844、412×915）检查报告阅读；这只是报告 UI 校验，不是 App 原生验收。真实 App 结果另报设备、系统与执行范围。小屏不进入默认测试清单。

生成器改动后的报告交互可用以下独立检查器；输出目录必须新建，它不会更改冻结报告：

```sh
node .agents/skills/imsweb-ui-testing-and-evidence/scripts/check-app-report.mjs \
  --report data/verification/<run>/report \
  --output data/verification/<run>/report-check
```

检查器校验所有生成文件/副本 hash，执行上述交互并保存桌面报告、常规手机和 Dialog 截图。报告阅读的桌面检查不扩展 App 原生功能矩阵。
