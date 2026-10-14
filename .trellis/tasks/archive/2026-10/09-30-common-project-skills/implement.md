# 执行计划

## 实施步骤

1. 创建五个项目 skill：Playwright E2E、测试路由、本地开发环境、App 设备交付、质量与发布准备。
2. 每份 skill 引用权威路径，按触发条件给出最短可靠步骤，包含风险、例外和可观察验证结果。
3. App 交付 skill 链接并区分已有 Android preview APK 与 iOS personal-team install skill，不编辑个人项目记忆文件。
4. 对照原十项候选建立覆盖映射，确认全部被吸收且没有职责重复。
5. 运行 `pnpm run check:rules`；使用脚本检查 frontmatter、章节和引用命令/路径，人工审核越权副作用风险。

## 验收与回滚

- 完成五份项目 skill；原十项候选的合并映射见 `design.md`。
- 每项结构检查通过，frontmatter 与四个必备章节齐全。
- `pnpm run check:rules` 通过，Trellis manifests 通过 `task.py validate`。
- `pnpm run app doctor --platform ios|android` 由 `pnpm run app` 转发给 `app-device.js`，参数解析及 `runDoctor` 都使用 `options.platform`，可限定 prerequisite groups；`pnpm run app:doctor` 仍是全平台体检。
- `.gitignore` 只对本次五个明确 IMSWeb skill 目录及 `SKILL.md` 放行；其他 `.agents/` 路径继续忽略。
- 验收：满足 PRD AC1–AC6；所有 skill 能由名称/描述识别场景，命令来自当前 package scripts 或权威文档。
- 回滚：删除本任务新增的五个 `.agents/skills/imsweb-*` 目录即可；不改产品代码、配置、scripts 或已有个人 skills。

## 范围边界

仅改本任务 planning artifacts 和新增的 `.agents/skills/` 文档。不得顺手改应用、测试、package scripts、CI、已有个人 skill、设备数据或发布配置。