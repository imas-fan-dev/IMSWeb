# 收敛专项测试与 Route Inventory

## Goal

减少 `node-security`、误置 Platform 测试和生成式 route inventory 的职责重叠与提交噪声，同时保留全部独有安全和路由覆盖。

## Requirements

- 为 `node-security` 每条断言标注现有 owner；只删除已被其他门禁完整覆盖的重复检查。
- 保留编译后 Node listener smoke 和共享 HTTP 适配器安全边界。
- 把 Platform 测试从 Wiki conformance 范围移到 Platform 所有者，并更新聚合入口。
- route inventory 只提交必要的机器可读权威产物。
- Markdown 报告改为按需生成，不作为 freshness 或提交同步要求。
- 迁移前后 mounted route、request carrier、response expression 和 policy totals 必须确定性对账。

## Acceptance Criteria

- [x] `node-security` 全部断言均有明确执行 owner；未证明完全等价的断言没有删除，独有 listener/adapter 断言通过。
- [x] Platform 测试位于正确测试族，测试名称和断言语义不变。
- [x] route inventory 只保留一个机器可读权威产物，Markdown 可由命令按需生成。
- [x] 重复生成不改变机器产物；route-level reconciliation 与当前基线一致。
- [x] source/compiler fixtures、test:infra、API tests、rules 和 boundaries 通过。
- [x] 文档和归档任务不再链接易失的生成 Markdown。

## Out of Scope

- API mounted route、unknown-key policy 或 response ownership 行为变更。
- 删除无法证明已有替代 owner 的安全断言。
- 重写 compiler-backed contract analyzer。
