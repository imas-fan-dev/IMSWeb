# 收敛 API 测试辅助层

## Goal

减少 API 测试中已经造成漂移的 JSON、认证、CSRF、cookie、迁移与 Fudaba fixture 重复，同时保留每个领域的独有断言。

## Requirements

- 盘点所有候选重复实现，按共同语义而不是文本相似度决定抽取。
- 共享原始 JSON 读取与 contracts schema 验证时，不得丢失 untouched payload equality。
- Backoffice 与 Platform 的 cookie、CSRF 和会话 helper 保持 realm 隔离。
- 迁移/Fudaba fixture 只抽取 canonical 数据构造和稳定 setup，不隐藏业务步骤。
- 不创建 catch-all `helpers.ts`、通用 barrel 或需要多个无关 mode flag 的 abstraction。
- 迁移调用方后删除无引用实现，但不删除独有断言。

## Acceptance Criteria

- [x] 每个新增 helper 有至少两个真实消费者并代表同一稳定规则。
- [x] 认证、CSRF、cookie 和 JSON helper 有成功与失败行为回归。
- [x] 迁移/Fudaba fixture 的原断言数量和业务场景无损保留。
- [x] 搜索确认旧重复实现已清除或被记录为有意保留。
- [x] 受影响领域测试、API typecheck、architecture、rules 和 boundaries 通过。
- [x] API 全量测试通过。

## Out of Scope

- 产品认证逻辑或 cookie 契约变更。
- HTTP wire schema 变更。
- 仅因文本相似而合并不同领域 fixture。
