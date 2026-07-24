# Node 文件对象存储

Hono Node 活动运行时统一使用 `s3` 可变媒体存储；不设置 `IMS_OBJECT_STORAGE` 时默认创建
S3 client。S3 配置缺失时服务拒绝初始化，不会回退到本地磁盘。`filesystem` 适配器只保留给
显式迁移、测试和离线兼容流程。

业务代码只依赖 `ObjectStorage` 和 `CompensationService` 端口，Node 组合根负责选择
filesystem 或 S3 实例。S3 的对象字节保存在 bucket，上传状态、逻辑 key 映射和补偿任务保存在
当前 `IMS_DATABASE` 指向的统一数据库；两部分都通过抽象实例注入，domain 不感知 S3、SQLite 或
PostgreSQL。

S3 模式采用控制面与数据面分离：业务 URL 仍保持 `/uploads/*`、`/image/*` 等稳定路径，
Hono 完成数据库映射、对象存在性检查和私有资源鉴权后返回 `307` 短期签名 URL，浏览器随后
直接从 MinIO/S3 获取对象字节。上传、MIME/尺寸校验、格式转换、数据库提交和失败补偿始终由
Hono 执行。动态 `/api/thumbnail` 需要后端转换图片，是唯一保留后端读取对象正文的图片接口。

## 存储边界

S3 adapter 对业务保存与现有 `ObjectStorage` 端口相同的逻辑 key：

- `uploads/`：资讯、活动和名片上传；
- `assets/images/eventchronicle/events/`：编年史待审核、已使用、meta 和回滚对象；
- `Data/`：剧情图片。

新写入不会直接使用逻辑 key 作为 bucket key，而是保存为
`<IMS_S3_PREFIX>/__ims_s3/objects/<object-id>` 不可变对象。统一数据库中的
`s3_object_index` 负责逻辑 key 映射，`s3_upload_operations` 负责
`uploading -> pending/ready -> deleted` 状态迁移。延迟发布对象在业务事务提交并调用
`publish()` 前不可读；覆盖已有对象时继续提供旧 ready 版本，失败补偿会恢复旧映射。历史上按
逻辑 key 直接写入的对象仍可只读兼容，并在下一次写入后进入版本化映射。

以下内容不进入 S3：

- Core/Story 关系数据；SQLite 使用一个 `IMS_SQLITE_PATH`，PostgreSQL 使用一个
  `DATABASE_URL`；
- filesystem 模式的删除补偿仍由 `IMS_COMPENSATION_DIR` 指向本地持久卷；S3 模式的补偿、
  重试租约和隔离状态保存在统一数据库的 `s3_compensation_jobs`；
- 编年史幂等 journal 仍由 `IMS_IDEMPOTENCY_DIR` 指向本地持久卷；
- 构建后的 Web 静态文件，仍由 `IMS_PUBLIC_DIR` 提供。

## 配置

| 变量 | 要求 |
| --- | --- |
| `IMS_OBJECT_STORAGE` | `filesystem` 或 `s3`，默认 `s3`；filesystem 仅用于兼容流程 |
| `IMS_S3_BUCKET` | S3 模式必填；普通 bucket 名称 |
| `IMS_S3_REGION` | S3 模式必填；未设置时读取 `AWS_REGION` |
| `IMS_S3_PREFIX` | 可选；同一 bucket 内的隔离前缀，不含开头/结尾 `/` |
| `IMS_S3_ENDPOINT` | S3-compatible 服务可选；无凭据的 HTTP(S) URL |
| `IMS_S3_FORCE_PATH_STYLE` | 默认 `false`；MinIO 等服务通常使用 `true` |
| `IMS_S3_READ_URL_TTL_SECONDS` | 签名读取 URL 有效期，默认 `300`，允许 `30..3600` 秒 |

`IMS_S3_ENDPOINT` 会进入签名 URL，因此必须是浏览器可访问且由后端也能连接的地址。生产
MinIO 应使用独立 HTTPS 域名或对象入口，不要把容器内 DNS 名或回环地址签发给远端浏览器。
bucket 继续保持私有；待审核名片和编年史图片只在 Hono 鉴权通过后获得短期 URL。

AWS SDK 使用标准凭据链。部署到 EC2、ECS 或其他 AWS compute 时优先绑定 IAM Role；本地
或第三方 S3-compatible 服务可临时注入 `AWS_ACCESS_KEY_ID`、
`AWS_SECRET_ACCESS_KEY`，使用短期凭据时再注入 `AWS_SESSION_TOKEN`。真实凭据不得写入
`apps/api/.env.example`、release 或进程启动命令历史。

SQLite 在首次启用 S3 时幂等创建 `s3_*` 控制面表。PostgreSQL 不允许应用隐式 DDL，启用 S3
前必须执行 `pnpm run migration:postgresql` 并确认
`0003_s3_object_lifecycle` 已记录在 `ims_schema_migrations`；缺少该版本时服务拒绝初始化。

AWS S3 + IAM Role 示例：

```sh
export IMS_OBJECT_STORAGE=s3
export IMS_S3_BUCKET=ims-media-prod
export IMS_S3_REGION=ap-northeast-1
export IMS_S3_PREFIX=ims/production
export IMS_IDEMPOTENCY_DIR=/srv/ims/shared/idempotency
pnpm run start:node
```

S3-compatible 示例：

```sh
export IMS_OBJECT_STORAGE=s3
export IMS_S3_BUCKET=ims-media-prod
export IMS_S3_REGION=us-east-1
export IMS_S3_ENDPOINT=https://objects.example.com
export IMS_S3_FORCE_PATH_STYLE=true
export IMS_S3_READ_URL_TTL_SECONDS=300
export AWS_ACCESS_KEY_ID='<access-key>'
export AWS_SECRET_ACCESS_KEY='<secret-key>'
pnpm run start:node
```

## 本地 MinIO 联调

MinIO 是 Compose 中的本地 S3 兼容服务；该 Compose 不包含应用或反向代理：

```sh
pnpm run dev:minio:up
docker compose -f deploy/compose.yaml ps minio minio-init
```

Compose 会在回环地址启动 MinIO，并由一次性 `minio-init` 服务创建 `imsweb-test` bucket。
Hono Node 使用以下配置连接：

```sh
export IMS_OBJECT_STORAGE=s3
export IMS_S3_BUCKET=imsweb-test
export IMS_S3_REGION=us-east-1
export IMS_S3_ENDPOINT=http://127.0.0.1:9000
export IMS_S3_FORCE_PATH_STYLE=true
export IMS_S3_PREFIX=local
export IMS_S3_READ_URL_TTL_SECONDS=300
export AWS_ACCESS_KEY_ID=imsweb-local
export AWS_SECRET_ACCESS_KEY=imsweb-local-password
```

默认 S3 API 为 `http://127.0.0.1:9000`，控制台为 `http://127.0.0.1:9001`。这些默认凭据
仅限本机开发，不能复用于共享或生产环境。停止服务使用 `pnpm run dev:minio:down`；该命令
保留命名卷，避免意外删除联调素材。

### 本地上传媒体同步

数据库中的活动、推荐资讯和名片记录继续使用稳定的 `/uploads/...` URL，但设置 S3 变量不会
自动把 `IMS_UPLOADS_DIR` 里的旧文件写入 MinIO。切换后先执行只读对账，再显式导入：

```sh
pnpm run media:uploads:sync
pnpm run media:uploads:sync -- --apply
```

同步器只遍历 event、news、namecard 和 information 业务目录，生成文件数、字节数、MIME 和
SHA-256 清单。`--apply` 通过当前 `S3ObjectStorage` 状态机同时维护 bucket 对象与统一数据库的
`s3_*` 索引，写入后从目标重新读取校验；内容未变化的文件保持 `unchanged`。默认清单位于
`data/migration/upload-media-manifest.json`，该路径被 Git 忽略。

旧首页“活动资讯与同人活动”的 6 条卡片不属于 Event/News 表，也不应继续由代码常量兜底。
新存储环境还需单独迁移它们的索引和原图：

```sh
pnpm run media:information:sync
pnpm run media:information:sync -- --apply
```

写入完成后，`/api/information` 只读取 `uploads/information/index.json`，图片统一使用
`/uploads/information/original/...`。索引不存在时返回空集合，避免静态代码重新成为业务数据源。

### Wiki 全量素材同步

Wiki 来源素材必须通过清单同步器导入，不能手工按展示名拼接对象键。同步器会遍历远端首页及
全部剧情页，并要求远端入口与统一 SQLite 的事务所/角色集合一一对应：

```sh
pnpm run wiki:media:sync -- \
  --database "$IMS_SQLITE_PATH" \
  --staging-dir "$PWD/data/migration/wiki-import"
```

默认命令只写入被 Git 忽略的 staging，并生成 `manifest.json`。清单完整后，可在已经设置本节
MinIO/S3 环境变量的同一 shell 中校验本地文件并上传，无需重新抓取远端：

```sh
pnpm run wiki:media:sync -- \
  --database "$IMS_SQLITE_PATH" \
  --staging-dir "$PWD/data/migration/wiki-import" \
  --upload-existing
```

也可在首次抓取时直接使用 `--upload`。两种上传模式都会逐对象执行 HEAD 校验，并把最新完整
清单写入 `Wiki/manifests/idol-master-top-latest.json`。对象按 Wiki 业务结构落位：

| 来源路径 | 逻辑对象键 |
| --- | --- |
| `/image/{事务所}/{角色}/{用途}/{文件}` | `Data/{agencyCode}/{folderName}/{用途}/{文件}` |
| `/icon/...` | `Wiki/static/icon/...` |
| `/css/...` | `Wiki/static/css/...` |
| `/assets/...` | `Wiki/static/assets/...` |

`/image/*` 由 Story 数据库把展示名还原为稳定内部目录，再重定向到短期签名 URL；`/icon/*`
和 `/css/*` 优先使用相同直读方式。manifest 保存每个素材的原始 URL、引用页面、目标键、
字节数、MIME 与 SHA-256，可用于之后的增量同步和位置审计。

应用需要 bucket 的 `ListBucket` 权限，以及目标 `IMS_S3_PREFIX` 下对象的
`GetObject`、`PutObject`、`DeleteObject` 权限。copy/move 由读取、版本化写入和受保护删除组合完成。
生产 bucket 建议启用版本控制、服务端加密、访问日志和生命周期策略；策略不能提前清理仍被
SQLite 业务记录引用的对象。

## 管理员站点包

HTML/CSS/图片 ZIP 上传后以不可变版本保存：

```text
site-packages/{packageId}/revisions/{revisionId}/source.zip
site-packages/{packageId}/revisions/{revisionId}/manifest.json
site-packages/{packageId}/revisions/{revisionId}/files/{archivePath}
```

`source.zip` 和内部 manifest 只用于审计与恢复，不直接公开。公开和预览请求先从 PostgreSQL
读取版本记录，再按 `manifest_json` 的精确 `archivePath -> objectKey` 映射读取对象；映射目标
还必须等于该版本 `files/` 下的预期键，因此不能借伪造 manifest 访问 ZIP 或其他版本。站点包
响应始终由 Hono `storage.get()` 代理，不使用 S3 签名重定向，避免 HTML、CSS 和 ES module 的
相对路径落到对象存储物理键。

源 ZIP 的 SHA-256 同时进入版本元数据和对象写入校验。预览 URL 中的随机 bearer token 只在
创建版本或管理员主动旋转时返回一次，数据库只保存 SHA-256；旧 token 在旋转后立即失效。

公开内容 URL 只接受 `site_packages.published_revision_id` 当前指向的版本，并使用
`public, max-age=0, must-revalidate`，避免发布切换后缓存继续提供旧页面。历史版本的直接 URL
返回 404，但仍可通过该版本的预览 bearer 查看；预览使用 `private, no-store`。含脚本版本只能
在与主站不同可注册站点的 `IMS_SITE_PACKAGE_ORIGIN` 上运行，例如主站使用
`www.example.com` 时内容域使用 `ims-content.example.net`，而不是普通的
`content.example.com` 子域。这样可同时降低父域 Cookie tossing 和 same-site 隔离失效风险。
生产启动会按 Public Suffix List 验证这个边界。CSP 禁止网络连接、表单、frame、object、
同源沙箱和顶层导航，且只允许主站作为 `frame-ancestors`。

## 切换与校验

设置 S3 变量不会自动搬迁现有文件。切换权威写入源前必须停写或建立可重放的最终增量窗口，
并把三个本地目录映射到对应逻辑 key：

| 本地来源 | S3 目标前缀 |
| --- | --- |
| `IMS_UPLOADS_DIR/` | `<IMS_S3_PREFIX>/uploads/` |
| `IMS_EVENT_BASE_DIR/{upload,used,meta,.trash}/` | `<IMS_S3_PREFIX>/assets/images/eventchronicle/events/<同名目录>/` |
| `IMS_STORY_DATA_DIR/` | `<IMS_S3_PREFIX>/Data/` |

`IMS_UPLOADS_DIR` 使用 `pnpm run media:uploads:sync -- --apply` 完成上述清单、上传和回读核对；
其他来源仍需先生成文件数、总字节数和 SHA-256 manifest，再上传并从目标重新读取核对。不要把
`IMS_EVENT_BASE_DIR/.idempotency` 或 `.staging` 上传到对象存储。完成只读冒烟后，才能把
`IMS_OBJECT_STORAGE` 切为 `s3` 并恢复写入；回滚时同样只能保留一个权威写入端。

AWS CLI 可用 `head-bucket`、`list-objects-v2` 和只读下载作为上线前连通性检查。应用本身会在
首次媒体操作时使用相同凭据链，不在启动时创建 bucket 或修改 bucket 策略。
