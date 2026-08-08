# GitHub Actions 自动部署

IMSWeb 使用 GitHub-hosted runner 构建并发布 API 容器镜像，再通过 SSH 调用生产机上的受锁
Compose 发布脚本。API 镜像同时包含 Hono 服务、Web 静态文件和 PostgreSQL migrations；生产
Nginx、数据库卷、R2 凭据和应用秘密不进入 GitHub 构建制品。

自动部署适用于单台 Linux 主机上的 PostgreSQL/API Compose 栈、宿主机 Nginx 和 Cloudflare
R2。当前 `api` 服务是单副本并固定绑定回环端口，容器重建会产生短暂中断；本流程不宣称
blue/green 或零停机。

## 1. 工作流

仓库包含两个工作流：

- `.github/workflows/ci.yml`：在 Pull Request 和 `main` push 上运行 `pnpm run check` 与
  `pnpm run test`；
- `.github/workflows/deploy.yml`：发布稳定 SemVer Tag，并允许从 GitHub Actions 页面重新部署
  已存在的 Tag。

Tag 必须使用 `vMAJOR.MINOR.PATCH`，例如 `v1.4.0`，并指向 `origin/main` 已包含的 commit。
Tag push 会运行完整门禁、构建 `apps/api/Dockerfile`、把镜像推送到 GHCR、生成 provenance，
最后按 registry 返回的 `sha256` digest 部署。镜像同时记录 release Tag 和完整 commit SHA；
部署前要求两个镜像标签解析到同一个 digest。

手动触发不会重新构建镜像。操作者输入已有 Tag，并确认该版本与当前生产数据兼容；工作流只解析
这个 Tag 与 commit 标签共同指向的已有 digest。这样同一 release 不会因重新构建产生不同
制品。解析后还会使用 `gh attestation verify` 校验 SLSA provenance，要求签名者是本仓库的
`.github/workflows/deploy.yml`、源 ref 是该 Tag、源 digest 是对应 commit，且构建不来自
self-hosted runner。

所有外部 Actions 固定到完整 commit SHA。Workflow 的默认权限是只读；只有发布镜像的 job
获得 `packages: write`、`attestations: write` 和 `id-token: write`，部署 job 只有
`contents: read` 和 `packages: read`。部署 job 使用 GitHub 为本次运行自动生成的短期
`GITHUB_TOKEN` 拉取镜像，不需要创建或保存长期 GHCR PAT。

Docker 的 Buildx、Registry Login 和 Build/Push Actions 分别使用 v4、v4 和 v7 主版本；这些
版本声明使用 Node.js 24 Action runtime，并继续固定到完整 release commit SHA。它们要求
Actions Runner `v2.327.1` 或更高版本，GitHub-hosted `ubuntu-24.04` runner 满足该要求。

## 2. GitHub 仓库设置

在仓库 Settings -> Environments 创建 `production`。配置以下 Environment variables：

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | `prod.example.com` | SSH 主机名，不包含用户或端口 |
| `DEPLOY_PORT` | `22` | 可留空，默认 `22` |
| `DEPLOY_USER` | `imsdeploy` | 生产部署用户 |
| `DEPLOY_ROOT` | `/srv/imsweb` | release、备份和发布记录根目录 |
| `PUBLIC_BASE_URL` | `https://www.example.com` | 不带路径、查询或凭据的正式 HTTPS origin |

配置以下 Environment secrets：

| 名称 | 说明 |
| --- | --- |
| `DEPLOY_SSH_PRIVATE_KEY` | 只授权目标部署用户的专用 Ed25519 私钥 |
| `DEPLOY_SSH_KNOWN_HOSTS` | 通过受信渠道核验的目标主机 host key 完整行 |

不要在 Workflow 中临时运行 `ssh-keyscan` 并立即信任结果。不要把 JWT、PostgreSQL 或 R2
凭据保存为 GitHub 部署 secret；它们只存在于生产机的环境文件中。

`GITHUB_TOKEN` 由 GitHub Actions 自动生成，不需要添加到 Environment secrets。部署步骤只把
它通过 SSH 标准输入发送给目标机，目标机在隔离的临时 Docker/Podman 认证配置中登录 GHCR，
发布结束或失败后都会删除该配置。Token 不进入 SSH 参数、Compose 环境文件或发布记录，并会在
job 结束后失效。

若 Tag 创建本身就是发布批准，可以不为 `production` 增加 required reviewer，从而保持 Tag
无人值守部署。需要双人审批时再启用 required reviewer；此时 Tag 仍自动启动 Workflow，但部署
job 会等待审批。

若 `production` 使用自定义 deployment branches and tags，必须同时添加 `main` branch 和
`v*.*.*` tag。前者允许从默认分支的 Actions 页面手动部署已有 Tag，后者允许稳定版本 Tag 自动
部署；只配置 tag 会使 `workflow_dispatch` 的 deploy job 无法进入 production Environment。

仓库还应配置：

1. `main` ruleset 要求 `Validate repository` 检查通过；
2. Tag ruleset 保护 `refs/tags/v*`，限制创建者并禁止更新和删除；
3. Actions 策略只允许所需来源，并要求完整 commit SHA；
4. GHCR package 与本仓库关联；若 package 未继承仓库权限，在 package Settings 的
   `Manage Actions access` 中为本仓库授予 `Read`。私有 package 由本次运行的 `GITHUB_TOKEN`
   临时登录，生产机不需要预置长期 registry credential；公开 package 也沿用同一受控流程。

## 3. 生产机准备

目标是 Linux 主机。部署用户需要以下命令：

```text
bash, base64, cp, curl, flock, grep, ln, mktemp, rm, sha256sum, docker compose
```

也可设置 `IMS_CONTAINER_CLI=podman` 使用 `podman compose`。部署用户必须能操作目标容器运行时；
加入 Docker group 通常等同于主机 root 权限，应优先使用 rootless 容器或只允许执行受控部署脚本
的 sudo 规则。

使用 rootless Docker 时，daemon、Docker CLI context 和 SSH 部署必须属于同一个
`DEPLOY_USER`。认证包装脚本会把该用户的 Docker `config.json` 与 `contexts` 复制到隔离的临时
配置，并只在临时配置中写入 GHCR 凭据；不会改写原始 `~/.docker/config.json`。不要只在
`.bashrc` 中设置 `DOCKER_HOST`，因为 GitHub Actions 使用的非交互 SSH 不保证读取该文件。
安装 rootless Docker 后持久选择对应 context，并从另一台机器验证非交互 SSH：

```sh
ssh imsdeploy@prod.example.com 'docker context use rootless'
ssh imsdeploy@prod.example.com \
  'docker context show; docker info --format "{{json .SecurityOptions}}"'
```

结果必须指向部署用户的 `/run/user/<uid>/docker.sock`，且 security options 包含 `rootless`。
使用 systemd user service 时还应为部署用户启用 linger，确保无人登录时 daemon 仍可用。

创建生产目录和仅部署用户可读的环境文件：

```sh
sudo install -d -m 0700 -o imsdeploy -g imsdeploy /srv/imsweb
sudo install -d -m 0755 -o root -g root /etc/imsweb
sudo sh -c 'set -eu; test ! -e /etc/imsweb/production.env; \
  install -m 0600 -o imsdeploy -g imsdeploy /dev/null /etc/imsweb/production.env'
```

`/etc/imsweb/production.env` 使用 `deploy/compose.yaml` 的变量名，至少包含：

```dotenv
COMPOSE_PROFILES=
IMS_POSTGRES_IMAGE=postgres:18.4-alpine
IMS_POSTGRES_DB=imsweb
IMS_POSTGRES_USER=imsweb
IMS_POSTGRES_PASSWORD=<secret>

IMS_API_NODE_ENV=production
IMS_API_DATABASE_URL=postgresql://imsweb:<url-encoded-password>@postgres:5432/imsweb
IMS_JWT_SECRET=<high-entropy-secret>
IMS_COOKIE_SECURE=true
IMS_CLIENT_ADDRESS_SOURCE=nginx

IMS_OBJECT_STORAGE=s3
IMS_S3_BUCKET=<production-bucket>
IMS_S3_REGION=auto
IMS_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
IMS_S3_FORCE_PATH_STYLE=false
IMS_S3_PREFIX=
IMS_PUBLIC_READ_URL_BASE=https://objects.example.com
AWS_ACCESS_KEY_ID=<bucket-scoped-access-key>
AWS_SECRET_ACCESS_KEY=<bucket-scoped-secret>
```

不要照搬 `deploy/.env.example` 的本地密码、RustFS profile 或 development 配置。环境文件必须是
普通文件，且 group/others 不得有任何权限。若使用其他绝对路径，在部署用户的非交互 SSH 环境中
设置 `IMS_RUNTIME_ENV_FILE`；默认路径是 `/etc/imsweb/production.env`。

生产机还需预先安装并验证宿主机 Nginx。入口必须只代理到回环地址上的 Hono；完整配置见
[`deploy/nginx/`](../deploy/nginx/README.md)。

## 4. 发布流程

创建并推送签名或 annotated Tag：

```sh
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

Workflow 会按以下顺序执行：

1. 验证 Tag、commit 和 `main` 包含关系；
2. 安装 frozen dependencies，运行检查和测试；
3. 构建一次镜像，推送 Tag/SHA 标签并取得 digest；
4. 进入 `production` Environment 和 `imsweb-production` concurrency group；
5. 从目标 Tag 检出 `deploy/compose.yaml` 与部署脚本，并从当前 Workflow commit 单独检出认证
   包装脚本；因此修复后的 Workflow 可以重部署尚未包含包装脚本的旧 Tag；
6. 通过 SSH 上传上述文件；短期 `GITHUB_TOKEN` 只从 SSH stdin 传给认证包装脚本，并在临时
   Docker/Podman 配置中登录 GHCR；
7. 认证包装脚本从远端普通文件执行部署脚本；部署脚本 stdin 固定为 `/dev/null`，避免 Compose
   子进程消费令牌或尚未读取的脚本内容，退出时删除临时认证配置；
8. 取得发布锁，验证生产配置，启动 PostgreSQL 并创建 custom-format `pg_dump`；
9. 拉取 digest、重建 API，检查 `/api/wiki/test`、`/api/news` 和首页；
10. 要求远端输出 `Deployment completed.` 完成标记，再从 GitHub-hosted runner 验证正式 HTTPS
   入口；
11. 原子更新 `/srv/imsweb/current` 并写入发布记录。

生产状态位于：

```text
/srv/imsweb/releases/<tag>/
/srv/imsweb/current -> /srv/imsweb/releases/<tag>
/srv/imsweb/previous -> /srv/imsweb/releases/<previous-tag>
/srv/imsweb/backups/<timestamp>-<tag>/postgresql.dump
/srv/imsweb/deployments/<timestamp>-<tag>.json
```

Workflow 不在生产机执行 `git pull`，也不在生产机重新构建镜像。相同 Tag 的手动重新部署只有在
release metadata、Compose 文件、Tag digest 和 commit digest 全部一致时才会继续。
已有部署会先使用 `current` release 的 Compose 配置启动并备份 PostgreSQL；候选发布使用
`--no-deps` 只重建 API。PostgreSQL 镜像或配置升级必须走独立维护窗口，不能夹带在普通 Tag
发布中。

## 5. 回滚与恢复边界

候选容器启动、内部健康检查或生产机公网检查失败时，脚本会重新启动 `current` 指向的上一镜像，
并保持 `current` 不变。自动回滚只切换代码，不恢复 PostgreSQL 或 R2。

PostgreSQL migration 在 API 启动前执行，数据库变更必须遵循 expand/contract，使上一版本仍能
理解迁移后的 schema。禁止在普通 Tag 发布中删除列、重编号主键或迁移权威媒体。涉及数据库与
R2 配对恢复、停写或破坏性 migration 的版本不得依赖本自动流程，应走独立维护窗口和
`docs/operations-runbook.md`。

每次部署创建的 `pg_dump` 是代码发布前的数据库恢复点，不是与 R2 同窗口冻结的完整灾备快照。
不要自动恢复该文件。真实数据恢复必须先保留故障现场，匹配数据库与媒体恢复点，并取得明确
批准。

## 6. 手动重新部署

在 GitHub Actions 打开 `Deploy production`，选择 `Run workflow`：

1. 使用默认分支上的 Workflow；
2. 输入已有 `release_tag`；
3. 勾选数据兼容确认；
4. 提交并观察 `production` deployment。

手动部署旧 Tag 等价于代码回滚。若旧版本无法理解当前数据库，不能仅靠勾选确认继续；应先进入
维护窗口评估兼容转换或配对恢复。

若修复的是部署 Workflow 自身，不要继续 `Re-run jobs` 原 Tag 的历史运行，因为它仍使用历史
Workflow。应从已包含修复的默认分支进入 `Run workflow`，再输入已有 Tag；这样不会重新构建镜像，
但会使用修复后的调度步骤部署该 Tag 已有的 digest。

发布后核对 Workflow summary、GitHub Environment deployment history、生产机 release record、
Nginx/API 日志以及代表性 R2 对象。GitHub runner 的最终公网探测失败时 Workflow 会标红，但目标
主机可能已经完成并记录发布；此时先根据 `current` 和发布记录判断真实状态，不要盲目重跑。
