# 技术设计：IMSWeb 核心开发 Skill

## 目标与边界

在仓库 `.agents/skills/` 提供简洁入口流程，权威命令与详细规范仍保留在现有 docs、spec、`.rules` 与 workspace scripts 中。个人项目记忆目录中的两项设备安装 skill 不作为仓库文件修改。

## Skill 划分

1. `imsweb-playwright-e2e`：专注普通 Web / App WebView 浏览器测试的选型、创作、运行和失败证据；原生能力验证转交设备交付 skill。
2. `imsweb-test-routing`：按风险与测试 owner 选择 Web 单测、API 测试、仓库 owner、集成及完整测试，不负责写具体 E2E 场景。
3. `imsweb-local-dev-environment`：本地服务预检、启动、诊断与停止；不处理数据删除或环境重置。
4. `imsweb-app-device-delivery`：源码构建安装与设备验证；已发布 Android preview / iOS personal-team 的特殊流程委托给对应现有 skill。
5. `imsweb-quality-and-release-readiness`：运行静态/规则/文档检查并组织发布前证据；不执行发布、签名或部署。

对应原始十项合并映射：Web E2E、Tauri App E2E → #1；Web 单测、API 测试 → #2；本地开发检查 → #3；Android/iOS 安装 → #4；项目质量、文档规则、发布前检查 → #5。

## 目录与触发

每项放入 `.agents/skills/<slug>/SKILL.md`，使用 Pi skill 标准 markdown frontmatter `name` / `description`，正文固定含 `## When to Use`、`## Procedure`、`## Pitfalls`、`## Verification`。不新增 package scripts，不改 `.rules` 或权威 docs。

## 安全与兼容

- 所有命令从仓库根或文档指明的 workspace 运行。
- 设备操作前用 doctor 和 devices 确认前置条件与唯一目标；来源、origin、签名和安装版本要有证据。
- 删除/卸载/清数据、发布/部署、改变签名配置均须用户明确授权。
- Web E2E 与 App WebView 测试不能声称覆盖 system browser / deep links / 真实设备原生行为。
- 复用 `trellis-before-dev` / `trellis-check` 的通用职责，不复制其流程。

## 验证

通过 `pnpm run check:rules`，解析新 skill 文件 frontmatter 与必备章节，核验所有命令引用存在于 package scripts 或权威文档，并人工复核命令 owner、风险边界和旧 skill 委托映射。