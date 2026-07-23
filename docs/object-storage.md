# Node 文件对象存储

Hono Node 支持 `filesystem` 和 `s3` 两种可变媒体存储。默认值仍是
`filesystem`，只有显式设置 `IMS_OBJECT_STORAGE=s3` 才会创建 S3 client；S3 配置缺失时
服务拒绝初始化，不会回退到本地磁盘。

## 存储边界

S3 adapter 保存与现有 `ObjectStorage` 端口相同的逻辑 key：

- `uploads/`：资讯、活动和名片上传；
- `assets/images/eventchronicle/events/`：编年史待审核、已使用、meta 和回滚对象；
- `Data/`：剧情图片。

以下内容不进入 S3：

- Core/Story SQLite，仍由 `IMS_DB_PATH`、`IMS_STORY_DB_PATH` 指向本地持久卷；
- 删除补偿和编年史幂等 journal，仍由 `IMS_COMPENSATION_DIR`、
  `IMS_IDEMPOTENCY_DIR` 指向本地持久卷；
- 构建后的 Web 静态文件，仍由 `IMS_PUBLIC_DIR` 提供。

## 配置

| 变量 | 要求 |
| --- | --- |
| `IMS_OBJECT_STORAGE` | `filesystem` 或 `s3`，默认 `filesystem` |
| `IMS_S3_BUCKET` | S3 模式必填；普通 bucket 名称 |
| `IMS_S3_REGION` | S3 模式必填；未设置时读取 `AWS_REGION` |
| `IMS_S3_PREFIX` | 可选；同一 bucket 内的隔离前缀，不含开头/结尾 `/` |
| `IMS_S3_ENDPOINT` | S3-compatible 服务可选；无凭据的 HTTP(S) URL |
| `IMS_S3_FORCE_PATH_STYLE` | 默认 `false`；MinIO 等服务通常使用 `true` |

AWS SDK 使用标准凭据链。部署到 EC2、ECS 或其他 AWS compute 时优先绑定 IAM Role；本地
或第三方 S3-compatible 服务可临时注入 `AWS_ACCESS_KEY_ID`、
`AWS_SECRET_ACCESS_KEY`，使用短期凭据时再注入 `AWS_SESSION_TOKEN`。真实凭据不得写入
`apps/api/.env.example`、release 或进程启动命令历史。

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
export AWS_ACCESS_KEY_ID='<access-key>'
export AWS_SECRET_ACCESS_KEY='<secret-key>'
pnpm run start:node
```

## 本地 MinIO 联调

仓库提供独立的本地对象存储编排，不与生产 Nginx Compose 混用：

```sh
pnpm run dev:minio:up
docker compose -f deploy/compose.minio.yaml ps
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
export AWS_ACCESS_KEY_ID=imsweb-local
export AWS_SECRET_ACCESS_KEY=imsweb-local-password
```

默认 S3 API 为 `http://127.0.0.1:9000`，控制台为 `http://127.0.0.1:9001`。这些默认凭据
仅限本机开发，不能复用于共享或生产环境。停止服务使用 `pnpm run dev:minio:down`；该命令
保留命名卷，避免意外删除联调素材。

### Wiki 全量素材同步

Wiki 来源素材必须通过清单同步器导入，不能手工按展示名拼接对象键。同步器会遍历远端首页及
全部剧情页，并要求远端入口与 Story SQLite 的事务所/角色集合一一对应：

```sh
pnpm run wiki:media:sync -- \
  --database "$IMS_STORY_DB_PATH" \
  --staging-dir "$PWD/apps/legacy/data/wiki-import"
```

默认命令只写入被 Git 忽略的 staging，并生成 `manifest.json`。清单完整后，可在已经设置本节
MinIO/S3 环境变量的同一 shell 中校验本地文件并上传，无需重新抓取远端：

```sh
pnpm run wiki:media:sync -- \
  --database "$IMS_STORY_DB_PATH" \
  --staging-dir "$PWD/apps/legacy/data/wiki-import" \
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

`/image/*` 由 Story 数据库把展示名还原为稳定内部目录；`/icon/*` 和 `/css/*` 优先读取对象
存储，缺失时才回退 Legacy Static Assets。manifest 保存每个素材的原始 URL、引用页面、目标键、
字节数、MIME 与 SHA-256，可用于之后的增量同步和位置审计。

应用需要 bucket 的 `ListBucket` 权限，以及目标 `IMS_S3_PREFIX` 下对象的
`GetObject`、`PutObject`、`DeleteObject` 权限。copy/move 由读取、复制写入和删除组合完成。
生产 bucket 建议启用版本控制、服务端加密、访问日志和生命周期策略；策略不能提前清理仍被
SQLite 业务记录引用的对象。

## 切换与校验

设置 S3 变量不会自动搬迁现有文件。切换权威写入源前必须停写或建立可重放的最终增量窗口，
并把三个本地目录映射到对应逻辑 key：

| 本地来源 | S3 目标前缀 |
| --- | --- |
| `IMS_UPLOADS_DIR/` | `<IMS_S3_PREFIX>/uploads/` |
| `IMS_EVENT_BASE_DIR/{upload,used,meta,.trash}/` | `<IMS_S3_PREFIX>/assets/images/eventchronicle/events/<同名目录>/` |
| `IMS_STORY_DATA_DIR/` | `<IMS_S3_PREFIX>/Data/` |

先对每个来源生成文件数、总字节数和 SHA-256 manifest，再上传并从目标重新读取核对。不要把
`IMS_EVENT_BASE_DIR/.idempotency` 或 `.staging` 上传到对象存储。完成只读冒烟后，才能把
`IMS_OBJECT_STORAGE` 切为 `s3` 并恢复写入；回滚时同样只能保留一个权威写入端。

AWS CLI 可用 `head-bucket`、`list-objects-v2` 和只读下载作为上线前连通性检查。应用本身会在
首次媒体操作时使用相同凭据链，不在启动时创建 bucket 或修改 bucket 策略。
