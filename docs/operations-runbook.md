# 现网部署、备份与回滚手册

本文适用于统一 Hono Node 后端、单一 SQLite/PostgreSQL 数据库以及本地文件或 S3 媒体。
当前公开项目不包含 Express、Flask、Worker、D1 或 R2 运行时。所有生产操作都应先确认实际
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

不得把其他系统生成的 `node_modules/` 复制到目标主机。`bcrypt`、`sharp` 和 `sqlite3` 含原生
模块，必须在目标 Linux 环境安装并执行启动冒烟。

`pnpm run build` 先生成 Web，再构建 API，并把经过 manifest 校验的 Web 文件写入
`apps/api/dist/client` 与 `apps/api/dist/node-client`。发布物至少包含：

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
`deploy/.env.example` 只服务本地数据依赖，不是正式部署模板。

| 变量 | 用途 | 要求 |
| --- | --- | --- |
| `IMS_JWT_SECRET` | JWT 签名密钥 | 必填，高熵随机值 |
| `NODE_ENV` | 运行模式 | 生产使用 `production` |
| `HOST`、`PORT` | Hono 监听地址 | 建议 `127.0.0.1:3000` |
| `IMS_CLIENT_ADDRESS_SOURCE` | 客户端地址来源 | 直连为 `direct`；外部受信 Nginx 为 `nginx` |
| `IMS_DATABASE` | 数据库 provider | `sqlite` 或 `postgresql` |
| `IMS_SQLITE_PATH` | SQLite 权威数据库 | SQLite 模式使用 release 外绝对路径 |
| `DATABASE_URL` | PostgreSQL 连接 | PostgreSQL 模式必填，由密钥系统注入 |
| `IMS_PUBLIC_DIR` | 不可变客户端目录 | `/srv/ims/current/apps/api/dist/node-client` |
| `IMS_COMPENSATION_DIR` | 文件存储补偿 journal | release 外绝对目录 |
| `IMS_IDEMPOTENCY_DIR` | 编年史幂等 journal | release 外绝对目录 |
| `IMS_UPLOADS_DIR` | 普通上传目录 | release 外绝对目录 |
| `IMS_EVENT_BASE_DIR` | 编年史状态目录 | release 外绝对目录 |
| `IMS_STORY_DATA_DIR` | 剧情图片目录 | release 外绝对目录 |
| `IMS_OBJECT_STORAGE` | 媒体存储 | `filesystem` 或 `s3` |
| `IMS_SITE_ORIGIN` | 主站 origin | 生产必填，无路径 |
| `IMS_SITE_PACKAGE_ORIGIN` | 隔离站点包 origin | 生产必填，与主站不同 registrable site |

S3 模式还需要 `IMS_S3_BUCKET`、`IMS_S3_REGION` 及可选 endpoint/prefix；凭据使用标准 AWS
凭据链，不写入仓库。完整说明见 [Node 文件对象存储](object-storage.md)。

生产相对路径会随 release 改变，因此所有可变数据路径必须是绝对路径，且不能位于
`IMS_RELEASES_DIR` 或 `IMS_CURRENT_LINK` 下。

## 4. 数据库准备

### SQLite

启动前验证文件存在且通过完整性检查：

```sh
: "${IMS_SQLITE_PATH:?set the authoritative SQLite path}"
test -f "$IMS_SQLITE_PATH"
sqlite3 "$IMS_SQLITE_PATH" 'PRAGMA quick_check;'
```

SQLite 在目标不存在时可能创建空库，不能把进程启动成功视为路径正确。不要直接复制正在写入
的数据库，也不要手工删除活动数据库的 `-wal` 或 `-shm`。

### PostgreSQL

生产固定经过验证的版本，不使用 `latest` tag。空库先执行版本化迁移：

```sh
: "${DATABASE_URL:?set the PostgreSQL connection URL}"
pnpm run migration:postgresql
```

从统一 SQLite 首次导入时，目标必须为空：

```sh
IMS_SQLITE_PATH=/srv/ims/migration/imsweb.db \
DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql:import-sqlite -- \
  --allow-foreign-key-violations
```

导入器会记录源 SHA-256、逐表计数和历史外键异常。切换权威写入源前仍需停写增量、媒体引用
核验和回滚演练。

## 5. 配对备份

数据库与媒体必须在同一停写窗口备份并用同一标识归档。SQLite 使用在线备份接口：

```sh
set -eu
umask 077
: "${IMS_SQLITE_PATH:?set the authoritative SQLite path}"
BACKUP_DIR=/secure-backups/ims
STAMP=$(date +%Y%m%d-%H%M%S)
install -d -m 0700 "$BACKUP_DIR"
sqlite3 "$IMS_SQLITE_PATH" ".backup '$BACKUP_DIR/imsweb-$STAMP.db'"
sqlite3 "$BACKUP_DIR/imsweb-$STAMP.db" 'PRAGMA quick_check;'
shasum -a 256 "$BACKUP_DIR/imsweb-$STAMP.db" \
  > "$BACKUP_DIR/imsweb-$STAMP.db.sha256"
```

PostgreSQL 使用与生产版本兼容的 `pg_dump --format=custom`，并保存 restore 演练结果。文件系统
媒体至少包括 uploads、chronicle、story、compensation 和 idempotency 目录；生成文件清单与
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

准备 staging 并完成安装与验证后设置：

```sh
export IMS_RELEASES_DIR=/srv/ims/releases
export IMS_CURRENT_LINK=/srv/ims/current
export IMS_PUBLIC_DIR=/srv/ims/current/apps/api/dist/node-client
export IMS_SQLITE_PATH=/srv/ims/shared/database/imsweb.db
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

`deploy/compose.yaml` 不运行应用、Nginx 或其他正式入口，只提供本地 PostgreSQL 和 MinIO。
生产入口由目标平台独立管理，必须在切流前确认：

- TLS、真实域名、防火墙和上传大小限制已经生效；
- 主站与隔离站点包使用预期域名并保持 Cookie 边界；
- 上游只指向当前 Hono release，健康检查直接覆盖 `/api/wiki/test`；
- 外部 Nginx 仅在覆盖转发头且不能被绕过时使用 `IMS_CLIENT_ADDRESS_SOURCE=nginx`。

## 8. 发布冒烟

切流前后至少验证：

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/api/news >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null
```

还应覆盖登录、受保护写请求、Wiki SSR、普通图片、编年史和管理页，并观察应用与入口层的
4xx/5xx、延迟和原生模块错误。站点包内容域必须单独验证 404 默认策略与一次性预览 URL。

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
- JWT 登录失效：核对 `IMS_JWT_SECRET` 是否被错误轮换或注入。
- SQLite `database is locked`：检查非预期多进程、长事务和备份方式，不删除 WAL/SHM。
- 图片 `404`：核对数据库逻辑路径、对象键和前缀；签名 URL 失败时检查 endpoint、时钟和权限。
- 编年史状态异常：将数据库记录、对象和 journal 作为一个恢复单元检查。
- 原生模块启动失败：在目标主机重新用 frozen lockfile 安装，不能跨平台复制依赖。

每次发布或回滚都应记录操作者、时间、release ID、数据库恢复点、媒体清单、验证结果和已知
限制。
