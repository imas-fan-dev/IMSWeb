# 现网部署、备份与回滚手册

本文适用于统一 Hono Node 后端（本地文件或 S3 媒体）和后续 Cloudflare 切换。所有生产操作都应先确认当前发布目录、数据目录、进程管理器和实际 Nginx/TLS 配置；仓库中的 Compose 模板只定义 HTTP 反向代理，不能代替尚未归档的生产证书与 HTTPS 策略。

## 1. 首次纳管

在改动生产服务前保存以下只读证据：

1. 当前代码目录的完整路径、文件清单和版本标识；
2. Nginx 完整展开配置（包括 TLS、上游和 include）；
3. Node、Python、pnpm、SQLite 和 Nginx 版本；
4. systemd、Supervisor、PM2 或面板中的启动命令、运行用户和环境变量名；
5. `apps/legacy/data/core/news.db`、`apps/legacy/data/story/idol_data.db` 及全部媒体目录的备份；
6. 当前首页、登录、资讯、名片、编年史和剧情页面的冒烟结果。

用户密码哈希、访问日志、投稿联系人和 IP 属于敏感数据。备份目录应限制为运维用户可读，并设置保留期限。

## 2. 依赖安装

JavaScript 依赖统一使用 pnpm；`pnpm-lock.yaml` 是唯一锁文件，不支持 `npm ci`。
Node.js 最低版本是 `22.13.0`，与项目固定的 pnpm 11 运行要求一致；目标机必须先通过
`node --version` 和 `pnpm --version` 检查。

```sh
corepack enable
pnpm install --frozen-lockfile
```

`bcrypt`、`sharp`、`sqlite3` 是必需的原生模块，安装后要在目标 Linux 主机实际执行语法检查和启动冒烟。不要把其他系统生成的 `node_modules/` 复制进发布目录。

Python 只用于只读数据审计、迁移辅助和显式 Legacy 回归。Hono 生产部署不存在 Python
Web 运行时，也不得把 Legacy 或审计脚本放入静态发布物。Legacy 的 Python 环境只通过
`cd apps/legacy && uv sync --frozen` 创建，禁止恢复旧 `venv` 或使用 `pip install -r`。

反向代理使用 Docker Engine 与 Compose v2，直接运行官方 Nginx 镜像并只读挂载配置，
不构建项目镜像。目标 Linux 主机部署前执行 `docker compose version` 并确认支持
`network_mode: host`。

## 3. 环境变量

生产值由 systemd、Supervisor 或密钥管理服务注入；应用不会读取提交到 Git 的真实密钥。
`apps/api/.env.example` 记录 Node 变量和兼容路径，`deploy/.env.example` 记录 Nginx Compose
变量，`scripts/migration/.env.example` 记录一次性 inventory 输入。

| 变量 | 用途 | 兼容值/要求 |
| --- | --- | --- |
| `IMS_JWT_SECRET` | Hono Node JWT 签名密钥 | 必填；使用高熵随机值；Worker 通过 secret binding 单独注入同值 |
| `NODE_ENV` | Hono Node 运行模式 | `development`、`test` 或 `production`；会去除首尾空白并转小写，未知值拒绝启动 |
| `IMS_COOKIE_SECURE` | 是否只通过 HTTPS 发送认证 Cookie | 生产使用 `true` |
| `HOST` | Hono Node 绑定地址 | 生产建议 `127.0.0.1` |
| `PORT` | Hono Node 端口 | `3000` |
| `IMS_NGINX_IMAGE` | Compose 使用的官方 Nginx 镜像 | 默认 `nginx:1.30.4-alpine3.24`；生产固定经过验证的 tag/digest |
| `IMS_NGINX_LISTEN_PORT` | host network 下 Nginx 监听端口 | 初次验证 `8080`；公网切换值按现网入口决定 |
| `IMS_NGINX_SERVER_NAME` | Nginx `server_name` | 默认 `_`；生产设置实际域名 |
| `IMS_NODE_UPSTREAM` | 统一 Hono Node 上游 | `127.0.0.1:3000` |
| `IMS_CLIENT_MAX_BODY_SIZE` | Nginx 请求体上限 | `50m`，与应用限制保持一致 |
| `IMS_OBJECT_STORAGE` | Node 可变媒体存储 | `filesystem` 或 `s3`；默认 `filesystem`，生产必须显式决定 |
| `IMS_S3_BUCKET` | S3 bucket | `s3` 模式必填 |
| `IMS_S3_REGION` | S3 region | `s3` 模式必填；可由 `AWS_REGION` 提供 |
| `IMS_S3_PREFIX` | bucket 内隔离前缀 | 可选，不含开头/结尾 `/` |
| `IMS_S3_ENDPOINT` | S3-compatible endpoint | 可选 HTTP(S) URL；AWS S3 留空 |
| `IMS_S3_FORCE_PATH_STYLE` | path-style 请求 | 默认 `false`；按 S3-compatible 服务要求设置 |
| `IMS_DB_PATH` | Core SQLite 路径 | `./apps/legacy/data/core/news.db` |
| `IMS_COMPENSATION_DIR` | Node 删除补偿任务的持久 journal 目录 | `./apps/legacy/data/core/compensation` |
| `IMS_IDEMPOTENCY_DIR` | Node 编年史幂等 journal 目录 | 生产使用独立持久目录；S3 模式默认位于 compensation 下 |
| `IMS_PUBLIC_DIR` | Node 门户不可变静态根目录 | 生产必须为 `/srv/ims/current/apps/api/dist/node-client`；`./apps/legacy/public` 只用于本地源码兼容 |
| `IMS_UPLOADS_DIR` | Node 普通上传目录；仍映射为 `/uploads/` | `./apps/legacy/data/uploads` |
| `IMS_EVENT_BASE_DIR` | 编年史 JSON 与图片状态目录 | `./apps/legacy/data/chronicle` |
| `IMS_STORY_DB_PATH` | 剧情 SQLite 路径 | `./apps/legacy/data/story/idol_data.db` |
| `IMS_STORY_DATA_DIR` | 剧情图片根目录 | `./apps/legacy/data/story/images` |
| `IMS_STORY_MAX_UPLOAD_BYTES` | Hono Wiki 请求体上限（字节） | 50 MiB 为 `52428800` |

应用会将相对数据路径解析到项目根目录，因此生产发布禁止使用相对的可变数据路径。
旧项目目录可以暂时继续作为数据源，但进程工作目录和 `/srv/ims/current` 必须指向一个完整、
不可变的版本化 release；不得向正在运行的目录覆盖代码、锁文件、依赖或 `dist/`。
Core/Story 数据库职责、本地配置、路径解析和启动前检查见
[SQLite 数据库配置](database-configuration.md)。
S3 的逻辑 key、凭据链、最小权限和切换校验见
[Node 文件对象存储](object-storage.md)。

### 完整版本化 release

`filesystem` 模式应把可变状态整理到共享目录；尚未搬迁时，也必须把下面六个变量设为旧项目
目录中的真实绝对路径，而不是让新 release 通过相对路径偶然找到旧数据：

```text
/srv/ims/shared/database/news.db
/srv/ims/shared/database/idol_data.db
/srv/ims/shared/database/compensation/
/srv/ims/shared/story-data/
/srv/ims/shared/event-chronicle/{upload,used,meta}/
/srv/ims/shared/uploads/
```

每个 release 使用共享绝对路径：

```sh
export IMS_DB_PATH=/srv/ims/shared/database/news.db
export IMS_COMPENSATION_DIR=/srv/ims/shared/database/compensation
export IMS_UPLOADS_DIR=/srv/ims/shared/uploads
export IMS_STORY_DB_PATH=/srv/ims/shared/database/idol_data.db
export IMS_STORY_DATA_DIR=/srv/ims/shared/story-data
export IMS_EVENT_BASE_DIR=/srv/ims/shared/event-chronicle
```

`s3` 模式只要求 SQLite、compensation（含默认 idempotency 子目录）继续使用 release 之外的
绝对持久路径；三个本地媒体目录仅作为迁移来源，不再是 Node runtime 的发布前置条件：

```sh
export IMS_DB_PATH=/srv/ims/shared/database/news.db
export IMS_STORY_DB_PATH=/srv/ims/shared/database/idol_data.db
export IMS_COMPENSATION_DIR=/srv/ims/shared/compensation
export IMS_IDEMPOTENCY_DIR=/srv/ims/shared/idempotency
export IMS_OBJECT_STORAGE=s3
export IMS_S3_BUCKET=ims-media-prod
export IMS_S3_REGION=ap-northeast-1
export IMS_S3_PREFIX=ims/production
```

生产优先使用实例/任务 IAM Role；使用 S3-compatible endpoint 时按服务要求额外设置
`IMS_S3_ENDPOINT`、`IMS_S3_FORCE_PATH_STYLE` 和标准 AWS 临时凭据。release preflight 会按
`IMS_OBJECT_STORAGE` 选择路径闸门，但不会替代 bucket 连通性、权限和对象 manifest 对账。

Hono Node 会把 `IMS_UPLOADS_DIR` 映射到原 `/uploads/...` URL，并把
`IMS_EVENT_BASE_DIR` 映射到原编年史 URL，因此版本化 release 不再依赖上传目录软链接。
`IMS_COMPENSATION_DIR` 必须与数据库和媒体一起持久化；删除失败时写入的任务会在启动及
后续请求中幂等重试，不能随 release 切换丢失。
先暂停写入、迁移并核对文件数/字节数/SHA-256，再切换这些绝对路径。共享目录及父目录
必须允许应用运行用户写入；release 代码本身可以只读。

在目标主机创建与 release ID 配对的 staging 目录，并在这个目录安装依赖、构建和验收。
`node_modules` 必须由目标主机从锁文件安装，不能从开发机复制。激活脚本要求代码、根锁文件、
host-installed `node_modules`、`apps/api/dist/client`、`apps/api/dist/node-client` 和
`apps/api/dist/server` 同时存在，随后把
staging 原子重命名为版本目录，再原子替换 `current` 软链接：

```sh
set -eu
RELEASE_ID="$(date +%Y%m%d-%H%M%S)"
export IMS_RELEASES_DIR=/srv/ims/releases
export IMS_CURRENT_LINK=/srv/ims/current
export IMS_PROJECT_ROOT="$IMS_CURRENT_LINK"
export IMS_PUBLIC_DIR="$IMS_CURRENT_LINK/apps/api/dist/node-client"
STAGING="$IMS_RELEASES_DIR/.staging-$RELEASE_ID"

# 使用受保护制品在 STAGING 中展开完整源码和 lockfile；不要包含任何生产数据。
cd "$STAGING"
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm run test:fast

# 六个可变路径必须已由进程管理器导出为 releases 目录之外、彼此无祖先关系的绝对路径。
pnpm run migration:release:activate -- "$STAGING" "$RELEASE_ID"
cd "$IMS_CURRENT_LINK"
test "$(pwd -P)" = "$(cd "$(readlink "$IMS_CURRENT_LINK")" && pwd -P)"
```

必须先做完整 frozen install，再执行 build/check/test；不能先用 `--prod` 删除 TypeScript 等构建与
测试依赖。`build:client` 生成 Worker 用的 exact 717-file `dist/client`，以及 Hono Node 用的
exact 719-file `dist/node-client`；后者只多两个 Unity `.data`，使阶段一旧 URL 的 GET/HEAD/Range
继续可用。激活命令有并发锁，并拒绝 lock/install 不匹配、缺失/额外静态文件、依赖或构建产物、
路径交叠、位于 release/current 树内的可变数据路径、路径祖先软链接或非软链接的
`current`。systemd、Supervisor 或 PM2 的 `WorkingDirectory`/`cwd` 必须设为
`/srv/ims/current`，启动命令只运行现成的 `apps/api/dist/server/main.js`。旧版本目录可保留
用于代码回滚，但绝不能继续作为运行进程的 cwd；若旧目录仍保存数据，只能通过上述绝对变量读取。
进程管理器必须显式设置 `IMS_PROJECT_ROOT=/srv/ims/current` 和
`IMS_PUBLIC_DIR=/srv/ims/current/apps/api/dist/node-client`；不要让静态路径指向源码
`apps/legacy/public/`
或旧项目目录。Cloudflare Static Assets 仍单独使用不含 `.data` 的 `dist/client`。

账号维护脚本还接受以下一次性变量，不应长期写入环境文件：

| 变量 | 用途 |
| --- | --- |
| `IMS_NEW_USER_USERNAME` | 新账号登录名 |
| `IMS_NEW_USER_PASSWORD` | 新账号初始明文密码，仅在执行进程中存在 |
| `IMS_NEW_USER_DEPT` | `editor` 或 `op`，默认 `editor` |
| `IMS_NEW_USER_PRODUCER_NAME` | 新账号显示名 |
| `IMS_PASSWORD_TO_HASH` | 只生成 bcrypt 哈希时使用的明文密码 |

轮换 `IMS_JWT_SECRET` 会使全部现有登录态失效。若旧密钥曾写入公开源码，应按已泄露处理，并在安全外层生效后立即轮换。
数据库文件也曾处于公开静态路径，因此其中的后台账号哈希同样按已暴露处理：安全外层生效后应逐个重置 `op`/`editor` 密码，复核账号清单与登录日志，并撤销不再使用的账号。不能只轮换 JWT 后继续沿用全部旧密码。

新增账号和单独生成密码哈希时，在受控交互 shell 中临时注入变量。以下方式不会把明文密码写进命令历史：

```sh
printf 'Username: '
IFS= read -r IMS_NEW_USER_USERNAME
printf 'Password: '
IFS= read -r -s IMS_NEW_USER_PASSWORD
printf '\nProducer name: '
IFS= read -r IMS_NEW_USER_PRODUCER_NAME
IMS_NEW_USER_DEPT=editor
: "${IMS_DB_PATH:?export the same authoritative IMS_DB_PATH used by Hono Node}"
export IMS_DB_PATH IMS_NEW_USER_USERNAME IMS_NEW_USER_PASSWORD IMS_NEW_USER_PRODUCER_NAME IMS_NEW_USER_DEPT
pnpm run ops:account:add
unset IMS_NEW_USER_USERNAME IMS_NEW_USER_PASSWORD IMS_NEW_USER_PRODUCER_NAME IMS_NEW_USER_DEPT

printf 'Password to hash: '
IFS= read -r -s IMS_PASSWORD_TO_HASH
printf '\n'
export IMS_PASSWORD_TO_HASH
pnpm run ops:password:hash
unset IMS_PASSWORD_TO_HASH
```

脚本输出不会回显账号明文密码。若通过自动化执行，应使用密钥管理器或不记录环境值的进程注入方式。

## 4. 启动和检查

在项目根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run build:server
pnpm run syntax
pnpm run check
pnpm run test:fast
pnpm run audit:data
```

`audit:data` 只读输出数据库表计数、外键检查、目录规模及媒体引用一致性 JSON。需要定位问题时使用 `pnpm run audit:data --details`；只有在真实生产数据源上才将 `pnpm run audit:data --strict` 作为上线闸门。strict 还要求普通 uploads 与 Core DB 引用形成 exact set、Chronicle 没有 orphan、删除补偿 journal 为空或全部 completed 且有显式 disposition。当前仓库副本已知缺少 700 个 core 媒体引用、8,866 个剧情图片引用，有 33 条孤儿表情记录，并有 53 个编年史文件名路径 alias，因此本地 `--strict` 返回 `2` 是预期结果，也证明本地仓库不能作为迁移源。

`test:fast` 运行 Hono 构建/架构/迁移检查、只读数据审计、Node 安全回归、Wiki DOM/CRUD
契约和 Cloudflare Worker integration；不安装 Flask、Pillow、Gunicorn 或 uWSGI。

本地兼容启动只需要统一 Node 进程：

```sh
pnpm run start:node
```

`start:node` 只运行已编译的 `apps/api/dist/server/main.js`，不会在生产启动阶段安装依赖或
执行 TypeScript 编译。发布流程必须先完成 `pnpm install --frozen-lockfile`、
`pnpm run build:server` 和测试，再原子切换发布目录。旧的
`node apps/api/js/server.js` 命令暂时可用，但同样要求发布目录中存在本次构建生成的
`apps/api/dist/server/`。

生产环境由进程管理器直接注入变量并管理一个 Hono Node 进程。Node 阶段必须保持单实例；
编年史文件状态和内存限流在切换 D1 前不支持多副本。Flask、Jinja、Gunicorn 和 uWSGI
只在 `apps/legacy` 保存回归/回滚源码；任何旧 Python 启动命令都必须从生产进程管理器移除。

仓库的 `deploy/` 必须整体复制到稳定代理目录，例如 `/srv/ims/proxy/deploy`，不要从会随
代码回滚变化的 `/srv/ims/current` 直接挂载。以下命令从包含 `deploy/` 的目录执行：

```sh
docker compose -f deploy/compose.yaml config
docker compose -f deploy/compose.yaml pull nginx
docker compose -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
```

## 5. Hono Node 与容器 Nginx 加固顺序

安全片段有意不阻断 `/assets/images/eventchronicle/events/upload/`，因为审核 UI 使用原 URL，并由 Hono 在静态服务之前执行 `auth + requireOp`。因此首次切换必须先启动经过回归的 Hono Node。

1. 暂停外部写入口并完成当前恢复点备份；
2. 注入生产环境变量，启动或重启 Hono Node；
3. 选取一个不敏感的 pending 测试图片，在回环端口验证匿名请求为 `401`、新登录的 `op` Token 请求为 `200`；
4. 在稳定代理目录执行 `docker compose -f deploy/compose.yaml config` 和容器内 `nginx -t`；
5. 先让 Compose Nginx 监听未占用的 `8080`，启动后验证健康、路由和敏感路径；
6. 只有现网 TLS 已迁移到经过验证的容器配置或仍由另一层可信入口终止时，才能切换公网流量；随后通过公网 HTTPS 重复 `401/200`；
7. 若没有现存 pending 图片，通过正常上传流程准备测试图片，验证完成后由 `op` 拒绝删除。

示例中的 URI 必须替换为经过 URL 编码的实际测试路径，`OP_TOKEN` 只放在当前受控 shell 环境中：

```sh
PENDING_URI='/assets/images/eventchronicle/events/upload/<activity>/<filename>'

curl -sS -o /dev/null -w '%{http_code}\n' \
  "http://127.0.0.1:3000${PENDING_URI}"
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer ${OP_TOKEN:?}" \
  "http://127.0.0.1:3000${PENDING_URI}"
```

预期依次为 `401` 和 `200`。轮换 `IMS_JWT_SECRET` 后必须重新登录获取 Token，不能使用轮换前的登录态。

Compose 正常模式把模板和全部片段只读挂载到官方镜像，但站点模板只 include
`ims-security.conf` 和空的 `ims-normal-mode.conf`。检查展开配置并启动：

```sh
docker compose -f deploy/compose.yaml config
docker compose -f deploy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose -f deploy/compose.yaml up -d --force-recreate nginx
docker compose -f deploy/compose.yaml ps
curl -fsS "http://127.0.0.1:${IMS_NGINX_LISTEN_PORT:-8080}/healthz" -o /dev/null
```

`deploy/nginx/templates/default.conf.template` 将 `/story`、`/wiki/`、`/image/`、
`/api/wiki/` 和 `/` 原样转发到同一 `ims_node` 上游，不再剥离 `/wiki/` 前缀。
模板或环境变量变化必须重新创建容器，不能只向旧进程发送 reload。

随后从公网逐项确认以下路径返回 `404`，而不是数据库或源码内容：

```sh
curl -I https://example.invalid/idol_data.db
curl -I https://example.invalid/idol_data.db-journal
curl -I https://example.invalid/app.py
curl -I https://example.invalid/requirements.txt
curl -I https://example.invalid/logs/error.log
curl -I https://example.invalid/venv/
curl -I https://example.invalid/assets/images/eventchronicle/events/meta/example.json
```

最后还要通过公网 HTTPS 对同一个 `PENDING_URI` 重复匿名 `401` 与 `op` 登录后 `200` 的检查。只验证 `meta` 返回 `404` 不足以证明 pending 预览既安全又可用。

Compose 使用 Linux host network，因此 `3000` 只绑定回环地址。不要同时配置 `ports:`，也不要为了容器回源把应用改绑 `0.0.0.0`。外网不应能绕过 Nginx 直连应用端口。
当前只有一层 Nginx 时，代理配置应覆盖 `X-Forwarded-For` 为 `$remote_addr`，不要直接信任客户端传入的同名请求头；若前面已有 Cloudflare 或其他受信代理，应按真实代理链重新配置应用的 `trust proxy` 和入口头部规则，并做伪造头测试。

## 6. 发布前检查

1. 确认工作树中没有 `.env`、数据库、sidecar、日志、PID、虚拟环境、归档备份或生产上传内容被纳入发布包；
2. 使用锁文件安装依赖并运行 `pnpm run check` 和 `pnpm run test:fast`；默认 `check`
   已包含 Wrangler dry-run。同时执行 `docker compose -f deploy/compose.yaml config` 和容器内 `nginx -t`；
3. 在当前 shell 导出与进程管理器完全相同的 `IMS_DB_PATH`、`IMS_COMPENSATION_DIR`、`IMS_UPLOADS_DIR`、
   `IMS_STORY_DB_PATH`、`IMS_STORY_DATA_DIR`、`IMS_EVENT_BASE_DIR`；
4. 对真实生产源保存详细审计并运行 strict 闸门；任何缺库、`quick_check`/外键检查失败、缺失引用、Core 未引用 upload、Chronicle orphan、未完成/未处置补偿 journal、非法编年史元数据或路径 alias 都必须先解释和处置：

   ```sh
   pnpm run audit:data --details > /secure-backups/ims/audit-before-release.json
   pnpm run audit:data --strict
   ```

5. 按第 7 节生成 SQLite 在线备份和与同一停写窗口配对的 manifest；禁止直接清点运行中的主 `.db`；
6. 确认 Git 已有不可变基线 commit/tag，或发布制品有 SHA-256 和受保护的制品存档；当前没有 `HEAD`、全部文件未跟踪时禁止直接发布，因为无法验证代码回滚；
7. 对首页、登录、资讯列表、图片读取、编年史列表和剧情详情执行冒烟；
8. 记录旧发布目录、旧进程配置和恢复点，确认回滚责任人后再切换。

## 7. 一致性备份

SQLite 数据库使用在线备份命令生成一致副本，不要直接复制正在写入的 `.db` 文件。进入最终
窗口后先关闭外部写入口；保留旧 Hono Node 的回环访问，只用于把删除补偿队列确定性 drain
到 completed。以下命令在项目根目录执行，并使用与应用进程相同的环境变量：

```sh
set -eu
umask 077

PROJECT_ROOT=$(pwd -P)
BACKUP_DIR=/secure-backups/ims
STAMP=$(date +%Y%m%d-%H%M%S)

resolve_from_project() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s/%s\n' "$PROJECT_ROOT" "${1#./}" ;;
  esac
}

NEWS_DB=$(resolve_from_project "${IMS_DB_PATH:-apps/legacy/data/core/news.db}")
COMPENSATION=$(resolve_from_project "${IMS_COMPENSATION_DIR:-apps/legacy/data/core/compensation}")
STORY_DB=$(resolve_from_project "${IMS_STORY_DB_PATH:-apps/legacy/data/story/idol_data.db}")
STORY_DATA=$(resolve_from_project "${IMS_STORY_DATA_DIR:-apps/legacy/data/story/images}")
EVENT_BASE=$(resolve_from_project "${IMS_EVENT_BASE_DIR:-apps/legacy/data/chronicle}")
UPLOADS=$(resolve_from_project "${IMS_UPLOADS_DIR:-apps/legacy/data/uploads}")
UNITY_ROOT=$(resolve_from_project "apps/legacy/public/runninggame")

test -f "$NEWS_DB"
test -d "$COMPENSATION"
test -f "$STORY_DB"
test -d "$STORY_DATA"
test -d "$EVENT_BASE"
test -d "$UPLOADS"
test -f "$UNITY_ROOT/Build/webgame.data"
test -f "$UNITY_ROOT/BuildMobile/webgame.data"
install -d -m 0700 "$BACKUP_DIR"

# 每次动态 loopback 请求最多处理 3 个 journal；非法或 1000 轮仍未收敛都终止窗口。
DRAIN_REPORT="$BACKUP_DIR/compensation-drain-$STAMP.json"
attempt=0
while :; do
  pnpm run audit:data -- --details > "$DRAIN_REPORT"
  jq -e '.compensation.invalid_entries == 0' "$DRAIN_REPORT" >/dev/null
  if jq -e '.compensation.outstanding_entries == 0' "$DRAIN_REPORT" >/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  test "$attempt" -le 1000
  curl -fsS "http://${IMS_NODE_UPSTREAM:-127.0.0.1:3000}/api/wiki/test" >/dev/null
done

COMPENSATION_DISPOSITION=
if test -n "$(find "$COMPENSATION" -mindepth 1 -maxdepth 1 -print -quit)"; then
  : "${MIGRATION_APPROVER:?set the person approving completed journal retention}"
  journal_files=$(find "$COMPENSATION" -mindepth 1 -maxdepth 1 -type f -name '*.json' \
    -exec basename {} \; | LC_ALL=C sort | jq -Rsc 'split("\n") | map(select(length > 0))')
  COMPENSATION_DISPOSITION="$BACKUP_DIR/compensation-disposition-$STAMP.json"
  jq -n --arg action retain-completed-for-audit \
    --argjson journal_files "$journal_files" \
    --arg approved_by "$MIGRATION_APPROVER" \
    --arg approved_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{action:$action,journal_files:$journal_files,
      approved_by:$approved_by,approved_at:$approved_at}' \
    > "$COMPENSATION_DISPOSITION"
fi

audit_data() {
  if test -n "$COMPENSATION_DISPOSITION"; then
    pnpm run audit:data -- "$@" \
      --compensation-disposition "$COMPENSATION_DISPOSITION"
  else
    pnpm run audit:data -- "$@"
  fi
}

audit_data --details > "$BACKUP_DIR/audit-source-$STAMP.json"
audit_data --strict

sqlite3 "$NEWS_DB" ".backup '$BACKUP_DIR/news-$STAMP.db'"
sqlite3 "$STORY_DB" ".backup '$BACKUP_DIR/story-$STAMP.db'"

MEDIA_BACKUP="$BACKUP_DIR/media-$STAMP"
mkdir -p "$MEDIA_BACKUP/uploads" "$MEDIA_BACKUP/story-data" \
  "$MEDIA_BACKUP/event-chronicle" "$MEDIA_BACKUP/compensation" \
  "$MEDIA_BACKUP/runninggame/Build" "$MEDIA_BACKUP/runninggame/BuildMobile"
rsync -a "$UPLOADS/" "$MEDIA_BACKUP/uploads/"
rsync -a "$STORY_DATA/" "$MEDIA_BACKUP/story-data/"
rsync -a "$EVENT_BASE/" "$MEDIA_BACKUP/event-chronicle/"
rsync -a "$COMPENSATION/" "$MEDIA_BACKUP/compensation/"
cp "$UNITY_ROOT/Build/webgame.data" "$MEDIA_BACKUP/runninggame/Build/webgame.data"
cp "$UNITY_ROOT/BuildMobile/webgame.data" "$MEDIA_BACKUP/runninggame/BuildMobile/webgame.data"

audit_data --details > "$BACKUP_DIR/audit-source-after-backup-$STAMP.json"
audit_data --strict

sqlite3 "$BACKUP_DIR/news-$STAMP.db" "PRAGMA integrity_check;"
sqlite3 "$BACKUP_DIR/story-$STAMP.db" "PRAGMA integrity_check;"
export IMS_INVENTORY_CORE_DB_PATH="$BACKUP_DIR/news-$STAMP.db"
export IMS_INVENTORY_STORY_DB_PATH="$BACKUP_DIR/story-$STAMP.db"
export IMS_INVENTORY_RUN_ID="$STAMP"
sh scripts/migration/legacy-inventory.sh > "$BACKUP_DIR/manifest-$STAMP.jsonl"
```

disposition JSON 的 `action` 只允许 `retain-completed-for-audit` 或
`purge-completed-after-backup`；`journal_files` 必须与目录中全部 completed `.json` 文件名精确
相等，另需非空 `approved_by` 和 `approved_at`。上面的命令选择保留 completed journal 供审计；
它不会伪造 completed，也不会自动批准失败任务。示例结构为：

```json
{
  "action": "retain-completed-for-audit",
  "journal_files": ["<journal-id>.json"],
  "approved_by": "<migration-owner>",
  "approved_at": "2026-07-21T12:00:00Z"
}
```

### 7.1 离线迁移制品闸门

上述在线备份和媒体副本完成后，才从副本生成 D1 SQL、reject manifest 和严格 R2
manifest。以下命令全部是本地离线操作；不含 `--remote`，不会访问 Cloudflare：

```sh
pnpm --filter @imsweb/api run migration:d1:export core "$BACKUP_DIR/news-$STAMP.db" \
  "$BACKUP_DIR/core-$STAMP.sql" "$STAMP" --snapshot \
  --rejects "$BACKUP_DIR/core-$STAMP.rejects.json" \
  --legacy-json "$BACKUP_DIR/core-legacy-$STAMP.json"
pnpm --filter @imsweb/api run migration:d1:export story "$BACKUP_DIR/story-$STAMP.db" \
  "$BACKUP_DIR/story-$STAMP.sql" "$STAMP" --snapshot \
  --rejects "$BACKUP_DIR/story-$STAMP.rejects.json" \
  --legacy-json "$BACKUP_DIR/story-legacy-$STAMP.json"

# 两个 manifest 都必须存在且为空；export 返回 2 时不得导入。
jq -e '.rejects | length == 0' "$BACKUP_DIR/core-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/story-$STAMP.rejects.json"

# compensation 为空时不需要 disposition；非空时必须预先人工批准一个覆盖全部 completed
# journal 的 JSON。pending/running/failed、非法 journal 或未覆盖 completed 都会阻断。
(
  set --
  if test -n "$(find "$MEDIA_BACKUP/compensation" -mindepth 1 -maxdepth 1 -print -quit)"; then
    : "${COMPENSATION_DISPOSITION:?set an absolute approved disposition JSON path}"
    set -- --compensation-disposition "$COMPENSATION_DISPOSITION"
  fi
  pnpm run migration:media:manifest -- \
    --core-db "$BACKUP_DIR/news-$STAMP.db" \
    --story-db "$BACKUP_DIR/story-$STAMP.db" \
    --uploads "$MEDIA_BACKUP/uploads" \
    --story-data "$MEDIA_BACKUP/story-data" \
    --event-base "$MEDIA_BACKUP/event-chronicle" \
    --compensation-dir "$MEDIA_BACKUP/compensation" \
    --unity-root "$MEDIA_BACKUP/runninggame" \
    --run-id "$STAMP" \
    --audit-report "$BACKUP_DIR/formal-audit-$STAMP.json" \
    --output "$BACKUP_DIR/r2-$STAMP.json" "$@"
)

jq -e '.migration_ready == true' "$BACKUP_DIR/formal-audit-$STAMP.json"
jq -e '[.manifest.entries[]
  | select(.logicalKey | startswith("unity/runninggame/"))
  | .logicalKey] == [
    "unity/runninggame/Build/webgame.data",
    "unity/runninggame/BuildMobile/webgame.data"
  ]' "$BACKUP_DIR/r2-$STAMP.json"
jq -e --arg run "$STAMP" --slurpfile audit "$BACKUP_DIR/formal-audit-$STAMP.json" '
  .auditGate.version == 1 and
  .auditGate.runId == $run and
  .auditGate.migrationReady == true and
  $audit[0].run_id == $run and
  $audit[0].migration_ready == true and
  .auditGate.sourceProof == $audit[0].source_proof and
  .auditGate.compensationDisposition == ($audit[0].compensation.disposition // null)
' "$BACKUP_DIR/r2-$STAMP.json"

# meta 与刚生成的 merged R2 manifest 使用同一个 run ID；rejects 非空时没有 SQL/snapshot。
pnpm run migration:d1:chronicle -- export \
  "$MEDIA_BACKUP/event-chronicle/meta" "$BACKUP_DIR/r2-$STAMP.json" \
  "$BACKUP_DIR/chronicle-$STAMP.sql" "$STAMP" \
  --rejects "$BACKUP_DIR/chronicle-$STAMP.rejects.json" \
  --snapshot-json "$BACKUP_DIR/chronicle-$STAMP.snapshot.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/chronicle-$STAMP.rejects.json"

# 只导入没有绑定任何 Worker 的本地 migration-only D1。
D1_PERSIST="$BACKUP_DIR/d1-local-$STAMP"
pnpm --filter @imsweb/api exec wrangler d1 migrations apply CORE_DB \
  --local --persist-to "$D1_PERSIST"
pnpm --filter @imsweb/api exec wrangler d1 migrations apply STORY_DB \
  --local --persist-to "$D1_PERSIST"
pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --file "$BACKUP_DIR/core-$STAMP.sql" --yes
pnpm --filter @imsweb/api exec wrangler d1 execute STORY_DB \
  --local --persist-to "$D1_PERSIST" --file "$BACKUP_DIR/story-$STAMP.sql" --yes
CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT run_id,phase FROM _ims_core_snapshot_guard;
   SELECT run_id,status FROM _ims_core_snapshot_runs WHERE run_id='$STAMP';
   SELECT name FROM sqlite_master WHERE type='table'
     AND (name='_ims_core_snapshot_assertion'
          OR name GLOB '_ims_core_snapshot_stage_*');" \
  > "$BACKUP_DIR/core-run-gate-$STAMP.json"
jq -e --arg run "$STAMP" \
  '.[0].results == [] and
   .[1].results == [{run_id:$run,status:"completed"}] and
   .[2].results == []' \
  "$BACKUP_DIR/core-run-gate-$STAMP.json"

CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute STORY_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT run_id,phase FROM _ims_story_snapshot_guard;
   SELECT run_id,status,snapshot_hash FROM _ims_story_snapshot_runs WHERE run_id='$STAMP';
   SELECT run_id,source_sha256 FROM story_import_runs WHERE run_id='$STAMP';
   SELECT name FROM sqlite_master WHERE type='table'
     AND (name='_ims_story_snapshot_assertion'
          OR name GLOB '_ims_story_snapshot_stage_*');" \
  > "$BACKUP_DIR/story-run-gate-$STAMP.json"
jq -e --arg run "$STAMP" \
  '.[1].results[0].snapshot_hash as $hash |
   .[0].results == [] and
   .[1].results == [{run_id:$run,status:"completed",snapshot_hash:$hash}] and
   .[2].results == [{run_id:$run,source_sha256:$hash}] and
   .[3].results == []' \
  "$BACKUP_DIR/story-run-gate-$STAMP.json"

# Core 对账目标是六表 rows 加 sqlite_sequence 高水位；缺失 row 显式输出 null。
CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT id,username,password,dept,producername FROM users ORDER BY id;
   SELECT id,title,image,thumbnail,content,date,author FROM news ORDER BY id;
   SELECT id,username,producername,action,target,ip,time FROM logs ORDER BY id;
   SELECT id,image1_url,image2_url,hash1,hash2,ip,status,created_at FROM cards ORDER BY id;
   SELECT id,title,name,contact,image_url,created_at FROM events ORDER BY id;
   SELECT id,card_id,emoji,count FROM card_emojis ORDER BY id;
   SELECT name,seq FROM sqlite_sequence WHERE name IN ('users','news','logs','cards','events','card_emojis') ORDER BY name;" \
  > "$BACKUP_DIR/core-d1-local-raw-$STAMP.json"
jq '(.[6].results | map({key:.name,value:.seq}) | from_entries) as $seq |
    {users:.[0].results,news:.[1].results,logs:.[2].results,cards:.[3].results,
     events:.[4].results,card_emojis:.[5].results,
     sqliteSequence:{users:($seq.users // null),news:($seq.news // null),
       logs:($seq.logs // null),cards:($seq.cards // null),
       events:($seq.events // null),card_emojis:($seq.card_emojis // null)}}' \
  "$BACKUP_DIR/core-d1-local-raw-$STAMP.json" > "$BACKUP_DIR/core-d1-local-$STAMP.json"
pnpm --filter @imsweb/api run migration:d1:reconcile \
  "$BACKUP_DIR/core-legacy-$STAMP.json" "$BACKUP_DIR/core-d1-local-$STAMP.json" \
  migrations/fixtures/critical-fields.json \
  --rejects "$BACKUP_DIR/core-local-reconciliation-$STAMP.rejects.json"
jq -e '(.differences | length == 0) and (.rejects | length == 0)' \
  "$BACKUP_DIR/core-local-reconciliation-$STAMP.rejects.json"

pnpm run migration:r2:transfer -- transfer \
  --manifest "$BACKUP_DIR/r2-$STAMP.json"
pnpm run migration:r2:transfer -- transfer \
  --manifest "$BACKUP_DIR/r2-$STAMP.json" --apply \
  --fixture-dir "$BACKUP_DIR/r2-fixture-$STAMP" \
  --report "$BACKUP_DIR/r2-fixture-report-$STAMP.json"
pnpm run migration:r2:transfer -- verify \
  --manifest "$BACKUP_DIR/r2-$STAMP.json" \
  --fixture-dir "$BACKUP_DIR/r2-fixture-$STAMP" \
  --scope uploads --scope Data \
  --scope assets/images/eventchronicle/events/upload \
  --scope assets/images/eventchronicle/events/used \
  --scope unity/runninggame

# fixture transport 使用独立 SQLite；把同批 index 精确装入上面的 local CORE_DB 后再执行 Chronicle。
sqlite3 "$BACKUP_DIR/r2-fixture-$STAMP/object-index.sqlite" \
  > "$BACKUP_DIR/r2-object-index-$STAMP.sql" <<'SQL'
SELECT 'INSERT INTO object_index
  (logical_key,object_id,state,byte_size,content_type,sha256,etag,created_at,updated_at)
  VALUES (' || quote(logical_key) || ',' || quote(object_id) || ',' || quote(state) || ',' ||
  quote(byte_size) || ',' || quote(content_type) || ',' || quote(sha256) || ',' || quote(etag) || ',' ||
  quote(created_at) || ',' || quote(updated_at) || ');'
FROM object_index ORDER BY logical_key;
SQL
pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --file "$BACKUP_DIR/r2-object-index-$STAMP.sql" --yes
pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --file "$BACKUP_DIR/chronicle-$STAMP.sql" --yes

CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT run_id,phase FROM _ims_chronicle_snapshot_guard;
   SELECT run_id,status,snapshot_hash FROM _ims_chronicle_snapshot_runs WHERE run_id='$STAMP';
   SELECT name FROM sqlite_master WHERE type='table' AND
     (name='_ims_chronicle_snapshot_assertion' OR name GLOB '_ims_chronicle_snapshot_stage_*');" \
  > "$BACKUP_DIR/chronicle-run-gate-$STAMP.json"
jq -e --arg run "$STAMP" '
  .[0].results == [] and (.[1].results | length == 1) and
  .[1].results[0].run_id == $run and .[1].results[0].status == "completed" and
  .[2].results == []' "$BACKUP_DIR/chronicle-run-gate-$STAMP.json"

CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT activity_id,document_json,updated_at,commit_token
     FROM chronicle_metadata ORDER BY activity_id;
   SELECT id,activity_id,filename,uploader,uploaded_at,status,logical_key,idempotency_key
     FROM chronicle_items ORDER BY id;
   SELECT logical_key,object_id,state,byte_size,content_type,sha256
     FROM object_index
    WHERE state IN ('pending','ready') AND
      (logical_key LIKE 'assets/images/eventchronicle/events/upload/%'
       OR logical_key LIKE 'assets/images/eventchronicle/events/used/%')
    ORDER BY logical_key;" > "$BACKUP_DIR/chronicle-d1-local-raw-$STAMP.json"
jq '{chronicle_metadata:.[0].results,chronicle_items:.[1].results,
     object_index:.[2].results}' "$BACKUP_DIR/chronicle-d1-local-raw-$STAMP.json" \
  > "$BACKUP_DIR/chronicle-d1-local-$STAMP.json"
pnpm run migration:d1:chronicle -- reconcile \
  "$BACKUP_DIR/chronicle-$STAMP.snapshot.json" "$BACKUP_DIR/chronicle-d1-local-$STAMP.json" \
  --rejects "$BACKUP_DIR/chronicle-local-reconciliation-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/chronicle-local-reconciliation-$STAMP.rejects.json"
```

生成的 D1 文件不得包含 `foreign_keys=OFF` 或内嵌 `BEGIN`/`COMMIT`；仓库的
`wrangler-d1-import.test.js` 会在临时 local D1 中执行 Core `A -> B -> B`、同一
`run_id` 不同快照拒绝、次级唯一键在新主键上复用，以及经源 SHA-256 确认的空快照重复导入。
Core 测试同时覆盖 `sqlite_sequence` 高水位大于 `MAX(id)`、变化快照与重复导入，确保下一个
AUTOINCREMENT ID 不会复用已删除历史 ID；无来源 sequence 行则要求目标也无对应行。
Core legacy/目标 JSON 都必须是六张表 arrays 加固定六键的 `sqliteSequence`；缺少来源 sequence
row 的键显式为 JSON `null`，不得从 `MAX(id)` 推测或转成字符串。
Story 也覆盖重复/变化/冲突/空快照、运行时行保留和尾部截断。Core 六表从 staging 按 FK
顺序精确重建；Story base 按来源主键 UPSERT，landing/card/link 只在迁移拥有分区内按 staging
精确对账和清理，因此保留 `runtime` 行及无法证明由迁移拥有的额外 base 行。Story 对账还会
从 landing 派生 canonical card/link，逐字段核对内容和来源映射。

`run_id` 必须匹配 `[A-Za-z0-9][A-Za-z0-9._-]{0,79}`。Core 与 Story 中同一 `run_id` 都只能
对应同一 exact snapshot hash：相同快照重跑是幂等的，不同快照会在创建 staging 或修改目标
业务表前失败。Core 六张表全空时 export 默认拒绝；七张 Story 表全空时，即使 base 表非空，
Story export 也默认拒绝。只有在确知权威源本来就应为空时，先独立记录对应备份的
`shasum -a 256`，再分别传入 `--confirm-empty-core-source-sha256 <sha256>` 或
`--confirm-empty-story-source-sha256 <sha256>`。不得用命令替换自动回填确认值。
编年史 `meta` 为空时也默认拒绝；只有人工确认空目录就是权威快照后，独立记录目录快照
SHA-256，并给上面的 Chronicle export 追加
`--confirm-empty-source-sha256 <sha256>`，不得自动从工具报错中提取确认值重跑。

export 通过 `mode=ro&immutable=1` URI 在一个只读事务视图内读取所有表，因此 WAL-mode
header 的静态备份也不会被读取动作创建 WAL/SHM；读取前后仍核对源文件身份、大小、时间和
SHA-256。源路径是 symbolic link、预先存在精确同名的 `-wal`、`-journal` 或 `-shm` sidecar，
或读取期间源文件变化时，不会生成任何制品。TEXT 会同时读取原始 bytes，必须通过严格 UTF-8
解码和逐字节 roundtrip。字段出现 BLOB、异常 SQLite storage class、非法 UTF-8、NUL、非 NFC
文本或超出 JavaScript 安全整数范围的整数时，只生成 reject manifest，不生成 SQL 或 legacy
JSON；raw JSON/hash 不会静默做 Unicode 归一化。`--legacy-json` 与 SQL 来自同一事务视图，
应直接作为后续 reconcile 的源输入。

Core/Story SQL 的 guard、staging 表和最终字段断言只供 migration-only D1 使用。Core 对整个
目标双向断言；Story 对迁移拥有的 landing/card/link 分区双向断言，并确认全部来源 base 行
已正确落地，但不会把运行时或无所有权标记的额外行误判为 stale。
正式导入前必须从所有 production、preview 和开发 Worker binding 中移除目标 database ID；
仅停止 HTTP 流量不等于解除写入混用风险。成功导入会删除 staging 和临时断言表，仅永久保留
对应空 guard 与 snapshot runs 作为互斥和审计状态，Story 还会写 `story_import_runs`。
若导入中断，非空 guard 会使同库后续导入因唯一约束失败；不要直接删除 guard 后重跑。
先保存 guard、run、残留 staging 以及六张目标表的导出，完成对账；对尚未切流的隔离目标，
默认处置是废弃并重建 D1。Core 与 Story 成功导入都必须确认 guard 为空、snapshot run 为
`completed`、Story audit hash 一致，且 `sqlite_master` 中不存在对应 staging/assertion，
再进入目标导出和 reconcile。任何 SQL/import、reject、外键检查或 reconcile 非零都终止批次。

编年史 `meta` 必须转换进 D1，不进入 R2；`.staging` 和 `.trash` 也不得进入正式清单。
`migration:media:manifest` 会把 `upload` 等待审核目录固定为 `pending`，不能改成 `ready`。
若使用 disposition，audit report 与 formal `auditGate` 都保存批准文件的绝对 path、SHA-256、
`approved_by` 和 `approved_at`，并把它纳入前后两次 frozen file `sourceProof`。audit 后替换
批准文件会以 `frozen source changed` 阻断 formal manifest。所有远端 apply/verify 还会在读取
credentials 前稳定重算 audit report SHA-256，并核对 run ID、ready、`sourceProof` 与 disposition
evidence；手写 generic manifest 只能用于本地 fixture。
fixture apply 会把对象写到隔离目录、把
`object_index` 写到本地 SQLite，并在 manifest 声明的 scopes 内做逐对象完整回读。出现 blocker、
missing、extra、bytes、SHA-256 或 MIME 差异均不得继续。远端所需的显式凭据和三重确认
不会从环境变量或 Wrangler 登录状态隐式读取：必须同时给出 `--remote`、需要写入时的
`--apply`、与 manifest 完全一致的 `--confirm-run-id`，以及权限为 `0600` 的绝对路径
credentials JSON。该文件只包含 `accountId`、`apiToken`、`r2AccessKeyId`、
`r2SecretAccessKey`、`bucket` 和 `databaseId`，不得写回仓库。`bucket` 与 `databaseId`
必须指向本批人工核准、未绑定任何在线 Worker 的专用目标。备份脚本、`check` 和 `test`
不执行远端迁移。

### 7.2 最终 Cloudflare 停写窗口

读路径和影子比对可以按业务域逐步推进；写路径不可以。账号、资讯、活动、名片、表情和
编年史共享 `CORE_DB`，媒体又共享同一次 `R2/object_index` 批次，因此 Core、Story、Chronicle
和 R2 必须在同一最终停写窗口使用同一个 `$STAMP` 整体导入、对账，并在全部闸门通过后一次性
切写。在此之前，只允许分域 shadow read，不允许任何共享 D1/R2 域先接受生产写入。

目标 `CORE_DB`/`STORY_DB` 必须是未绑定 production、preview 或开发 Worker 的隔离数据库，
最终导入期间 D1 不得收到任何在线写。下面的 `CORE_DB`、`STORY_DB` 和 credentials 中的
`databaseId` 必须指向同一批人工核准目标；先执行 migrations，然后按顺序执行：

```sh
# Core/Story 使用同一恢复点；Core 全表 exact，Story 对迁移拥有分区 exact。
pnpm --filter @imsweb/api exec wrangler d1 migrations apply CORE_DB --remote
pnpm --filter @imsweb/api exec wrangler d1 migrations apply STORY_DB --remote
pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB --remote \
  --file "$BACKUP_DIR/core-$STAMP.sql" --yes
pnpm --filter @imsweb/api exec wrangler d1 execute STORY_DB --remote \
  --file "$BACKUP_DIR/story-$STAMP.sql" --yes

# 专用目标 bucket 由本批 merged manifest 全量拥有。exact prune 同时把映射写入同一 CORE_DB.object_index，
# 并收敛 manifest scopes 内的旧映射与不再被引用的旧 immutable object。
pnpm run migration:r2:transfer -- transfer \
  --manifest "$BACKUP_DIR/r2-$STAMP.json" --apply --remote \
  --credentials "$R2_CREDENTIALS" --confirm-run-id "$STAMP" \
  --prune-exact-scopes --confirm-prune-run-id "$STAMP" \
  --report "$BACKUP_DIR/r2-remote-transfer-$STAMP.json"

# Chronicle SQL 必须在 object_index 就绪后执行；它会断言 exact metadata/items/object association。
pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB --remote \
  --file "$BACKUP_DIR/chronicle-$STAMP.sql" --yes

# 正式验收独立执行 full-bucket exact；不得和 --scope 混用。
pnpm run migration:r2:transfer -- verify \
  --manifest "$BACKUP_DIR/r2-$STAMP.json" --remote \
  --credentials "$R2_CREDENTIALS" --confirm-run-id "$STAMP" \
  --bucket-exact \
  --report "$BACKUP_DIR/r2-remote-bucket-verify-$STAMP.json"
```

这个 destructive convergence 只能在最终停写窗口、人工核准的专用目标上执行。目标 bucket
和 `object_index` 必须完全归本批 merged manifest 所有，不能混放其他应用或保留未声明对象。
`--prune-exact-scopes` 收敛带归属证据的 stale mapping/object；独立的 `--bucket-exact` 再比较
全表 mapping 与 `objects/` 全桶，因此无 index orphan、跨 scope extra、missing、bytes、SHA-256
或 MIME 任一差异都会阻断切写。正式报告必须为 `physicalCoverage=full-bucket`；局部 `--scope`
只用于 shadow/诊断，不能替代正式验收。

随后导出 Chronicle 三表并对账，同时检查 Core/Chronicle guard、run 和 transient tables：

```sh
CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --remote --json --command \
  "SELECT run_id,phase FROM _ims_core_snapshot_guard;
   SELECT run_id,status FROM _ims_core_snapshot_runs WHERE run_id='$STAMP';
   SELECT run_id,phase FROM _ims_chronicle_snapshot_guard;
   SELECT run_id,status,snapshot_hash FROM _ims_chronicle_snapshot_runs WHERE run_id='$STAMP';
   SELECT name FROM sqlite_master WHERE type='table' AND
     (name='_ims_core_snapshot_assertion' OR name GLOB '_ims_core_snapshot_stage_*'
      OR name='_ims_chronicle_snapshot_assertion' OR name GLOB '_ims_chronicle_snapshot_stage_*');" \
  > "$BACKUP_DIR/core-chronicle-run-gate-$STAMP.json"
jq -e --arg run "$STAMP" '
  .[0].results == [] and
  .[1].results == [{run_id:$run,status:"completed"}] and
  .[2].results == [] and
  (.[3].results | length == 1) and
  .[3].results[0].run_id == $run and .[3].results[0].status == "completed" and
  .[4].results == []' "$BACKUP_DIR/core-chronicle-run-gate-$STAMP.json"

CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --remote --json --command \
  "SELECT activity_id,document_json,updated_at,commit_token
     FROM chronicle_metadata ORDER BY activity_id;
   SELECT id,activity_id,filename,uploader,uploaded_at,status,logical_key,idempotency_key
     FROM chronicle_items ORDER BY id;
   SELECT logical_key,object_id,state,byte_size,content_type,sha256
     FROM object_index
    WHERE state IN ('pending','ready') AND
      (logical_key LIKE 'assets/images/eventchronicle/events/upload/%'
       OR logical_key LIKE 'assets/images/eventchronicle/events/used/%')
    ORDER BY logical_key;" > "$BACKUP_DIR/chronicle-d1-raw-$STAMP.json"
jq '{chronicle_metadata:.[0].results,chronicle_items:.[1].results,
     object_index:.[2].results}' "$BACKUP_DIR/chronicle-d1-raw-$STAMP.json" \
  > "$BACKUP_DIR/chronicle-d1-$STAMP.json"
pnpm run migration:d1:chronicle -- reconcile \
  "$BACKUP_DIR/chronicle-$STAMP.snapshot.json" "$BACKUP_DIR/chronicle-d1-$STAMP.json" \
  --rejects "$BACKUP_DIR/chronicle-reconciliation-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/chronicle-reconciliation-$STAMP.rejects.json"
```

同一窗口还必须完成第 7.1 节的 Core/Story 全字段导出与 reconcile、两个数据库的
`foreign_key_check`、R2 报告零 differences 和 Worker 冒烟。所有 gate 同时为绿后才更新
bindings/routes、一次性启用 Worker 写入。切写后不得再次运行 legacy exact importer；后续数据
变更只能走 Worker 的正常业务写路径或另行设计的显式前向 migration。

媒体与编年史目录必须和数据库恢复点配对。停写前可以向可丢弃的 shadow 目标做预演复制，
但不能把预演制品沿用为最终批次。最终窗口要先全局停写，再一次性生成同一 `$STAMP` 的 exact
数据库备份、媒体副本、audit 和 manifest；manifest 生成后不得再向副本补增量。任一权威源
发生变化都必须废弃该批制品、换新 run ID 从备份开始重做。恢复点至少覆盖：

- 普通上传实际源 `$UPLOADS`；
- 剧情图片实际源 `$STORY_DATA`；
- 编年史实际源 `$EVENT_BASE`；
- 删除补偿 journal 实际源 `$COMPENSATION`；
- 生产服务器上仓库外的任何实际媒体目录。

上述 `STORY_DATA`、`EVENT_BASE`、`UPLOADS` 和 `COMPENSATION` 是可变状态备份的实际源路径。同步命令不得使用未展开的仓库默认路径，也不得在未核对目标目录时使用 `--delete`。生产 inventory 强制使用 `IMS_INVENTORY_*_DB_PATH` 指向刚生成的在线备份，并要求唯一 `IMS_INVENTORY_RUN_ID`；它不会把运行中的主数据库当作快照。

末尾的审计再次验证备份窗口结束时的权威源，并将报告与恢复点配对；它不代替对备份副本本身的验证。备份完成后，还要对两个数据库副本执行 `PRAGMA integrity_check`，将媒体副本与清单核对文件数、总字节数和 SHA-256。定期在隔离目录做恢复演练；“备份命令成功”不等于“可以恢复”。

## 8. 发布与冒烟

发布包和可变数据必须分开。即使可变数据尚留在旧项目目录，也通过六个绝对路径变量引用；
新进程始终从第 3 节生成的完整 `/srv/ims/current` release 启动。发布期间不得覆盖 live 目录，
数据库和媒体的权威路径也不能随代码切换变化。

建议的切换顺序：

1. 暂停或限制写请求；
2. 完成最终数据库和媒体备份；
3. 执行 `pnpm run migration:release:activate -- "$STAGING" "$RELEASE_ID"`，确认 `current`
   指向包含匹配 lockfile、host-installed `node_modules`、server/client/node-client 构建物的完整
   release，再重启统一 Hono Node；
4. 在回环端口验证普通健康检查，以及 pending 匿名 `401`、`op` Token `200`；
5. 首次启用容器入口时，确认第 4 步通过后再执行容器内 `nginx -t`，并以 `docker compose -f deploy/compose.yaml up -d --force-recreate nginx` 应用模板；
6. 通过公网 HTTPS 验证登录、读接口、受保护写接口、Wiki SSR、普通图片及 pending `401/200`；
7. 恢复写请求并观察错误日志、延迟和 4xx/5xx；
8. 保存发布后清单和时间点。

## 9. 回滚

代码回滚与数据回滚必须分开判断。

本次加固版本是安全回滚下限。正常代码回滚只能切到仍具备敏感路径、pending/名片鉴权、显式 JWT 密钥和上传校验的完整旧 release；稳定代理目录中的 `ims-security.conf` 和正常 Compose 服务始终保留，不随应用 release 回滚。若只发生代码问题且没有执行破坏性数据迁移，停止新进程、原子切回合格 release，并继续使用完全相同的六个绝对数据路径。不得把旧代码覆盖回 live 目录，也必须保留切换后产生的数据库和上传数据。

```sh
: "${PREVIOUS_RELEASE_ID:?set the already existing, validated release ID}"
pnpm run migration:release:rollback -- "$PREVIOUS_RELEASE_ID"
test "$(readlink "$IMS_CURRENT_LINK")" = "$IMS_RELEASES_DIR/$PREVIOUS_RELEASE_ID"
```

rollback 会在锁内重新执行同一 frozen-install、静态清单、无监听 runtime 与路径隔离 preflight，
然后只原子替换 `current` 软链接；不会复用新 release 的 staging rename，也不会改动六个共享数据路径。

若确实被迫退到加固前应用，先用 `deploy/compose.emergency.yaml` 覆盖正常模式：

```sh
docker compose -f deploy/compose.yaml -f deploy/compose.emergency.yaml config
docker compose -f deploy/compose.yaml -f deploy/compose.emergency.yaml \
  run --rm --no-deps nginx nginx -t
docker compose -f deploy/compose.yaml -f deploy/compose.emergency.yaml \
  up -d --force-recreate nginx
```

确认 pending 编年史和名片原图均为 `404` 后才能切旧进程。该模式会暂时中断全部名片图片，不能作为长期状态；恢复加固应用后只使用基础 `deploy/compose.yaml` 强制重建容器以退出应急模式。旧硬编码 JWT 版本也不得重新使用已经泄露的密钥。

若新版本写入了旧版本无法理解的数据：

1. 先关闭所有写入口；
2. 额外保存故障现场的数据库、媒体和日志；
3. 评估是否可以做向后兼容转换；
4. 只有确认必须丢弃切换后写入并得到业务授权时，才恢复成对的数据库与媒体快照；
5. 运行完整性检查和冒烟后再恢复流量。

所有数据库变更采用 expand/contract：先增加兼容字段或表，等新旧代码都不再依赖旧结构后，另行窗口清理。兼容阶段禁止在普通代码发布中删除列、重编号主键或移动权威媒体。

## 10. 故障定位

- Nginx `502`：执行 `docker compose -f deploy/compose.yaml logs --tail=200 nginx`，再检查宿主机 `127.0.0.1:3000` 和应用进程日志；
- Node 与 Worker JWT 不兼容：核对两端的 `IMS_JWT_SECRET` 是否完全相同；
- SQLite `database is locked`：确认是否存在多个非预期进程、长事务或备份方式错误，不要直接删除 WAL/SHM；
- 图片 `404`：核对数据库相对路径、实际文件、大小写和 Nginx `/image/` 转发；
- 编年史状态异常：同时检查 `meta`、`upload` 和 `used`，不要只恢复其中一个目录；
- 原生模块启动失败：在目标主机重新用 pnpm 安装，不能复制其他平台的 `node_modules`。
