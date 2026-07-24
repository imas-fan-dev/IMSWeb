# 当前项目审计结论

审计日期：2026-07-24。

本文区分“仓库实现完成”和“生产数据切写完成”。当前仓库只保留 Hono Node 运行时；
Cloudflare Worker、D1 和 R2 运行面已经退役。生产主机上的 TLS、进程管理器、数据库、
对象存储、停写窗口和数据对账仍需在线确认。

## 当前代码拓扑

```text
Hono application factory
  `-- Node listener  -> SQLite/PostgreSQL + filesystem/S3 + Sharp + Busboy
```

Hono 实现位于 `apps/api/src/domains/`，只通过 `ports/` 合同访问注入的运行时能力；`infra/`
仅包含由 `runtime/` 选择的具体适配器。
迁移前 Express/Flask 基线位于独立的 `apps/legacy`，只用于回归/回滚，不进入默认命令或
部署。Node 部署只有 `127.0.0.1:3000` 一个 Hono 上游；Python Web requirements 仅属于
Legacy workspace。

## 已验证边界

- Core 保留裸 Token、Bearer、Cookie、三方 CSRF、`op` 角色和历史响应差异；
- Wiki 保留 Cookie-only JWT、Header-to-claim CSRF、editor/op 角色、9 个实际模板的 DOM、
  六类写入、失败补偿和 Bilibili 五秒超时；
- Node 使用一个统一 SQLite 或 PostgreSQL 数据库、filesystem/S3 媒体、Sharp 和有界 multipart；
- Static Assets 由固定文件清单构建，数据库、Python、模板、Data、上传、工作流状态、
  PSD、文本模板和归档均不会进入产物；Unity `.data` 由 Node 提供 Range 响应；
- Compose/Nginx 只有 `ims_node:3000`，Wiki 不再分流或剥离前缀。

默认 `pnpm run check` 包含 Node 类型、架构边界和资源扫描。默认 `pnpm run test:fast`
另包含 Node、Server、Wiki、SQLite/PostgreSQL 迁移和路由契约；Worker 不在默认或可选发布面。

## 生产数据事实

仓库内快照不是完整生产数据。历史本地报告包含媒体缺失引用、孤儿表情记录和依赖文件名
归一化的编年史路径。不得用仓库副本替代生产备份，也不得删除引用来让本地 strict 审计
表面通过。

## 尚未完成的外部闸门

1. 归档生产 Nginx/TLS、进程管理器、端口、数据路径和回滚责任人。
2. 在停写窗口对权威 SQLite 做在线备份，并生成同一 run ID 的完整媒体清单。
3. 在目标 PostgreSQL 应用版本化 migration，导入统一 SQLite 并完成行级对账。
4. 对 filesystem/S3 目标完成对象级全量清单和引用对账。
5. 完成影子读、内部流量、最终增量、唯一写入源切换和数据回滚演练。
6. 为旧数据确定只读保留期、销毁条件和责任人。

因此当前可以确认 Node 迁移实现和本地验证边界，但不能声明生产 PostgreSQL/S3 切写、
线上风险关闭或旧数据退役已经完成。
