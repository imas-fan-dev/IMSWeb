# 本地 Compose 服务

`deploy/compose.yaml` 用于启动本地 PostgreSQL、MinIO 和 IMSWeb Hono API。API 镜像包含
构建后的 Web 静态资源，并在启动前幂等应用 PostgreSQL migrations。Compose 不包含反向代理或
TLS 入口；宿主机 Nginx 的参考配置位于 [`deploy/nginx/`](nginx/README.md)，但不会作为
Compose 服务启动。

从仓库根目录检查配置：

```sh
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yaml config
```

启动完整本地 API 栈：

```sh
pnpm run dev:api:up
docker compose -f deploy/compose.yaml ps postgres minio minio-init api
curl --fail http://127.0.0.1:3000/api/wiki/test
```

`dev:api:up` 会构建 API 镜像，并按健康依赖顺序启动 PostgreSQL、MinIO 初始化任务和 API。
只需要依赖服务或需要 Hono 源码热更新时，仍可分别运行：

```sh
pnpm run dev:postgresql:up
pnpm run dev:minio:up
pnpm run dev:node
```

API 仅映射到宿主机回环地址，容器内通过 `postgres:5432` 和 `minio:9000` 访问依赖。
`api-data` 卷保存 Hono 的本地运行状态，停止单个 API 容器不会删除该卷。不要把
`deploy/.env.example` 中的本地默认凭据用于共享或生产环境；共享或生产环境的数据库、对象
存储和应用秘密必须由目标平台或密钥管理服务注入。
