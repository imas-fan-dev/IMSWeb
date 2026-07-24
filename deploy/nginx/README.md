# Nginx Compose 部署

`deploy/compose.yaml` 默认启动 PostgreSQL 与 MinIO；Nginx 位于可选的 `proxy` profile。
Nginx 使用官方镜像，不构建应用镜像，也不挂载应用源码、SQLite 或媒体目录。

## 网络前提

该配置面向 Linux 部署主机并使用 `network_mode: host`。Hono 进程继续由宿主机进程管理器
负责。Docker Desktop 必须显式支持并启用 host networking；应用容器化后应改用私有 Compose
网络和 service DNS。

默认入口为 `8080` 且只有 HTTP。公网切换前必须迁移现网 TLS 配置并确认防火墙、域名和源站
策略。若 HTTPS 由可信外层代理终止，只有在内层监听端口不可被公网直接访问，且外层会覆盖
单值 `X-Forwarded-Proto`/`X-Forwarded-Port` 时，才可设置
`IMS_TRUST_OUTER_PROXY=true`。

## 配置文件

- `templates/default.conf.template`：单一 Hono 通用代理；
- `snippets/proxy-common.conf`：统一代理头、超时和流式传输；
- `snippets/ims-security.conf`：敏感路径保护。

官方镜像入口只替换 `IMS_*` 环境变量，`$host`、`$remote_addr`、`$scheme` 等 Nginx 变量
会原样保留。通用 `location /` 转发到 Hono，图片路由由 Hono 完成鉴权和业务键映射后返回
签名 URL，Nginx 不代理对象正文。

管理员上传的 HTML/CSS/图片站点包使用独立的 `IMS_SITE_PACKAGE_SERVER_NAME`。内容域只允许
`^~ /site-content/` 进入 Hono，其余路径固定返回 404。生产 isolated-script 内容域应使用
独立 registrable site，避免父域 Cookie 和 same-site 权限边界退化。

`/healthz` 是 Nginx liveness，固定返回 `204`；`/readyz` 代理到 Hono 的
`/api/wiki/test`。Compose healthcheck 使用 `/readyz`，因此上游不可达时容器会变为 unhealthy。

## 启动与更新

将 `deploy/` 保存到稳定部署目录，不要从会被 release 替换的 `current` 目录挂载安全配置。
真实 `deploy/.env` 不提交，并通过 `--env-file` 显式传入。启用代理时还必须为 Hono 设置
`IMS_CLIENT_ADDRESS_SOURCE=nginx`。

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config
docker compose --env-file deploy/.env -f deploy/compose.yaml pull nginx
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d nginx
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 nginx
```

模板或环境变量只在容器启动时展开，修改后先测试并重新创建：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --force-recreate nginx
```
