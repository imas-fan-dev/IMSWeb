---
name: imsweb-ui-testing-and-evidence
description: Run IMSWeb UI acceptance and generate screenshot reports. 用于 App 全量页面验收、iOS/Android 原生验收、Web UI 回归和历史证据整理；按平台展示页面、场景与截图详情。
---

## When to Use

用户要求验收 Web/App 界面、生成全量 App 页面报告、检查截图/动画或整理已有结果时使用。只整理已有证据时，从步骤 4 开始；历史结果保持原来的源码、设备和范围。

## Procedure

常规桌面 Web 与正常尺寸移动端响应式捕捉，优先按 [Web 批量捕捉](references/web-capture.md) 使用 `ui-acceptance.mjs init --scope web` 和 `run`。Web 与 App 独立采集、归并和审阅，最终按下方页面约定交付。

1. **确定范围与页面清单。** 读取当前任务要求与 `docs/development/ai-environment.md`，通过 [测试路由技能](../imsweb-test-routing/SKILL.md) 选择 owner。默认验收常规手机竖屏：正常尺寸 iOS/Android 模拟器；App DOM 仅选 `app-iphone`、`app-android`，不运行 `app-small`、短横屏或小尺寸矩阵。用户另行指定的范围优先。全量 App 按 [全量页面指南](references/full-app-acceptance.md) 从权威路由建立目录、补齐业务场景与实例；每个页面在两平台都有记录。保存 HEAD、已有修改及源码 fingerprint；必需场景初始为 UNRUN，补测与参考独立列出。
2. **优先脚本批量执行。** 批量截图、跨主机采集和自动归并按 [脚本流水线](references/scripted-pipeline.md) 使用 `ui-acceptance.mjs`；已有 Maestro flow 连续执行，先自动出报告，再让 LLM 定位失败、批量审图与补说明。单个点击、截图和文件归并不逐步交给 LLM。Web 按 [浏览器指南](references/browser-ui.md) 使用现有 owner/config/fixtures，显式选择常规手机 project；原生键盘、系统返回和桥接按 [原生指南](references/native-app-ui.md) 使用设备交付入口。iOS 在 Mac 模拟器、Android 在其 SDK 主机独立执行；记录实际设备、系统、数据模式与源码/构建/安装绑定。明确目标直接复用，多个操作者分别使用服务器与模拟器。
3. **检查实际画面和过程。** 先检查未滚动、未重建 host 的初始状态，再有意滚动。结合可见字形、焦点、键盘、遮挡、触控与请求/相机证据；动画保留录像和连续过程帧。最终状态、AX 完整文案、纯几何、编译成功各自只证明其范围。发现缺陷先保留失败，再修复行为 owner，并仅复验受影响场景。
4. **冻结并整理证据。** 按 [结果与截图交付指南](references/results-and-screenshots.md) 保存原命令、cwd、真实退出码、项目/设备/renderer、源码/二进制绑定、原始截图/录像、失败与重试、环境限制和恢复状态。缺失值保持未知；超时或截断交接先恢复，不能当作 PASS。使用新的、Git 忽略的 `data/verification/<run>/`，保留原始文件及 SHA-256。
5. **生成可审阅结果。** 专项使用结果指南的原格式；全量 App 使用页面指南的 `app.inventory / runs` 与 `pageId / scenarioId / runId` 关联。准备 `manifest.json` 后，从仓库根运行：

   ```sh
   node .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.mjs \
     --manifest data/verification/<run>/manifest.json \
     --output data/verification/<run>/report \
     --asset-mode directory \
     --overview
   ```

   生成器只读取证据，不执行清单中的命令、不替作者审图。输出目录必须是新目录。全量模式包含五栏目、iOS/Android 切换、页面筛选、截图 Dialog、场景结果、环境与来源、原图及 JSON 下载。未截图页面也保留详情入口；额外输出 `inventory.json`、`coverage.json` 和完整 `evidence.html`。目录模式保留相对原图资源，适合大量截图与跨机 HTTP；省略该参数继续输出原有内嵌模式。`--overview` 额外使用 Web 已安装的 Playwright/Chromium 生成选图总览。

6. **验证并交付。** 检查总览与原图；在常规手机视口验证报告类型 Tab、环境切换、栏目/状态/搜索、Dialog 场景切图、原图下载 hash、Escape/焦点恢复、无溢出和控制台/外部请求异常。离线 file 打开也可浏览。最后回读源文件保护与进程/设置恢复状态，按下方约定直接返回最新工作台链接，简述各端覆盖、截图审阅数量和未完成原因。

## 报告页面与交付

默认入口是生成器输出的**页面验收工作台 `index.html`**：直接显示页面清单、截图卡片与详情 Dialog，包含场景、问题、环境和证据来源。最终回复优先链接本轮最新审阅后的这一页；已有冻结报告保持原样。

涉及 Web 与 App 时，交付同一个 `index.html`，通过两级 Tab / 环境切换浏览：

- **移动端 / Web Tab**：在同一工作台内切换报告类型。
- **移动端**：切换 iOS / Android 原生结果；**Web**：切换桌面 / 手机浏览器结果。

切换类型时更新页面目录、筛选、截图、来源和导出；两类目录及覆盖算法各自保留，同名页面不串图、不共享通过结果。单独验收 App 或 Web 时继续使用同一套工作台的单类型模式。联合生成命令见 [脚本流水线](references/scripted-pipeline.md#app-与-web-同页交付)。

**不额外制作统计汇总门户、摘要落地页或 iframe 拼接页作为入口。** `evidence.html`、Markdown、JSON、选图总览和原始日志是补充资料，在工作台内或回复中按需链接。

## Verification

- 命令使用正确 owner/config，记录真实终态和跳过项；没有通过 retries、固定等待或弱化断言隐藏产品失败。
- Web、App DOM、iOS 原生和 Android 原生分别归属；图库选图数量不冒充测试覆盖数量。
- 全量目录覆盖所有 App 页面；当前源码一致、常规手机竖屏、执行回执、源码/包绑定及已审阅 runtime 图齐全的必需场景才贡献原生 PASS。缺失为 UNRUN，部分完成为页面 PARTIAL；历史、小屏、参考、补测和 DOM 证据独立保留。
- 原图与复制品 hash 一致，当前包与历史/修复前证据明确区分，所有必需场景都有状态。
- 多端报告只交付一个工作台入口；检查移动端 / Web Tab 的鼠标与键盘切换、各端目录及全目录导出，确认同名页面的截图与来源没有串联。
- 修改此技能/生成器时，运行：

  ```sh
  node --test .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.test.mjs .agents/skills/imsweb-ui-testing-and-evidence/scripts/app-report-model.test.mjs .agents/skills/imsweb-ui-testing-and-evidence/scripts/ui-acceptance.test.mjs .agents/skills/imsweb-ui-testing-and-evidence/scripts/web-capture.test.mjs
  pnpm run check:rules
  ```

- 交付只包含任务增量；测试数据、设备生成输出、录屏和报告留在忽略的 data 目录。

## Authority

- [测试规范](../../../docs/development/testing.md)
- [Playwright 技能](../imsweb-playwright-e2e/SKILL.md)
- [设备交付技能](../imsweb-app-device-delivery/SKILL.md)
- [本地环境技能](../imsweb-local-dev-environment/SKILL.md)
- [原生测试 owner](../../../apps/web/tests/native/README.md)

当前任务要求与实际源码/config 优先于历史截图和示例；发布、签名修改、卸载/清数据及物理设备安装沿用各自授权边界。
