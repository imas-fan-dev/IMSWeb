# @imsweb/api

IMSWeb 后端已迁移为 TypeScript + Hono，共用一套业务路由并提供两个运行入口：

- Hono Node：SQLite、可选本地/S3 媒体、Sharp 和流式 multipart，监听 `127.0.0.1:3000`；
- Cloudflare Worker：D1、R2、Images 和 Workers Static Assets。

原 Express 与 Flask 路由均由 Hono 实现；Flask、Jinja、Gunicorn 和 uWSGI 已从活动
部署中移除，仅在 `../legacy` 保留回归/回滚源码。生产数据仍必须按停写、在线备份、
完整对账和单一权威写入源的闸门切换，仓库代码完成不代表线上 D1/R2 切写已经完成。

## 本地验证

JavaScript 工具链要求 Node.js `>=22.13.0`，包管理器固定为 pnpm `11.10.0`。

以下命令从仓库根目录执行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run worker:dry-run
```

`pnpm run check` 会验证 Node/Worker 类型、Hono 架构边界、固定 Static Assets 白名单、
D1 migrations、迁移工具和 Wrangler dry-run。`pnpm run test` 还会运行 Node、Wiki
DOM/CRUD、Worker、迁移和仓库级数据审计契约；Hono 不需要 Python Web 依赖。

## 运行入口

Node 本地运行：

```sh
pnpm --filter @imsweb/api run build:server
IMS_JWT_SECRET='<high-entropy-secret>' pnpm --filter @imsweb/api run start:node
```

生产只运行 `apps/api/dist/server/main.js`；`apps/api/js/server.js` 保留给旧
PM2/systemd 命令，并转发同一 Hono 导出。生产必须显式设置 `IMS_JWT_SECRET`，完整变量
见本 workspace 的 [`.env.example`](.env.example)；API 不会自动加载该文件。本地 Node
使用的 Core/Story SQLite 路径配置见
[SQLite 数据库配置](../../docs/database-configuration.md)；常驻 Node 部署的 S3 配置、权限
和迁移边界见 [Node 文件对象存储](../../docs/object-storage.md)。只有显式设置
`IMS_OBJECT_STORAGE=s3` 才会替换本地媒体 adapter。

Worker 使用 `src/server/worker.ts` 和 `wrangler.jsonc`。配置中的 D1/R2 名称与 ID 是本地
占位值，正式部署前必须创建并绑定真实资源，以 secret 方式注入 `IMS_JWT_SECRET`，并完成
生产 SQLite/R2 全量对账。不要把占位配置直接部署到生产。

## 静态资源

Workers Static Assets 只读取包内 `dist/client`。发布集合由包内
`scripts/build/client-allowlist.json` 固定；新增 `apps/legacy/public/` 文件不会自动发布。数据库、
Python、模板、`Data/`、上传和编年史状态均被排除。两个 Unity `.data` 文件保持旧 URL，
但由 R2 提供 Range/ETag 响应。

## Nginx

Node 阶段使用单一 `ims_node` 上游，不再有 Flask `5000` 端口或 Wiki 分流：

以下命令从仓库根目录执行：

```sh
docker compose -f deploy/compose.yaml config
docker compose -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose -f deploy/compose.yaml up -d nginx
```

仓库 Compose 只定义 Linux host-network HTTP 入口。生产切换前仍需核对现网 TLS、监听
端口、防火墙、真实数据路径和回滚责任人。

## 文档

- [SQLite 数据库配置](../../docs/database-configuration.md)
- [Node 文件对象存储](../../docs/object-storage.md)
- [部署、备份与回滚](../../docs/operations-runbook.md)
- [Nginx Compose 部署](../../deploy/nginx/README.md)
- [Hono 操作脚本](scripts/README.md)

迁移的底线不变：先验证再切流，数据库与媒体成对迁移，任何时刻只保留一个权威写入点。
