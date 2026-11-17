# 偶像数据库与 Wiki 业务实例

[返回前端总索引](../../../README.md)

「偶像数据库」按企划、组合、角色组织管理入口。[index.tsx](index.tsx) 是角色工作区，按企划展示人物，
直接编辑名称、代表色、生日、配音状态、CV、简介、资料链接、图片及构图；可为现有身份新增
其他企划档案。名称、分类、别名、兜底与排序均在档案中维护，新建人物时同事务建立身份和完整首档案。
角色列表与完整档案是一体的工作区：列表支持企划、分类、关键词和分页，选中后直接维护完整档案。
[characters](characters.tsx) 与旧名片角色入口仅保留兼容跳转，不再提供第二套表单；组合档案与完整成员关系统一从 [units](units.tsx) 进入。

「Wiki 内容」维护独立业务实例：栏目与内容页可以独立创建、维护，也可关联共享企划档案。
这部分使用 [CatalogManager](components/catalog-manager.tsx)，保留自己的导航、可见性和剧情。

## 能力与职责地图

| 参与者与能力 | 关键实现路径 | 职责 |
| --- | --- | --- |
| 维护者管理完整企划档案 | [资料库工作区](index.tsx)、[共享档案编辑器](../../../components/admin/catalog-profiles-dialog.tsx) | 按企划显示完整人物／组合资料并维护独立版本 |
| 运营者维护人物生命周期 | [统一工作区](index.tsx)、[人物停用操作](components/catalog-character-retire-button.tsx) | 完整首档案创建与身份停用；保留已有担当和认领 |
| 运营者管理组合成员 | [units](units.tsx)、[组合表单与模型](identity/) | 组合企划关系和完整成员 |
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
- 名片只维护自己的业务记录并引用人物身份；共享身份不在名片菜单下重复编辑。原名片角色、组合
  页面保留查询参数跳转到本目录。兼容请求词汇仍由 [fudaba 请求实现](../../../lib/api/endpoints/fudaba/)
  承接，共享企划资料请求归 [catalog endpoints](../../../lib/api/endpoints/catalog.ts)。
- 内容页和栏目可通过[资料绑定控件](../../../components/admin/catalog-binding-control.tsx) 绑定
  对应企划的人物或组合档案。继承资料由[企划档案编辑器](../../../components/admin/catalog-profiles-dialog.tsx)
  维护，Wiki 保留自己的可见性、文字色、剧情和导航收录。解除绑定保留当前名称与图片。
- 编辑者可查看完整档案与维护 Wiki 实例；共享身份、资料、图片写入保留现有运营权限。
- 默认档案决定名片担当的名称、分类、企划与目录顺序；切换不改变已保存的担当 ID。
- 剧情工作台可从角色档案直接选择人物，以档案 ID 复用或建立同企划内容关联；共用展示通过关联读取，不把图片或人物资料另存为剧情数据。有剧情的条目不能解除或改绑人物关联。
- 列表和档案共用 URL 状态；切换企划保留选中人物。指定的缺档案或停用人物不被筛选条件隐藏，停用人物只读；无效 ID 显式提示。

## 测试入口

- 单元测试：[idols](../../../../tests/unit/pages/admin/idols/)，
  [目录管理](../../../../tests/unit/pages/admin/idols/catalog-management.test.tsx) 与
  [编辑器组件](../../../../tests/unit/pages/admin/idols/components/) 按职责定位。
- 浏览器流程：[资料库工作区](../../../../tests/e2e/admin-catalog.spec.ts)、[Wiki 目录管理](../../../../tests/e2e/admin-idols.spec.ts)。
- 关联流程：[剧情后台](../stories/README.md)、[公开阅读](../../wiki/README.md)。

移动入口、调整共享编辑器或变更目录与剧情协作时，同步更新本索引及相邻索引，
路由与接口定义仍回到实现核对。
