# 角色生日公开投影

[routes.ts](routes.ts) 注册无鉴权的生日读取；[handler](handlers/list-birthdays.ts) 只返回公开字段，
数据库访问使用 [CatalogRepository](../../../ports/repositories/catalog.ts)。

[birthday-projection.ts](birthday-projection.ts) 选择分类为偶像、非兜底、月日有效的资料。
仓储排除已停用人物，并按企划和档案顺序返回候选；同一身份优先使用符合条件的默认档案，
否则使用第一份有效候选，不合并不同档案的名字、生日或颜色。空日期不补造，2 月 29 日合法。

响应由共享 [catalog 契约](../../../../../../packages/contracts/src/catalog.ts) 拥有；首页共用
一个请求，按结果计数，保留日历和当天提示的原样式。旧 JSON 仅保留为迁移事实源。
