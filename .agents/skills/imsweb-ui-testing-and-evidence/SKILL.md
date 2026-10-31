---
name: imsweb-ui-testing-and-evidence
description: Run IMSWeb App/Web UI automation and generate screenshot overviews and result reports. 用于 Web/App UI 自动测试、原生模拟器验收、响应式/键盘/触控/动效回归、截图总览及测试报告；区分普通 Web、App DOM 与真实原生运行。
---

## When to Use

用户要求测试 Web/App 界面、验证可见改动、检查截图/动画、生成截图总览或整理 UI 自动化结果时使用。只整理已有证据时，从步骤 4 开始，不重新启动服务、构建或安装 App。

## Procedure

1. **确定验收范围和执行所有权。** 读取当前任务要求与 `docs/development/ai-environment.md`，通过 [测试路由技能](../imsweb-test-routing/SKILL.md) 选择最小测试范围。先列必需场景及 `PASS / REWORK / BLOCKED / UNRUN` 状态；补测、诊断图和设计参考单独列出。保存当前 HEAD、已有 staged/unstaged 状态及修改文件 hash。
2. **运行正确的 UI 自动化。** 按 [Web 与 App 浏览器指南](references/browser-ui.md) 使用现有 Playwright owner/config/fixtures；原生、真实键盘、系统返回或桥接行为按 [原生 App 指南](references/native-app-ui.md) 使用项目设备交付入口。已有明确的目标、来源和授权直接复用。多个写入者不得共用一个服务器或模拟器。
3. **检查实际画面和过程。** 先检查未滚动、未重建 host 的初始状态，再有意滚动。结合可见字形、焦点、键盘、遮挡、触控与请求/相机证据；动画保留录像和连续过程帧。最终状态、AX 完整文案、纯几何、编译成功各自只证明其范围。发现缺陷先保留失败，再修复行为 owner，并仅复验受影响场景。
4. **冻结并整理证据。** 按 [结果与截图交付指南](references/results-and-screenshots.md) 保存原命令、cwd、真实退出码、项目/设备/renderer、源码/二进制绑定、原始截图/录像、失败与重试、环境限制和恢复状态。缺失值保持未知；超时或截断交接先恢复，不能当作 PASS。使用新的、Git 忽略的 `data/verification/<run>/`，保留原始文件及 SHA-256。
5. **生成可审阅结果。** 准备指南定义的 `manifest.json` 后，从仓库根运行：

   ```sh
   node .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.mjs \
     --manifest data/verification/<run>/manifest.json \
     --output data/verification/<run>/report \
     --overview
   ```

   生成器读取已有证据，输出 `index.html`、`results.md`、原图副本、hash 清单及选图总览 `overview.png`。它不会执行 manifest 中的测试命令，也不会替作者判断截图是否正确。输出目录必须是新目录。`--overview` 使用 Web workspace 已安装的 Playwright/Chromium；仅 HTML/Markdown 不需要启动浏览器。

6. **验证并交付。** 直接检查总览与各组原图；验证图册无文件系统 base 时也能显示图片、过滤/放大、原图下载 hash、窄屏溢出、控制台错误和意外网络请求。批量下载校验需限速，避免浏览器下载频率限制。最后回读源文件/index 保护与自有进程/设置恢复状态，报告核心/补测/图片数量、失败/阻塞/未运行项，以及总览、图册和报告链接。

## Verification

- 命令使用正确 owner/config，记录真实终态和跳过项；没有通过 retries、固定等待或弱化断言隐藏产品失败。
- Web、App DOM、iOS 原生和 Android 原生分别归属；图库选图数量不冒充测试覆盖数量。
- 原图与复制品 hash 一致，当前包与历史/修复前证据明确区分，所有必需场景都有状态。
- 修改此技能/生成器时，运行：

  ```sh
  node --test .agents/skills/imsweb-ui-testing-and-evidence/scripts/build-ui-report.test.mjs
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
