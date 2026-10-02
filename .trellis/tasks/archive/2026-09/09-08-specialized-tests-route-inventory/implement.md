# 专项测试与 Route Inventory：实施计划

- [x] 固化36个`node-security`测试名、4个Platform测试名和315/230/306/608 inventory基线。
- [x] 原样移动4个Platform测试到server owner；运行直接文件、`test:server`和`test:wiki`。
- [x] 等待共享PostgreSQL lifecycle完成后，把`node-security`按adapter、domain和compiled environment owner拆文件。
- [x] 拆分阶段保留全部测试名和断言，确认每项只出现一次。
- [x] 建立重复断言到接管owner的逐条映射，并补齐不完全等价的检查。
- [x] 未找到可证明覆盖全部status、raw body、headers、database和filesystem状态的可删除断言，因此保留全部行为断言。
- [x] 为route inventory CLI增加write、freshness、Markdown independence负向测试。
- [x] 让正常freshness与`--write`只管理JSON，Markdown改为显式report/stdout。
- [x] 停止追踪生成Markdown并更新文档、任务链接和治理测试。
- [x] 单独实现semantic freshness，证明无关注释不改artifact而route语义变化会失败。
- [x] 每批核对inventory totals与route-level reconciliation，运行compiler fixtures、test:infra和API全量测试。
