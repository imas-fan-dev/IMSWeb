# 统一前端路由与测试编排

## Goal

让前端路由元数据和测试执行职责各有一个权威来源，减少同步清单、重复构建和重复测试。

## Requirements

- 识别并统一 route manifest、prerender、static fallback、导航/权限和测试中的重复路由元数据。
- 规范来源必须保留 React Router 7 的 typed route manifest 和现有路径所有权。
- 建立 governance、contracts、api、web、delivery 和 root orchestration taxonomy。
- 每个测试不变量只能有一个执行 owner；root 脚本只调度 owner。
- 现有 root `test`/`check` 生命周期保持轻量调度；治理规则明确禁止新增 `test:all`，因此必须在当前脚本数量上限内替换或收敛入口。
- 保留集成lane自身的Web/API构建，除非另行建立经过验证的跨job artifact传递；不同CI job中的构建不视为可直接删除的重复。
- 脚本和目录迁移必须更新 CI、文档、affected-workspace 分类和 governance tests。
- 保持根脚本数量边界，不为参数组合新增脚本。

## Acceptance Criteria

- [x] 前端路由元数据由一个规范来源派生，重复清单被删除或自动校验。
- [x] 路由增删只需修改一个权威位置，并有负向/同步测试证明。
- [x] 测试 taxonomy 和 owner 映射写入权威测试文档。
- [x] root/package scripts 不重复构建或重复运行同一测试族。
- [x] CI affected-workspace、workspace boundary、script-surface 和 frontend routing tests 通过。
- [x] `pnpm run check` 与 `pnpm run test` 保持绿灯。

## Out of Scope

- 产品路由、导航 UX 或访问权限策略变更。
- 为美观而移动没有职责收益的测试文件。
- 新增与现有 runner 重叠的测试框架。
