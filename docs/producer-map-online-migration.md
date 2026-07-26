# 制作人地图线上迁移

本文用于把 2026-07-26 已导入 Cloudflare R2 的制作人地图配置和媒体接入线上 PostgreSQL。
页面业务配置不使用独立关系表，而是与媒体一起通过 `s3_object_index`、
`s3_object_versions` 和 `s3_upload_operations` 维护逻辑键与不可变 R2 物理对象的映射。

## 固定目标

- R2 bucket 必须为 `imsweb-media-public-prod`；
- `IMS_S3_PREFIX` 必须为空；
- 数据面包含 43 个图片对象和 1 个配置对象，共 44 个对象、7,529,245 字节；
- 对应的 43 张图片为 34 张地区图和 9 张社群图，图片字节合计 7,516,251；
- 所有对象必须为 `ready/public`；
- 地图静态 GeoJSON 随 Web release 发布，不在 R2，也不包含南海诸岛插图。

如果线上使用其他 bucket 或非空 prefix，不得执行本迁移 SQL。应在正确环境重新运行导入器，
让对象状态机生成新的物理键和数据库控制面行。

## 1. 停写和备份

在应用停写窗口内备份 PostgreSQL，并保存当前 Producer Map 逻辑键盘点：

```sh
: "${DATABASE_URL:?set the online PostgreSQL URL}"
umask 077
pg_dump --format=custom --file=/secure-backups/imsweb-before-producer-map.dump \
  "$DATABASE_URL"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT logical_key, object_id, state, incarnation
     FROM public.s3_object_index
    WHERE logical_key = 'community/producer-map/config.json'
       OR logical_key LIKE 'community/producer-map/assets/%'
    ORDER BY logical_key"
```

若查询返回任何非本迁移生成的制作人地图行，先停止。SQL 会拒绝覆盖冲突，但仍应先确认数据
归属和管理员编辑状态。

## 2. 环境预检

在不输出凭据的前提下确认运行环境：

```sh
test "$IMS_S3_BUCKET" = "imsweb-media-public-prod"
test -z "${IMS_S3_PREFIX:-}"
test "$IMS_S3_REGION" = "auto"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT version FROM public.ims_schema_migrations
    WHERE version = '0009_s3_public_storage_scope'"
```

最后一条必须输出 `0009_s3_public_storage_scope`。R2 凭据应只授权该 bucket，并配置与之绑定的
`IMS_PUBLIC_READ_URL_BASE`（旧名 `IMS_S3_PUBLIC_READ_URL_BASE` 仍兼容）。

## 3. 写入 PostgreSQL 控制面

执行随 release 提供的事务 SQL：

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/migrations/producer-map-r2-control-plane.sql
```

成功结果必须为：

```text
producer_map_objects | producer_map_bytes | config_objects | media_objects
44                   | 7529245            | 1              | 43
```

SQL 使用 advisory lock。目标逻辑键、object ID、operation ID 或物理键存在不一致时会整笔回滚；
完全一致的重复执行不会新增版本。

## 4. R2 和应用验收

使用线上 PostgreSQL 与 R2 环境运行专用的真实 R2 验收命令：

```sh
IMS_ENV_FILE=/path/to/online.env pnpm run test:r2:producer-map
```

该命令是显式的外部集成验收，不属于默认单元测试；运行环境必须同时提供线上 PostgreSQL 和
R2 的只读所需凭据。它会强制检查 Cloudflare R2 S3 endpoint、`region=auto`、bucket
`imsweb-media-public-prod` 和空 prefix，并且在参数层禁止 `--apply`。命令会重新下载原站图片，
再通过线上控制面从 R2 回读每个对象做字节数与 SHA-256 校验；只有
`configStatus=unchanged`、`objects.unchanged=43`、`imagesLinked=0` 时才返回成功。任何
`would-upload`、`would-replace` 或 `would-write` 都会让验收失败。不要追加 `--apply`，也不得
改用普通导入命令绕过验收。

发布本 PR 的应用 release 后检查：

```sh
curl --fail --silent --show-error \
  https://idol-master.top/api/producer-map >/tmp/producer-map.json
node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync("/tmp/producer-map.json", "utf8"));
const urls = [...value.regions, ...value.communities]
  .map((item) => item.imageUrl).filter(Boolean);
if (value.regions.length !== 34 || value.communities.length !== 9 ||
    new Set(urls).size !== 43) process.exit(1);
console.log({ regions: value.regions.length, communities: value.communities.length,
  images: new Set(urls).size });
'
curl --fail --silent --show-error \
  https://idol-master.top/producer-map >/dev/null
```

随后逐项检查 43 个 `imageUrl` 的 HTTP 状态、Content-Type 和正文哈希，并在管理端保存一次无冲突
编辑，确认公开页读取新 revision。

## 5. 回滚边界

代码可以先切回旧 release；旧版本不会读取制作人地图逻辑键。不要在普通代码回滚中删除这
44 组 PostgreSQL 控制面行或 R2 物理对象，它们是同一恢复单元。若确需清除，先恢复停写窗口的
PostgreSQL/R2 配对备份，再经单独审批处理新增对象，禁止只删数据库或只删 R2。
