# Nginx Compose 部署

该目录保存一个可选的新版代理模板和一套 Legacy 回滚模板。`../compose.yaml` 默认只启动
PostgreSQL 与 MinIO，Nginx 位于 `proxy` profile；`../compose.legacy.yaml` 提供 Express + Flask
回滚代理。两者都直接使用
官方镜像，不构建应用镜像，也不挂载应用源码、SQLite 或媒体目录。

## 网络前提

两套 Nginx 配置面向 Linux 部署主机，使用 `network_mode: host`。当前 Hono 或 Legacy
应用进程继续由宿主机进程管理器负责，应用端口不会因容器化 Nginx 而额外暴露。Docker Desktop 必须显式
支持并启用 host networking；未来应用也容器化后，
应改用私有 Compose 网络和 service DNS。

默认入口为 `8080` 且只有 HTTP。正式公网切换前必须先归档并迁移现网 TLS 配置，
确认防火墙、域名和 Cloudflare 源站策略；不能把默认配置直接视为 HTTPS 替代品。
若 HTTPS 由可信外层代理终止，必须将内层监听端口限制为只有该代理和运维回环可访问，确认
外层会覆盖单值 `X-Forwarded-Proto`/`X-Forwarded-Port`，再设置
`IMS_TRUST_OUTER_PROXY=true`。默认 `false` 会忽略客户端提供的这两个头并使用内层 Nginx
自己的协议和端口，不能在公网可直接访问内层端口时启用信任。

## 配置文件

- `templates/default.conf.template`：可选的单一 Hono 通用代理，不维护图片路由；
- `templates-legacy/default.conf.template`：Express 与 Flask 双上游回滚路由；
- `snippets/proxy-common.conf`：统一代理头、超时和流式传输；
- `snippets/ims-security.conf`：所有正常发布必须加载的敏感路径保护；
- `snippets/ims-emergency-deny.conf`：Legacy 回滚入口固定加载的媒体拒绝规则。

官方镜像入口只替换 `IMS_*` 环境变量，`$host`、`$remote_addr`、`$scheme` 等 Nginx
变量会原样保留。新版主站使用通用 `location /` 转发到 `ims_node:3000`；图片路由由 Hono
完成鉴权和业务键映射后，浏览器通过签名 URL 直接读取 MinIO/S3，Nginx 不代理对象正文。

管理员上传的 HTML/CSS/图片站点包使用独立的
`IMS_SITE_PACKAGE_SERVER_NAME`。这个内容域只允许 `^~ /site-content/` 进入 Hono，其余路径
固定返回 404。`^~` 是刻意的：站点包 manifest 可以授权 `.txt` 等静态资源，但通用敏感扩展
规则仍会阻断内容域外的同名路径。生产 isolated-script 内容域应使用独立 registrable site
（例如 `ims-content.example.net`），不能使用主站普通子域，以避免父域 Cookie tossing 和
same-site 权限边界退化。本地仍可使用 `127.0.0.1` 与 `content.localhost`。
`/site-content/_preview/` 仍代理到 Hono，但明确关闭 Nginx access log，防止路径中的一次性
bearer token 进入代理日志；token 旋转和版本管理审计仍由应用数据库记录。

`/healthz` 是只证明 Nginx 进程可响应的 liveness，固定返回 `204`；`/readyz` 会代理
到 Hono 的 `/api/wiki/test`。Compose healthcheck 使用 `/readyz`，因此 Hono 停止或
上游不可达时，Nginx 容器会变为 unhealthy，而不是继续报告可接流量。

## 可选启动

将仓库的 `deploy/` 整体保存到稳定部署目录（例如 `/srv/ims/proxy/deploy`），并从
`/srv/ims/proxy` 执行以下命令。不要从会被旧 release 替换或删除的
`/srv/ims/current` 直接挂载安全配置。

Compose 变量模板位于 [`../.env.example`](../.env.example)。真实 `deploy/.env` 不提交，
并通过 `--env-file` 显式传入。直接访问 Hono 时不执行本节命令；启用 Nginx 时还必须为 Hono
设置 `IMS_CLIENT_ADDRESS_SOURCE=nginx`：

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

## Legacy 回滚入口

只有在被迫回滚到 Express + Flask 时才启用。先停止当前 Nginx，避免两个 Compose 同时
监听同一端口：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml stop nginx
docker compose --env-file deploy/.env -f deploy/compose.legacy.yaml config
docker compose --env-file deploy/.env -f deploy/compose.legacy.yaml run --rm --no-deps nginx nginx -t
docker compose --env-file deploy/.env -f deploy/compose.legacy.yaml up -d --force-recreate nginx
```

Legacy Node/Flask 默认使用 `127.0.0.1:3000` 和 `127.0.0.1:5000`。该入口会阻断全部
名片原图。恢复当前版本时先停止 Legacy Compose，再用基础 Compose 重建 Nginx，并再次执行
匿名、`op`、敏感路径和业务路由冒烟。
