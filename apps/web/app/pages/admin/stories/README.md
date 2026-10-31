# Wiki 剧情与素材管理

[返回前端总索引](../../../README.md)

本目录供后台内容维护者定位剧情、分类、类型与来源目录，以及媒体和封面素材。
当前 [页面入口](index.tsx) 组合
[WikiWorkbench](components/wiki-workbench.tsx)，封面素材有独立
[页面入口](story-cover-assets-page.tsx)。注册关系以 [routes.ts](../../../routes.ts) 为准，
不能把组件目录中的独立管理器视为当前路由入口。

## 能力与职责地图

| 参与者与能力 | 关键实现路径 | 职责 |
| --- | --- | --- |
| 编辑者进入内容工作台 | [wiki-workbench](components/wiki-workbench.tsx)、[sections](components/wiki-workbench-sections.tsx) | 工作台编排、移动端浏览器承载与操作入口 |
| 编辑者选择企划和内容页 | [层级浏览](components/wiki-hierarchy-explorer.tsx)、[剧情大纲](components/story-outline.tsx) | 按目录定位内容页，展示与选择剧情分类和卡片 |
| 工作台状态维护 | [hooks](components/wiki-workbench-hooks.ts)、[model](components/wiki-workbench-model.ts) | 目录与剧情加载、选择状态、刷新、编辑状态与纯模型 |
| 编辑者维护剧情卡片与来源 | [剧情编辑器](components/story-editor-dialog.tsx) | 新建或修改卡片、来源信息与图片，关联共享封面 |
| 编辑者维护分类 | [分类编辑器](components/story-category-editor-dialog.tsx) | 分类资料、归属与编辑反馈 |
| 编辑者维护内容类型与来源平台 | [来源目录对话框](components/story-source-catalog-dialog.tsx) | 剧情编辑所需的类型和来源目录 |
| 素材维护者管理封面库 | [素材页](story-cover-assets-page.tsx)、[封面编辑器](components/story-cover-asset-dialog.tsx) | 企划封面素材上传、修改、展示策略与可用状态 |

## 协作边界

- 后台身份与角色边界归 [AdminLayout](../../../layouts/admin-layout.tsx)，
  与 Platform 用户会话分离。路由与布局授权以实现为准，本索引不维护角色清单。
- 企划、栏目和内容页的实体资料与归档关系由
  [idols 目录后台](../idols/README.md) 维护；本目录消费该层级并维护其剧情内容。
  跨页面定位与返回需要保留当前选择上下文。
- 公开消费端见 [Wiki 阅读](../../wiki/README.md)。分类、来源目录、图片或封面关联变更时，
  需核对公开卡片和阅读展示，不能只检查编辑器。
- 请求通过 [API facade](../../../lib/api/index.ts) 调用，实现在
  [wiki endpoints](../../../lib/api/endpoints/wiki/)；此链接只表示请求归属，
  页面不得直接导入 endpoints 内部。JSON wire 来源为
  [@imsweb/contracts](../../../../../../packages/contracts/README.md)，
  Wiki 数据与媒体关系另见 [仓库架构文档](../../../../../../docs/architecture/wiki-management.md)。
- 工作台编排、状态 hook、纯模型和编辑对话框分别由上表定位；不要另建请求层或在文档复制接口字段。

## 测试入口

- 单元测试：[stories](../../../../tests/unit/pages/admin/stories/)，
  [工作台页面](../../../../tests/unit/pages/admin/stories/story-management-page.test.tsx)
  与 [组件测试](../../../../tests/unit/pages/admin/stories/components/) 按职责定位。
- 浏览器流程：[封面素材](../../../../tests/e2e/story-cover-assets.spec.ts)。
- 关联阅读回归入口见 [Wiki 阅读测试](../../wiki/README.md)，目录维护流程见
  [idols 测试入口](../idols/README.md)。

调整工作台入口、目录选择或素材归属时，同步更新本索引及目录后台、公开 Wiki 的协作链接。
