# Producer Map 数据迁移与对账

> 文档类型：迁移
> 状态：Decision
> 权威来源：`apps/api/scripts/migration/legacy-producer-map.js`、`deploy/migrations/producer-map-r2-control-plane.sql`、对象存储状态机和 API contract tests
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

先确认来源仍提供旧版 Producer Map 页面、脚本与图片。来源由 `--source-base-url` 显式指定，
也可由 `IMS_LEGACY_PRODUCER_MAP_BASE_URL` 配置；不要假定脚本默认站点仍提供旧版内容。
从仓库根目录执行计划命令，替换示例来源：

```sh
pnpm run media:producer-map:sync -- --source-base-url https://legacy.example.test
```

不带 `--apply` 时目标对象存储只读，但会下载来源媒体到 Git 忽略的 staging 目录并写出审计
manifest。`--staging-dir` 和 `--manifest` 用于指定这些输出，不是离线导入参数；每次执行都会
重新读取在线来源。来源退役后，应先准备保持旧页面结构与资源路径的受控镜像，或按已核验的
数据库/对象 manifest 恢复，不能把已有 staging 目录直接当作离线输入。

核对 manifest 中的来源、bucket/prefix、媒体逻辑 key、MIME、字节数和 SHA-256。媒体状态为
`unchanged`、`would-upload` 或 `would-replace`，配置状态为 `unchanged` 或 `would-write`。
发现来源缺失、非法媒体、未知所有者或目标与批准范围不符时不得写入。

`would-replace` 表示目标已有不同内容，脚本不会因此自动停止；`--apply` 会通过状态机替换该
逻辑 key 的当前对象。必须逐项批准替换并保留恢复点。脚本也不会读取上次 manifest 来冻结来源，
所以 apply 前必须保持来源稳定，并核对写入后的报告与已批准计划一致。

## 写入与控制面

只有核对计划后才能执行：

```sh
pnpm run media:producer-map:sync -- \
  --source-base-url https://legacy.example.test \
  --apply \
  --confirm-source https://legacy.example.test \
  --confirm-bucket <approved-bucket>
```

`--confirm-source` 必须与解析后的来源基址相同，`--confirm-bucket` 必须与当前
`IMS_S3_BUCKET` 相同；缺少任一确认都会拒绝执行。prefix 没有单独的确认 flag，必须在计划中核对。

写入通过 ObjectStorage 状态机创建不可变对象并更新 PostgreSQL 映射。脚本必须回读目标对象并
验证字节数和 SHA-256；不能先手工上传 R2 再补数据库，也不能只执行控制面 SQL 而没有对象回读。
媒体先写入，配置随后执行条件更新；配置 CAS 失败不代表前面的媒体替换被整体回滚，应保留错误
日志和已批准计划，再次盘点并对账，不能把整条命令当成单一数据库事务。

`deploy/migrations/producer-map-r2-control-plane.sql` 仅用于已经存在且经过哈希核验的对象控制面
恢复。它包含固定对象 ID、物理 key 和摘要，不是任意 bucket 的通用 seed。执行前必须设置正确
`DATABASE_URL`，检查 SQL 中的 manifest 与实际目标一致，并在
transaction/advisory lock 下运行。普通导入优先使用 migration script，而不是手工 SQL。

## 对账

Cloudflare R2 写入后，从同一冻结来源执行参数化只读验收，再运行 API 行为回归：

```sh
pnpm run media:producer-map:sync -- \
  --source-base-url https://legacy.example.test \
  --require-r2 --expect-bucket <approved-bucket>
pnpm --filter @imsweb/api run test:server
```

只有批准的目标 prefix 为空时才添加 `--expect-empty-prefix`。`--require-r2` 不能与 `--apply`
组合，要求配置和媒体均为 `unchanged`，且没有待新增或待关联内容。
`test:r2:producer-map` 是绑定固定生产 bucket 和空 prefix 的便捷入口，不能直接用于隔离演练或
其他目标。RustFS 等非 R2 环境使用不带 `--apply` 的计划命令重新比对；它不执行 R2 专属断言，
必须人工核对报告全部收敛。

`test:server` 使用 Vitest 运行 `apps/api/tests/server/` 下的用例，其中包含
`producer-map-content.test.ts`。需要只跑这一个文件时，从仓库根目录执行：

```sh
pnpm --filter @imsweb/api exec vitest run tests/server/producer-map-content.test.ts
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
