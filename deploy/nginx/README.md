# Nginx Compose 部署

该目录只保存 Nginx 运行时会挂载的模板与片段。`../compose.yaml` 直接使用官方镜像，
不会构建项目自有镜像，也不会挂载 `apps/legacy/public/`、SQLite 或媒体目录。

## 网络前提

默认配置面向 Linux 部署主机，使用 `network_mode: host`。统一 Hono Node 进程只监听
`127.0.0.1:3000`，应用端口不会因容器化 Nginx 而暴露。Docker Desktop 必须显式
支持并启用 host networking；未来应用也容器化后，
应改用私有 Compose 网络和 service DNS。

默认入口为 `8080` 且只有 HTTP。正式公网切换前必须先归档并迁移现网 TLS 配置，
确认防火墙、域名和 Cloudflare 源站策略；不能把默认配置直接视为 HTTPS 替代品。

## 配置文件

- `templates/default.conf.template`：单一 Hono 上游、监听端口和兼容路由；
- `snippets/proxy-common.conf`：统一代理头、超时和流式传输；
- `snippets/ims-security.conf`：所有正常发布必须加载的敏感路径保护；
- `snippets/ims-normal-mode.conf`：正常模式的空操作片段；
- `snippets/ims-emergency-deny.conf`：仅用于退回加固前应用的临时拒绝规则。

官方镜像入口只替换 `IMS_*` 环境变量，`$host`、`$remote_addr`、`$scheme` 等 Nginx
变量会原样保留。`/wiki/`、`/story`、`/image/` 和 `/api/wiki/` 保留原始 URI，统一
转发到 `ims_node:3000`，不再执行 Flask 时代的前缀剥离。

`/healthz` 是只证明 Nginx 进程可响应的 liveness，固定返回 `204`；`/readyz` 会代理
到 Hono 的 `/api/wiki/test`。Compose healthcheck 使用 `/readyz`，因此 Hono 停止或
上游不可达时，Nginx 容器会变为 unhealthy，而不是继续报告可接流量。

## 启动

将仓库的 `deploy/` 整体保存到稳定部署目录（例如 `/srv/ims/proxy/deploy`），并从
`/srv/ims/proxy` 执行以下命令。不要从会被旧 release 替换或删除的
`/srv/ims/current` 直接挂载安全配置。

Compose 变量模板位于 [`../.env.example`](../.env.example)。真实 `deploy/.env` 不提交，
并通过 `--env-file` 显式传入：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config
docker compose --env-file deploy/.env -f deploy/compose.yaml pull nginx
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d nginx
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 nginx
```

模板或环境变量只在容器启动时展开，修改后需要重新创建：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --force-recreate nginx
```

## 应急模式

只有在被迫回滚到不具备 pending/名片保护的旧应用时才启用：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.emergency.yaml config
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.emergency.yaml \
  run --rm --no-deps nginx nginx -t
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.emergency.yaml \
  up -d --force-recreate nginx
```

该模式会阻断全部名片原图。恢复加固版本后，用基础 Compose 配置重新创建容器以
退出应急模式，并再次执行匿名、`op`、敏感路径和业务路由冒烟。
