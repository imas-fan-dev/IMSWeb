# Playwright API Dispatcher：技术设计

## 基线

普通Playwright现有118个same-origin `/api` route注册，分布在29个文件；只有15个检查method、17个读取body、5个检查query，且没有runtime contract parse。dispatcher只治理普通Web Playwright，不改变production API client。

## Fixture API

新增fixture-owned dispatcher，并由一个catch-all route接管same-origin `/api`请求。测试按预期注册：

```ts
api.expect({
  method: 'GET',
  path: apiPath('/events'),
  query: eventListQuerySchema,
  responses: { 200: eventPageSchema, 503: eventErrorSchema },
  times: 1,
  handle: ({ query, request }) => ({ status: 200, json: page }),
});
```

核心规则：

- 精确匹配method和pathname，query与JSON body分别解析；
- 未声明query时拒绝任何query key，未声明body时拒绝请求body；
- request schema负责值校验，并默认要求raw与parsed具有相同结构key，避免测试客户端发送被strip的extra字段；确需legacy projection时必须命名并说明原因；
- response状态必须在`responses`中，payload通过contracts schema parse，再复用Web exact JSON结构比较，禁止strip/default/coerce/transform掩盖fixture drift；
- 记录method、URL、headers、raw/parsed body与query，供测试读取；
- 重复或歧义注册、超出`times`、未满足expectation都失败；
- afterEach自动执行`assertSatisfied()`。

非API资源不拦截。same-origin API pass-through必须提供name、精确matcher和reason，不提供默认401兜底。

## Contracts与路径

schema来自`@imsweb/contracts`公开subpath，API URL来自contracts path builders。fixture builder可以保留，但返回值必须在dispatcher fulfillment前runtime验证。共享Backoffice和Platform auth fixture迁移到dispatcher之上。

## 迁移顺序

1. dispatcher负向/自测；
2. Admin和Platform auth；
3. Editorial与Homepage；
4. Namecard browsing/builders；
5. 三个高密度spec；
6. map、events、Wiki、account、upload和其余admin。

每批启用该组的fail-closed catch-all并跑聚焦浏览器测试。全部118处迁移后删除direct `page.route` API mock，并运行完整三浏览器CI-mode套件。
