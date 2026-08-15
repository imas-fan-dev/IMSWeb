# 现网部署、备份与回滚手册

本文适用于统一 Hono Node 后端、单一 PostgreSQL 数据库以及本地文件或 S3 媒体。
所有生产操作都应先确认实际
发布目录、数据目录、进程管理器、入口/TLS 配置和回滚责任人。

## 1. 首次纳管

变更生产服务前保存以下只读证据：

1. 当前 commit、release 路径、制品摘要和启动命令；
2. 入口层完整配置，包括 TLS、上游、上传限制和转发头策略；
3. Node、pnpm、数据库和入口组件版本；
4. 进程管理器中的运行用户与环境变量名，不记录秘密值；
5. 权威数据库备份及同一时间窗内的媒体备份；
6. 首页、登录、资讯、编年史、剧情和管理页的冒烟结果。

用户密码哈希、访问日志、投稿联系人和 IP 属于敏感数据。备份目录必须限制为运维用户可读，
并设置保留与销毁期限。

## 2. 构建发布制品

Node.js 最低版本是 `22.13.0`，依赖统一使用根 `pnpm-lock.yaml`：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm run test
```

不得把其他系统生成的 `node_modules/` 复制到目标主机。`bcrypt` 和 `sharp` 含原生
模块，必须在目标 Linux 环境安装并执行启动冒烟。

`pnpm run build` 先生成 Web，再构建 API，并把经过 manifest 校验的 Web 文件写入
`apps/api/dist/client` 与 `apps/api/dist/node-client`。大于 1 KiB 的 HTML、JavaScript、CSS、
JSON 和 SVG 会在压缩结果更小时生成 `.br` 与 `.gz` 版本；Hono 按 `Accept-Encoding` 选择编码，
Range 请求继续读取原始文件。发布物至少包含：

```text
apps/api/dist/server/
apps/api/dist/client/
apps/api/dist/node-client/
apps/api/dist/client-manifest.json
node_modules/
package.json
pnpm-lock.yaml
```

不要手工修改任何 `dist/` 内容。

## 3. 生产环境变量

API 启动时会自动读取同一 workspace 下的 `apps/api/.env`，但 systemd、Supervisor、PM2
或密钥管理服务已经注入的变量优先。生产仍建议由进程管理器或密钥服务注入，并确保任何部署侧
`.env` 仅允许运行用户读取且不进入发布制品或版本控制。模板见 `apps/api/.env.example`；
`deploy/.env.example` 只服务本地 Compose 栈，不是正式部署模板。

| 变量 | 用途 | 要求 |
| --- | --- | --- |
| `IMS_JWT_SECRET` | JWT 签名密钥 | 必填，高熵随机值 |
| `IMS_SUPER_ADMIN_USERNAME` | 最高管理员用户名 | 首次启用时填写一个现有 `op` 用户名 |
| `NODE_ENV` | 运行模式 | 生产使用 `production` |
| `HOST`、`PORT` | Hono 监听地址 | 建议 `127.0.0.1:3000` |
| `IMS_CLIENT_ADDRESS_SOURCE` | 客户端地址来源 | 直连为 `direct`；外部受信 Nginx 为 `nginx` |
| `DATABASE_URL` | PostgreSQL 连接 | 必填，由密钥系统注入 |
| `IMS_PUBLIC_DIR` | 不可变客户端目录 | `/srv/ims/current/apps/api/dist/node-client` |
| `IMS_COMPENSATION_DIR` | 文件存储补偿 journal | release 外绝对目录 |
| `IMS_UPLOADS_DIR` | 普通上传目录 | release 外绝对目录 |
| `IMS_EVENT_BASE_DIR` | 编年史状态目录 | release 外绝对目录 |
| `IMS_STORY_DATA_DIR` | 剧情图片目录 | release 外绝对目录 |
| `IMS_OBJECT_STORAGE` | 媒体存储 | `filesystem` 或 `s3` |

请求幂等记录和共享限流窗口由 PostgreSQL 持有，不再需要单机文件 journal 配置。

管理员会话使用 15 分钟的 access JWT 和 30 天滑动有效期的 refresh token。两者都只写入
`HttpOnly`、`SameSite=Lax` Cookie；refresh token 只保存 SHA-256 摘要，并在每次刷新时轮换。
CSRF Cookie 保持脚本可读，用于 Alova 自动刷新和管理写请求的双提交校验。发布包含鉴权改动的
版本前必须先运行 `pnpm run migration:postgresql`，确认
`0010_admin_roles` 已写入 `ims_schema_migrations`。首次启用管理员角色时，将
`IMS_SUPER_ADMIN_USERNAME` 设为一个现有 `op` 账号；服务会把该账号提升为唯一最高管理员。
角色完成初始化后可以移除该变量，后续启动会从数据库确认最高管理员。

S3 模式还需要 `IMS_S3_BUCKET`、`IMS_S3_REGION` 及可选 endpoint/prefix。启用 CDN 读取时配置
同一 bucket 的 `IMS_PUBLIC_READ_URL_BASE`，
并在自定义域名 WAF 阻断 `/__protected/`；凭据
使用标准 AWS 凭据链，不写入仓库。完整说明见 [Node 文件对象存储](object-storage.md)。

生产相对路径会随 release 改变，因此所有可变数据路径必须是绝对路径，且不能位于
`IMS_RELEASES_DIR` 或 `IMS_CURRENT_LINK` 下。

## 4. 数据库准备

生产固定经过验证的版本，不使用 `latest` tag。空库先执行版本化迁移：

```sh
: "${DATABASE_URL:?set the PostgreSQL connection URL}"
pnpm run migration:postgresql
```

迁移后直接验证 `/api/health/ready` 和代表性业务读取；进程存活不能替代数据库就绪证明。

## 5. 配对备份

数据库与媒体必须在同一停写窗口备份并用同一标识归档。PostgreSQL 使用与生产版本兼容的
`pg_dump --format=custom`，并保存 restore 演练结果。文件系统
媒体至少包括 uploads、chronicle、story 和 compensation 目录；生成文件清单与
SHA-256 后再归档。S3 使用版本化 bucket、对象清单和数据库中的对象状态共同构成恢复点。

禁止只恢复数据库或只恢复媒体。任何恢复都要先保留故障现场，并取得业务负责人对可能丢失
写入的确认。

## 6. 原子发布

发布目录与共享数据必须分离。示例布局：

```text
/srv/ims/releases/<release-id>/
/srv/ims/current -> /srv/ims/releases/<release-id>
/srv/ims/shared/database/
/srv/ims/shared/media/
```

当前 PostgreSQL + R2 正式环境优先使用
[GitHub Actions 自动部署](github-actions-deployment.md)：CI 构建一次 GHCR 镜像，生产机按 digest
运行 Compose，并把 release metadata、数据库恢复点和部署记录保存在 `/srv/imsweb`。以下裸
Node 目录激活流程保留给未纳入 Compose 的既有安装或迁移排障，不是 GitHub Actions 的默认路径。

准备 staging 并完成安装与验证后设置：

```sh
export IMS_RELEASES_DIR=/srv/ims/releases
export IMS_CURRENT_LINK=/srv/ims/current
export IMS_PUBLIC_DIR=/srv/ims/current/apps/api/dist/node-client
export DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb'
export IMS_COMPENSATION_DIR=/srv/ims/shared/media/compensation
export IMS_UPLOADS_DIR=/srv/ims/shared/media/uploads
export IMS_STORY_DATA_DIR=/srv/ims/shared/media/story
export IMS_EVENT_BASE_DIR=/srv/ims/shared/media/chronicle

RELEASE_ID=2026-07-24.1
STAGING="$IMS_RELEASES_DIR/.staging-$RELEASE_ID"
pnpm run migration:release:activate -- "$STAGING" "$RELEASE_ID"
```

激活脚本会加锁，验证 release 文件、host-installed `node_modules`、server/client 构建物、
客户端 manifest、路径隔离和无监听启动，然后原子替换 `current` 软链接。进程管理器的 cwd
必须是 `/srv/ims/current`，启动命令只运行已构建的
`apps/api/dist/server/main.js`。

## 7. 入口与 TLS

`deploy/compose.yaml` 可运行构建后的 Hono API、本地 PostgreSQL 和 RustFS，但不运行 Nginx、
TLS 或其他正式入口。API 容器会在启动前幂等应用 migrations；RustFS 初始化服务创建一个
bucket，并通过匿名读取策略拒绝 `__protected/`，用于验证签名读取和公开 CDN 路径语义。
宿主机部署可使用 [`deploy/nginx/`](../deploy/nginx/README.md) 中的 Nginx 模板：主域名整体代理
到 Hono，使 Web 与 API 同源；同机 RustFS 使用独立对象域名代理到回环 S3 API，且不暴露
Console。

生产入口必须在切流前确认：

- TLS、真实域名、防火墙和上传大小限制已经生效；
- 主站与隔离站点包使用预期域名并保持 Cookie 边界；
- 上游只指向当前 Hono release，存活探针使用 `/api/health/live`，就绪探针使用
  `/api/health/ready`；
- 外部 Nginx 仅在覆盖转发头且不能被绕过时使用 `IMS_CLIENT_ADDRESS_SOURCE=nginx`。

## 8. 发布冒烟

切流前后至少验证：

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/api/news >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/api/health/ready >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null
ENTRY_ASSET=entry.client-CURRENT_HASH.js
curl --head --header 'Accept-Encoding: br, gzip' \
  "http://127.0.0.1:3000/assets/${ENTRY_ASSET}"
```

还应覆盖登录、受保护写请求、Wiki SSR、普通图片、编年史和管理页，并观察应用与入口层的
4xx/5xx、延迟和原生模块错误。压缩探测应返回 `Content-Encoding: br`、
`Vary: Accept-Encoding` 和 immutable 缓存；外部入口不得剥离这些响应头或重复压缩。站点包
内容域必须单独验证 404 默认策略与一次性预览 URL。

## 9. 回滚

代码回滚与数据回滚分开处理。若没有不兼容的数据写入，切回已经验证过的 release，并继续
使用完全相同的共享数据路径：

```sh
: "${PREVIOUS_RELEASE_ID:?set a validated release ID}"
pnpm run migration:release:rollback -- "$PREVIOUS_RELEASE_ID"
test "$(readlink "$IMS_CURRENT_LINK")" = "$IMS_RELEASES_DIR/$PREVIOUS_RELEASE_ID"
```

回滚会再次执行同一 preflight 并原子替换 `current`，不会修改共享数据。若新版本写入了旧版本
无法理解的数据，先关闭写入口、保存故障现场，再评估兼容转换；只有明确获批后才能恢复配对的
数据库和媒体快照。

数据库变更采用 expand/contract。兼容阶段禁止在普通代码发布中删除列、重编号主键或移动
权威媒体。

## 10. 故障定位

- 入口层 `502`：检查入口日志、Hono 监听地址、当前 release 和应用日志。
- JWT 登录失效：核对 `IMS_JWT_SECRET` 是否被错误轮换或注入，并确认 access JWT 过期后
  `/api/refresh` 能读取未撤销的 `auth_refresh_sessions` 记录。
- refresh 连续返回 `401`：检查 refresh Cookie 的 `/api` Path、CSRF header/cookie 是否一致，
  再检查会话是否过期、已登出撤销或因旧 refresh token 重放而整条会话被撤销。
- PostgreSQL 就绪失败：检查连接预算、migration、锁等待和语句超时，再核对结构化数据库日志。
- 图片 `404`：核对数据库逻辑路径、对象键和前缀；签名 URL 失败时检查 endpoint、时钟和权限。
- 历史站点包删除后 OSS 空间未下降：按 `state` 汇总 `object_deletion_jobs`，检查 pending/failed 的
  `next_attempt_at` 与 `last_error`；`quarantined_at` 非空表示已达到重试上限，需要先修复权限、
  endpoint 或对象状态，再通过调用 `ObjectDeletionWorker.retryQuarantined(jobId)` 的运维入口显式
  重新入队。若 outbox 与 S3 compensation 均为 completed 但空间仍未下降，检查 bucket versioning
  的 noncurrent versions 与 delete markers；配置经过审计的 noncurrent-version lifecycle，或使用
  专用 version-purge worker，且不得删除 PostgreSQL 活动索引仍引用的对象。不要手工恢复已删除的
  revision 行。
- 编年史状态异常：将数据库记录、对象和 journal 作为一个恢复单元检查。
- 原生模块启动失败：在目标主机重新用 frozen lockfile 安装，不能跨平台复制依赖。

每次发布或回滚都应记录操作者、时间、release ID、数据库恢复点、媒体清单、验证结果和已知
限制。
