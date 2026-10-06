# 实施与验证计划

## Authorization

用户已在初步范围说明后授权“开始规划实施确认”，并通过当前 Goal 要求自主实施与验证。按此授权创建完整规划后进入实施，无须再次请求同一范围的实施许可。

## Ordered work

- [x] 阅读 API/Web/contracts 的 .rules、spec 索引及相关源文件、测试与 DESIGN.md。
- [x] 新增共享 community-content schemas/types、exports、README，使用已有 path builders。
- [x] 实现内容读写与缺失空列表、原子 revision 检查、安全链接与图片引用校验、editor/op 权限、审计与媒体上传配送。
- [x] 实现 Web API 模块、公共页动态展示、空内容/失败/端过滤/交换可用性逻辑。
- [x] 实现后台草稿编辑、排序、图片上传清除、隐藏/展示范围与保存冲突，注册 route/menu 并开放 editor 本页权限。
- [x] 新增/更新 API 持久化 HTTP、Web endpoint、公共页与后台交互回归；调整确实依赖旧硬编码入口的既有测试 fixture。
- [x] 分范围运行验证，独立 review 并修复；浏览器桌面/手机核对并留截图。
- [x] 更新 acceptance/verification 与必要 spec，审查全任务 diff。
- [ ] 限定提交本任务范围，归档并记录会话。

## Validation

先使用 owning package scripts 的 focused API server/Web unit 测试。确认实际脚本参数后运行，避免凭空编造 test owner。

必须运行：contracts build、API typecheck/check:architecture 与完整 API check/test、Web format/lint/typecheck/test:unit/build、root check:rules/check:boundaries、route 改动的 test:web-routing。浏览器采用 imsweb-playwright-e2e 的 Web 流程验证公共页面和后台编辑（桌面与手机）；App 端至少有 target-specific unit/浏览器验证，本任务不要求原生设备安装。

## Review and rollback points

- 配置为空不得显示任何旧入口，交换入口也不能例外。
- 测试必须覆盖 editor 权限、CSRF、存储冲突及真实 Node 图像校验/配送。
- 上传图片不应指向相邻业务或任意 URL；App 图片需 API-origin 解析。
- 后台加载错误不能转为空草稿并允许保存；冲突不能静默覆盖。
- 不覆盖已有 namecard-exchange planning 修改或已删除 API build 脚本。格式化如触及无关文件须恢复本任务导致的独立差异，不能丢失用户原变更。
- 提交前列出本任务所有改动并核对 index；不推送、不发布，不执行生产数据操作。
