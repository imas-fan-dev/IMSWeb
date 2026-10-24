# 结果、截图总览与可放大图册

## 原始证据与清单

每轮使用新的 `data/verification/<run>/`。先冻结原始日志、trace/JUnit、截图/录像、hierarchy、来源/设备设置与 source/build/install 绑定，再生成呈现版本。原始失败、后续重试、审查结论和子代理超时/恢复分别保留；生成器不执行测试，也不判定图片正确。

清单中的文件路径相对 `manifest.json` 所在目录。支持 PNG 截图；导出的录像帧注明来源与时间点。以下只展示格式，不是已执行的测试证据：

```json
{
  "title": "页面 UI 验证",
  "source": { "commit": "实际提交", "dirty": true },
  "cases": [
    {
      "id": "web-search",
      "title": "Web 搜索与关闭",
      "renderer": "web",
      "required": true,
      "verdict": "PASS",
      "exitCode": 0,
      "command": "实际执行的命令",
      "receipt": "logs/web-search.log",
      "reason": "实际断言的行为"
    },
    {
      "id": "android-native",
      "title": "Android 安装包运行",
      "renderer": "android-native",
      "required": true,
      "verdict": "UNRUN",
      "exitCode": null,
      "reason": "尚未运行"
    }
  ],
  "screenshots": [
    {
      "id": "web-search-results",
      "title": "搜索结果",
      "path": "screenshots/search-results.png",
      "caseId": "web-search",
      "renderer": "web",
      "state": "results",
      "kind": "runtime",
      "review": "NOT_REVIEWED",
      "overview": true,
      "note": "实际 viewport、主题、字体、包身份及截图是否已稳定"
    }
  ]
}
```

- `renderer`：`web`、`app-dom`、`ios-native`、`android-native`；手动参考归到其实际 renderer，并用 `kind: reference` 标注。
- case `verdict`：`PASS / REWORK / BLOCKED / UNRUN`，退出码缺失保持 `null`；PASS 与非零退出码不能并存。重试前的失败回执放在各轮独立目录，通过 `reason`/报告说明，不修改原文件。
- `required: false` 是补测；必需与补测分别统计。图册总数不作为测试覆盖数。
- screenshot `kind`：`runtime / diagnostic / reference`；`review`：`PASS / REWORK / NOT_REVIEWED`，省略默认为未审图。参考/诊断图不自动成为核心通过证据。
- `overview: true` 只选择总览画面，最多 12 张。未选图仍完整保留在图册；无选图时不生成总览，避免自动挑出“最好看”的样本。
- `receipt` 可选；提供时复制原始日志并记录 hash。避免凭据、Cookie、个人数据进入交付清单/日志，脱敏副本保留与受保护原件的关系。

## 执行生成

```sh
node .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.mjs \
  --manifest data/verification/<run>/manifest.json \
  --output data/verification/<run>/report \
  --overview
```

输出是新目录，已有目录会被拒绝，防止覆盖冻结证据：

- `index.html`：自包含图册，内嵌原始 PNG；按 renderer/state/kind/review 筛选、放大与下载。
- `results.md`：必需/补测用例、原始命令退出码和验收结论，截图与审图数量分开。
- `manifest.json` / `hashes.json`：输入清单副本、输入 hash、复制原图与日志的来源/摘要、生成产物 hash。
- `originals/` / `receipts/`：字节一致副本。
- `overview.png`：仅 `--overview` 且已有选图时生成；这是排版后的总览，不是新的运行证据。

`--overview` 复用 Web workspace 的 Playwright/Chromium，不自动下载浏览器。若不可用，保留已生成的 HTML/Markdown 和失败回执；报告缺少总览，不把生成失败改称产品测试失败。

## 交付检查

顺序 decode 每张图片并校验自然尺寸；检查每个 renderer/状态组、筛选数量、放大/Escape、窄屏无横向溢出、无意外网络请求和控制台错误。既测试实际文件打开，也测试无文件系统 base 的内嵌展示。快速连续下载可能触发 Chromium 限速；校验脚本限速至约每秒一张，再比较下载字节 hash，不在产品测试里加固定等待。

保留原始图册、日志内的路径和冻结 source/index/evidence manifests。后续呈现使用新的目录与 closing manifest。最终直接给总览图片、全尺寸图册、Markdown 报告和明确限制；只有实际运行、视觉检查和独立验收各自支持的范围才标通过。
