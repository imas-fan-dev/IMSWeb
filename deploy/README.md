# 本地依赖服务

`deploy/compose.yaml` 只用于启动本地 PostgreSQL 和 MinIO，不包含 IMSWeb 应用、反向代理或
TLS 入口。正式部署由进程管理器运行 Hono Node；公网入口、证书和流量策略由仓库外的部署
平台负责。

从仓库根目录检查配置：

```sh
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yaml config
```

按需启动本地依赖：

```sh
pnpm run dev:postgresql:up
pnpm run dev:minio:up
```

不要把 `deploy/.env.example` 中的本地默认凭据用于共享或生产环境。正式环境的数据库、对象
存储和应用秘密应由目标平台或密钥管理服务注入。
