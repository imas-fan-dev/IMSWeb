# Wiki 企划、栏目与内容页管理

[返回前端总索引](../../../README.md)

本目录供后台维护者管理 Wiki 目录实体。`idols` 是现有物理目录名，条目能力包含偶像、组合、
剧情专题及其他内容页；不要把它理解为仅维护偶像资料。
[index.tsx](index.tsx) 跳转到条目入口，企划、栏目与条目共用
[CatalogManager](components/catalog-manager.tsx)。

## 能力与职责地图

| 参与者与能力 | 关键实现路径 | 职责 |
| --- | --- | --- |
| 维护者管理企划 | [agencies](agencies.tsx)、[实体编辑器](components/wiki-entity-editor-dialog.tsx) | 企划资料、公开状态与图标 |
| 维护者管理栏目 | [groups](groups.tsx)、[实体编辑器](components/wiki-entity-editor-dialog.tsx) | 按企划维护栏目资料、图标及内容页组织 |
| 维护者检索与维护内容页 | [entries](entries.tsx)、[CatalogManager](components/catalog-manager.tsx) | 按企划、类型与搜索条件定位条目，编辑并进入关联内容 |
| 维护者新建内容页 | [创建对话框](components/wiki-entry-create-dialog.tsx)、[条目字段](components/wiki-entry-fields.tsx) | 新建流程、资料输入与反馈 |
| 目录视图与草稿维护 | [catalog-model](catalog-model.ts)、[wiki-entry-draft-model](wiki-entry-draft-model.ts) | 列表投影、实体标识、返回目标与编辑草稿规则 |

## 协作边界

- 路由入口与身份边界以 [routes.ts](../../../routes.ts) 和
  [AdminLayout](../../../layouts/admin-layout.tsx) 为准。这里使用 Backoffice 身份，
  不复用个人帐号页的 Platform 授权判断，也不在文档维护角色清单。
- 目录层负责企划、栏目、内容页及其关系；剧情分类、卡片、来源目录与封面素材由
  [stories 内容后台](../stories/README.md) 维护。由内容工作台进入目录编辑时，
  返回行为归 [catalog-model](catalog-model.ts) 与管理器协作。
- [公开 Wiki](../../wiki/README.md) 消费目录与实体资料。调整条目类型、归档关系、公开状态或图像时，
  同时检查现代和经典阅读端的对应展示。
- 页面请求统一调用 [API facade](../../../lib/api/index.ts)，请求实现归
  [wiki endpoints](../../../lib/api/endpoints/wiki/)；该目录链接不作为页面直接导入入口。
  JSON wire 来源为 [@imsweb/contracts](../../../../../../packages/contracts/README.md)，
  UI 草稿与展示模型留在本目录。
- 这里的 Wiki 目录与社区名片角色、组合目录不是同一维护入口；后者见
  [后台 cards](../cards/) 与 [fudaba 请求实现](../../../lib/api/endpoints/fudaba/)。

## 测试入口

- 单元测试：[idols](../../../../tests/unit/pages/admin/idols/)，
  [目录管理](../../../../tests/unit/pages/admin/idols/catalog-management.test.tsx) 与
  [编辑器组件](../../../../tests/unit/pages/admin/idols/components/) 按职责定位。
- 浏览器流程：[Wiki 目录管理](../../../../tests/e2e/admin-idols.spec.ts)。
- 关联流程：[剧情后台](../stories/README.md)、[公开阅读](../../wiki/README.md)。

移动入口、调整共享编辑器或变更目录与剧情协作时，同步更新本索引及相邻索引，
路由与接口定义仍回到实现核对。
