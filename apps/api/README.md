# @imsweb/api

IMSWeb 后端已迁移为 TypeScript + Hono。当前唯一运行入口是 Hono Node：支持
SQLite/PostgreSQL、可选本地/S3 媒体、Sharp 和流式 multipart，监听
`127.0.0.1:3000`。

原 Express 与 Flask 路由均由 Hono 实现；Flask、Jinja、Gunicorn 和 uWSGI 不属于公开仓库
或活动部署。生产数据仍必须按停写、在线备份、
完整对账和单一权威写入源的闸门切换。PostgreSQL 18.4 的版本化 schema 与 SQLite 全量
导入链路已经建立，生产切换仍需影子读、停写增量和回滚演练。不再把
Worker、D1 或 R2 纳入当前设计和验收。

## 基础设施边界

业务代码只依赖 `src/ports/` 中的能力接口和注入的 `RuntimeServices`，不选择数据库、对象
存储、缓存、图片库或上传解析器。`src/runtime` 是唯一组合根，负责创建具体基础设施适配器
并注入 `RuntimeServices`；`src/infra` 不再定义业务接口：

```text
domains/middleware/utils -> ports contracts <- concrete infra adapters
                                  ^
                         RuntimeServices
                                  ^
                       runtime composition root

infra/db/        postgresql、sqlite、repositories、sql
infra/cache/     filesystem、memory
infra/oss/       filesystem、s3（对象持久化与补偿）
infra/media/     sharp（图片校验与转换）
infra/http/      busboy、filesystem（上传和静态响应）
infra/security/  bcrypt、bcryptjs、hmac
```

业务域不得导入任何 `infra` 路径、平台绑定类型或 ORM client。Repository 按认证、审计、
新闻、活动、名片、反应、站点包和剧情能力拆分；`RuntimeServices` 不再暴露跨领域的 `core`
大接口。图片处理属于 `media` 能力，不与 `ObjectStorage` 绑定；业务只使用
`ImageProcessor` 接口，`runtime` 注入 Sharp 实例。每个中间件目录按
业务职责拆文件；替换实现时只调整 `runtime` 的实例组合和对应实现，不修改业务域或服务契约。
数据库目录按隔离边界拆分：`postgresql/` 与 `sqlite/` 各自持有连接和 Schema Strategy，
`repositories/` 持有复用的 SQL Repository 实现，`sql/` 只保留 Driver 契约与查询工具。
Provider 差异不会进入 Repository 或业务域。S3 目录按职责拆为 `object-storage.ts`、`upload-state-machine.ts` 和
`compensation-service.ts`：对象字节进入 S3，不可变版本映射、延迟发布、恢复与补偿状态进入注入的
统一 SQL 数据库。SQL Driver 契约是 `infra/db/sql/database.ts` 的实现层内部抽象，不向业务暴露。

项目不保留 `src/shared`。Hono 请求上下文和静态路径策略属于 `src/middleware`，前端路由
决策属于 `src/routing`；纯函数按 `src/utils/{crypto,http,media,storage,validation}` 分类。
`utils` 不提供 `index.ts`、`utils.ts` 或 `helpers.ts`；SQL Driver 契约与查询工具属于
`infra/db/sql`，共享仓储实现属于 `infra/db/repositories`，
具体中间件实现不得进入 `utils`。

## 本地验证

JavaScript 工具链要求 Node.js `>=22.13.0`，包管理器固定为 pnpm `11.10.0`。

以下命令从仓库根目录执行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
```

`pnpm run check` 会验证 Node 类型、Hono 架构边界和 Web 客户端 manifest。
`pnpm run test` 还会运行 Node、Wiki DOM/CRUD、资源和仓库级部署契约；Hono
不需要 Python Web 依赖。

## 运行入口

Node 本地运行：

```sh
pnpm --filter @imsweb/api run build:server
IMS_JWT_SECRET='<high-entropy-secret>' pnpm --filter @imsweb/api run start:node
```

生产只运行 `apps/api/dist/server/main.js`；`apps/api/js/server.js` 保留给旧
PM2/systemd 命令，并转发同一 Hono 导出。生产必须显式设置 `IMS_JWT_SECRET`，完整变量
见本 workspace 的 [`.env.example`](.env.example)；API 不会自动加载该文件。本地 Node
使用的 SQLite/PostgreSQL 配置见
[数据库配置](../../docs/database-configuration.md)；常驻 Node 部署的 S3 配置、权限
和迁移边界见 [Node 文件对象存储](../../docs/object-storage.md)。只有显式设置
`IMS_OBJECT_STORAGE=s3` 才会替换本地对象存储实现。S3 模式下，图片路由完成权限检查和
业务路径映射后返回短期签名 URL，浏览器直接从 MinIO/S3 读取对象；上传、图片校验和转换
仍全部经过 Hono。

本地 PostgreSQL 与首次数据导入：

```sh
pnpm run dev:postgresql:up
IMS_SQLITE_PATH="$PWD/data/imsweb.db" \
DATABASE_URL='postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql:import-sqlite -- \
  --allow-foreign-key-violations
```

普通空库只执行 `pnpm run migration:postgresql`。S3 模式要求 PostgreSQL 已应用
`0003_s3_object_lifecycle`；应用启动仅验证所需 schema migration，
不会隐式建表或修改生产数据库。旧活动、资讯和名片文件切到 S3 时使用
`pnpm run media:uploads:sync -- --apply` 导入并回读校验；旧首页 Information 卡片使用
`pnpm run media:information:sync -- --apply`。单独设置 S3 变量不会搬迁文件或生成业务索引。

## 静态资源

Node 发布集合由 `@imsweb/web` 的生产构建生成，并通过
`apps/api/dist/client-manifest.json` 逐文件校验。`dist/client` 与 `dist/node-client` 必须包含
相同内容；数据库、上传、迁移输入或私有历史资产不会进入发布产物。

## Nginx

新版不依赖 Nginx。需要统一 HTTP 入口时，可显式启动 `proxy` profile 中的单一 Hono
反向代理；该代理没有图片专用路由：

以下命令从仓库根目录执行：

```sh
docker compose -f deploy/compose.yaml config
docker compose -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose -f deploy/compose.yaml up -d nginx
```

不指定服务执行 `docker compose up` 时不会启动 Nginx。使用代理时将
`IMS_CLIENT_ADDRESS_SOURCE=nginx` 注入 Hono；直接访问 Hono 时保留默认 `direct`，不要信任
客户端提供的代理头。生产切换前仍需核对 TLS、监听端口、防火墙、真实数据路径和回滚责任人。

## 文档

- [数据库配置](../../docs/database-configuration.md)
- [Node 文件对象存储](../../docs/object-storage.md)
- [部署、备份与回滚](../../docs/operations-runbook.md)
- [Nginx Compose 部署](../../deploy/nginx/README.md)
- [Hono 操作脚本](scripts/README.md)

迁移的底线不变：先验证再切流，数据库与媒体成对迁移，任何时刻只保留一个权威写入点。
