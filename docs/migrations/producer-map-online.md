# Producer Map 数据迁移与对账

> 文档类型：迁移
> 状态：Decision
> 权威来源：Producer Map migration scripts、`deploy/migrations/producer-map-r2-control-plane.sql`、对象存储状态机和 API contract tests
> 适用环境：隔离演练、生产导入、对象重建和灾难恢复

Producer Map 配置与媒体由 PostgreSQL 控制面和 S3-compatible 对象数据面共同组成。本文说明
可重复的迁移和对账方法，不记录某次导入的 bucket、对象数量、日期或 release；每次执行的这些
事实写入私有 migration manifest。

## 权威数据模型

- 地图业务配置使用逻辑 key `community/producer-map/config.json`。
- 地区和社群图片使用 `community/producer-map/assets/` 下的逻辑 key。
- `s3_object_index` 保存当前逻辑 key 到 object ID/physical key 的映射；版本和写入操作由
  `s3_object_versions`、`s3_upload_operations` 管理。
- 公开 GeoJSON 和样式属于 Web release 的版本化静态资源，不作为管理员配置写入数据库。
- Domain 通过 ObjectStorage port 访问对象，不直接拼接 R2 URL 或绕过数据库控制面。

## 执行前提

1. 明确来源目录/站点、目标 PostgreSQL、bucket、prefix 和 release，并写入私有 manifest。
2. 在同一停写窗口备份 PostgreSQL 与对象存储，保存 dump/manifest 的 SHA-256。
3. 只读列出目标中已有 Producer Map 逻辑 key；存在未知所有者、pending 操作或冲突时停止。
4. 检查来源许可和资产登记；无法确认再分发范围的媒体不导入。
5. 在隔离环境完成一次完整 dry-run、apply、reconcile 和公开读取验证。

## 生成计划

从仓库根目录执行默认只读命令：

```sh
pnpm run media:producer-map:sync
```

计划必须列出配置、每个媒体文件、来源 URL/路径、目标逻辑 key、MIME、字节数、SHA-256 和预期
operation（create/unchanged/conflict）。以下情况直接阻断：

- 缺失配置或配置引用不存在的图片；
- 重复 ID、逻辑 key 或不规范地区/社群标识；
- 非法 MIME、空文件、无法解码的图片或路径穿越；
- 目标相同逻辑 key 的 ready 内容与计划哈希不一致；
- 计划 bucket/prefix 与已批准目标不一致。

## 写入与控制面

只有核对计划后才能执行：

```sh
pnpm run media:producer-map:sync -- --apply
```

写入通过 ObjectStorage 状态机创建不可变对象并更新 PostgreSQL 映射。脚本必须回读目标对象并
验证字节数和 SHA-256；不能先手工上传 R2 再补数据库，也不能只执行控制面 SQL 而没有对象回读。

`deploy/migrations/producer-map-r2-control-plane.sql` 仅用于已经存在且经过哈希核验的对象控制面
恢复。执行它前必须设置正确 `DATABASE_URL`，检查 SQL 中的 manifest 与实际目标一致，并在
transaction/advisory lock 下运行。普通导入优先使用 migration script，而不是手工 SQL。

## 对账

写入后至少验证：

```sh
pnpm run test:r2:producer-map
pnpm --filter @imsweb/api run test:server -- producer-map
```

对账要求：

- manifest、PostgreSQL index/version/operation 和 bucket 对象一一对应；
- 所有 ready 对象可回读，MIME、大小和 SHA-256 一致；
- 配置引用的地区/社群媒体全部存在，无未引用 orphan；
- `/api/producer-map` 公开读取与后台读取返回同一 revision；
- 管理写入使用 Backoffice auth、CSRF、revision CAS 和审计记录；
- Web 地图在桌面/移动视口加载、筛选和详情行为正常，静态边界资源同源可用。

HTTP 200、SQL 成功或 bucket 中“有文件”都不能单独证明迁移完成。

## 回滚与恢复

回滚必须以同一停写窗口的 PostgreSQL dump 和对象 manifest 为一组：

- 若 apply 尚未更新控制面，按本次 owner token/object ID 清理新对象。
- 若控制面已提交，优先通过状态机切回前一 ready version；不要直接删 physical key。
- 灾难恢复时先恢复 PostgreSQL，再按 manifest 恢复缺失对象并回读核验，最后开放写入。
- 任何只删数据库或只删对象存储的操作都会破坏控制面/数据面一致性，禁止作为回滚捷径。

## 维护要求

配置字段、逻辑 key、媒体格式或 API contract 改变时，同一变更必须更新 migration script、
ObjectStorage 映射、`@imsweb/contracts`、API/Web consumer、对账测试和本文件。某次迁移的数量、
bucket 名称、时间和结果只写入私有 manifest 或发布记录，不写进长期文档。
