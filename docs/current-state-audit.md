# 当前项目审计结论

审计日期：2026-07-21。

本文区分“仓库实现完成”和“生产数据切写完成”。仓库已经完成 Hono Node/Worker 双运行时
迁移；生产主机上的 TLS、进程管理器、Cloudflare 资源、停写窗口和数据对账仍需在线确认。

## 当前代码拓扑

```text
Hono application factory
  |-- Node listener  -> SQLite + local media + Sharp + Busboy
  `-- Worker fetch   -> D1 + R2 + Images + Static Assets
```

Hono 实现位于 `apps/api/src/server/domains/`，只通过 `ports/` 访问运行时能力。
迁移前 Express/Flask 基线位于独立的 `apps/legacy`，只用于回归/回滚，不进入默认命令或
部署。Node 部署只有 `127.0.0.1:3000` 一个 Hono 上游；Python Web requirements 仅属于
Legacy workspace。

## 已验证边界

- Core 保留裸 Token、Bearer、Cookie、三方 CSRF、`op` 角色和历史响应差异；
- Wiki 保留 Cookie-only JWT、Header-to-claim CSRF、editor/op 角色、9 个实际模板的 DOM、
  六类写入、失败补偿和 Bilibili 五秒超时；
- Node 使用两份 SQLite、本地媒体、Sharp 和流式 multipart；
- Worker 每请求从 bindings 构造 D1/R2/Images/Assets 服务，不缓存 binding 或 secret；
- D1 使用版本化 migrations 与 prepared statements，Story 先 landing 再合并 card/link；
- R2 使用不可变物理对象 ID、SHA-256、D1 最终状态公开门禁和补偿任务；
- Static Assets 由固定文件清单构建，数据库、Python、模板、Data、上传、工作流状态、
  PSD、文本模板和归档均不会进入产物；Unity `.data` 单独映射到 R2；
- Compose/Nginx 只有 `ims_node:3000`，Wiki 不再分流或剥离前缀。

默认 `pnpm run check` 包含双运行时类型、架构边界、资源扫描、migration self-test、D1
对账和 Wrangler dry-run。默认 `pnpm run test:fast` 另包含 Node、Wiki、Worker、迁移、
资源、数据审计和 Nginx 契约。

## 生产数据事实

仓库内快照不是完整生产数据。已知本地报告存在 700 个 Core 媒体缺失引用、8,866 个
剧情图片缺失引用、33 条孤儿表情记录和 53 个依赖文件名归一化的编年史路径。不得用
仓库副本生成正式 D1/R2 导入物，也不得删除引用来让本地 strict 审计表面通过。

## 尚未完成的外部闸门

1. 归档生产 Nginx/TLS、进程管理器、端口、数据路径和回滚责任人。
2. 在停写窗口对两份 SQLite 做在线备份，并生成同一 run ID 的完整媒体清单。
3. 创建真实 D1、R2、Images 和 Worker 资源，替换 `apps/api/wrangler.jsonc` 占位 ID/名称。
4. 导入 landing/normalized D1 与 R2，完成行级和对象级全量对账。
5. 完成影子读、内部流量、最终增量、唯一写入源切换和数据回滚演练。
6. 为旧数据确定只读保留期、销毁条件和责任人。

因此当前可以确认本地迁移实现和验证通过，但不能声明生产 Cloudflare 切写、线上风险
关闭或旧数据退役已经完成。
