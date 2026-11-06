# 旧站到 Preview 的增量同步

> 文档类型：运维
> 状态：Active
> 权威来源：`apps/api/scripts/migration/preview-data-sync.js`、`apps/api/scripts/migration/preview-media-sync.js`、`apps/api/scripts/migration/preview-r2-sync.js`、`scripts/deployment/sync-preview-data.sh`

## 适用范围

适用于旧站 v1.0.16 PostgreSQL 到已部署新模型的 preview，单向合并公开内容，保留 preview 独有数据。
执行器必须使用与 preview 一致的 migration catalog。源 schema 不匹配时拒绝执行。
不会覆盖整个数据库，不同步后台账号、密码、会话、平台身份、邮件队列、限流、审计日志及运行配置。
旧名片转换为统一名片；不写已冻结的 legacy archives，因此新导入名片不会获得依赖旧 archive 的认领能力。
Wiki 同步规范化表，不回写历史 story 表。同步表以脚本 `TABLES` 为准。
业务配置若作为公开对象保存在对象索引中，会随公开媒体索引同步；未登记对象索引的文件不在范围内。
已有绝对 URL 保持原值，不替换正文中的旧站域名。

## 前置条件与私有配置

执行主机需要 Node、API workspace frozen dependencies、与源 PostgreSQL 主版本兼容的
`pg_dump` 和 `pg_restore`。可使用有依赖的专用 checkout；普通发布主机只有镜像时，需要另外准备执行器。
源数据库角色只授予连接、schema usage、表和 sequence 读取权限，不授予写权限。
目标角色需要内容表写权限、同步 schema 创建权限和 sequence 权限。
媒体源凭据仅允许读取；目标使用独立测试桶。不得复用生产桶作为目标。

单独创建一个空的临时数据库，名称必须为 `imsweb_sync_stage_<name>`。它与源和 preview 必须是不同数据库。
**每次执行，包括只读预演，都会删除该临时库的 public schema 并重新恢复；临时库不得存放其他数据。**
其中包含源快照的私有数据，必须限制访问，遵循源数据库的保护和保留策略。

私有 JSON 配置放在仓库外，权限设为 `0600`；字段如下，示例中的地址和凭据均须替换：

```json
{
  "sourceId": "old-production",
  "source": "postgresql://readonly:REPLACE@db-host/production",
  "stage": "postgresql://sync:REPLACE@db-host/imsweb_sync_stage_preview",
  "target": "postgresql://sync:REPLACE@db-host/preview",
  "confirmTargetDatabase": "preview",
  "previewActorAccountId": "1",
  "media": {
    "source": {
      "endpoint": "https://SOURCE.r2.cloudflarestorage.com",
      "region": "auto",
      "bucket": "production-media",
      "credentials": { "accessKeyId": "REPLACE", "secretAccessKey": "REPLACE" }
    },
    "target": {
      "endpoint": "https://TARGET.r2.cloudflarestorage.com",
      "region": "auto",
      "bucket": "preview-test",
      "credentials": { "accessKeyId": "REPLACE", "secretAccessKey": "REPLACE" }
    },
    "maxBytes": 67108864
  }
}
```

`sourceId` 必须固定且唯一，不得在不清点 baseline 的情况下更换其对应源。
需要保留 preview 已编辑的独立内容配置时，可增加可选的 `preserveMediaKeys` 数组。
只允许 `editorial/information/index.json`、`community/producer-map/config.json`、
`editorial/about/config.json`；这些文档及其专属源对象版本不参与合并和文件复制，
报告中的 `preserved` 记录保留数量。不会因它们的差异跳过其余 SQL 内容，其他媒体冲突仍按原规则处理。
`previewActorAccountId` 指定 preview 已有后台账号，用于新站点包的归属；未配置或账号不存在时，新站点包记为冲突。
不复用旧站账号 ID，也不复制站点包预览令牌；新版本使用独立的随机 token hash，已发布内容不受影响。
目标桶名须包含独立的 `test` 段。物理 key 原样复制，preview 的公开读取基址必须指向这个桶。
数据库 URL 的 libpq 参数支持 `sslmode`、`sslrootcert`、`sslcert` 和 `sslkey`；数据库 Node 客户端也必须能使用相应 TLS 配置。
preview 部署前置要求见[部署与发布](github-actions-deployment.md)。

### 同账号 R2 提速

源和目标使用相同的 R2 account endpoint 时，可以在 `media` 增加
`strategy: "r2-optimized"`，并设置 `concurrency: 8`（允许 1–16）和
`requestTimeoutMs: 30000`。执行器先批量列举两桶，再用文件大小和快照记录的 provider ETag
跳过一致对象；没有可靠 ETag 时使用 HEAD 中的 SHA-256 元数据，仍不能确认时才下载核验。
此模式不会对所有既有对象重新计算 SHA-256。缺失文件通过宿主机传输时仍会计算完整 SHA-256，
保存哈希元数据，并以 create-only 条件上传；本次写入的对象均回读正文并重新计算 SHA-256。
日志持续输出进度，报告包含 `media` 统计。

`serverSideCopy: false` 使用两套独立桶凭据，只传输缺失文件。
要使用 R2 云端跨桶复制，设置 `serverSideCopy: true`；签名凭据必须同时能读源桶、写目标桶。
可在 `media.copyCredentials` 提供该凭据（字段与 `credentials` 相同）；缺省使用目标凭据。
权限不足会明确失败，不会绕过权限或自动改成覆盖写入。
云端复制使用源 ETag 条件及 R2 的 `cf-copy-destination-if-none-match: *` 条件，防止源变化和目标覆盖，
后者属于 R2 的[目标条件复制扩展](https://developers.cloudflare.com/r2/api/s3/extensions/)。
复制本身在 R2 内完成，不经宿主机上传对象正文；复制后仍下载新对象进行 SHA-256 回读核验。

## 执行和调度

从仓库根目录执行，部署根目录应与 preview 的实际配置一致：

```sh
# 只读预演：会写临时库，不写 preview 或媒体桶。
bash scripts/deployment/sync-preview-data.sh "$HOME/preview" "$HOME/.config/imsweb/preview-sync.json"

# 实际增量同步。
bash scripts/deployment/sync-preview-data.sh "$HOME/preview" "$HOME/.config/imsweb/preview-sync.json" --apply
```

首次同步前创建并验证 preview 数据库恢复点。先执行预演并核对表级统计，再执行实际同步。
预演不会尝试真实写入，因此不保证提前发现唯一约束、外键或媒体冲突；这些会在实际执行时校验。
预演不会调用 S3。实际执行先复制并回读核对公开对象的 SHA-256 和长度，再发布数据库索引。
目标已存在但内容不同的物理 key 会阻止本次事务，不会覆盖；不复制私有对象，不同步 uploading/pending 索引。

确认首次结果后，可在 preview 部署用户的 crontab 加入以下示例，每小时同步一次；时间使用主机时区。
命令里的绝对路径应指向有依赖、且 migration catalog 与 preview 一致的执行器：

```cron
17 * * * * /usr/bin/bash /opt/imsweb-sync/scripts/deployment/sync-preview-data.sh /home/preview/preview /home/preview/.config/imsweb/preview-sync.json --apply >> /home/preview/preview/data-sync.log 2>&1
```

Cron 需显式配置包含 Node 和 PostgreSQL 工具的 PATH，并对日志配置轮转和失败监控。
包装脚本与部署共享 `.deploy.lock`；直接 Node 入口仍通过数据库 advisory lock 防止同步重入、与 migration 重叠。
调度不会自动安装，也不会因合入代码而开始访问生产数据库。

## 合并、冲突和恢复

`preview_sync.baselines` 保存上次接受的源记录投影；它与业务变更在同一个事务提交。
该表可能包含正文、名片图片哈希等业务数据，应限制权限，并纳入 preview 备份。

- 没有 baseline：目标不存在则新增；完全相同则建立 baseline；同一主键但内容不同则冲突。
- 有 baseline：源未变则保留 preview；只有源变化则更新；两边变化且结果不同则保留 preview 并记录冲突。
- preview 已删记录不会自动复活。源删除只记为候选，不删除目标。
- 不自动重映射数字 ID；主键、业务唯一键冲突会保留目标，需要人工确定归属。
- 父记录存在冲突时，只跳过引用该记录的子记录；其他已接受父记录的子记录继续同步。
  未显式保留的媒体版本或索引冲突仍会阻止后续业务合并，避免发布错误的媒体引用。
- 实际更新递增 revision；保留 preview 的名片所有权、待审字段和账号数据。
- 名片两面的公开媒体必须已就绪；媒体缺失、私有或未完成上传的名片记为冲突，不导入悬空图片引用。

冲突及源删除键写入 `preview_sync.events`，CLI 仅输出表级统计，不输出正文或凭据。
重复运行会再次记录未解决事件，需按运维保留策略清理历史事件。
退出码：`0` 无已知冲突；`2` 数据已提交但有冲突、源删除候选或依赖跳过；`1` 执行失败。
删除候选会在后续运行重复报告。不得仅为消除报警而删除 baseline，否则会失去历史比较依据。

数据库写入失败会回滚本次业务数据和 baseline；sequence 取值可能产生空洞。
已经复制的不可变媒体不会自动删除，避免误删共享测试桶对象。恢复采用 preview 数据库备份；
不得删除整个测试桶或同步状态 schema 来尝试回滚。数据库恢复边界见[现网运行手册](runbook.md)。
应用仍可提供读服务；实际合并会锁定同步表的写操作，避免 ID 分配与 sequence 修复竞态。
媒体在获取写锁前复制及核验，未变化且已接受的版本不会重复下载。首次大批量 SQL 合并仍可能阻塞编辑、上传等写操作，应先测量并安排低峰窗口。
已有浏览器缓存可能继续显示旧内容，验收使用新浏览器会话；不清空 Valkey 的认证或限流数据。

## 验证

预演后核对新增和冲突数量；实际同步后检查资讯、活动关联文章、Wiki、名片及真实媒体 URL。
再次运行确认未改变的源记录不重复新增；在 preview 编辑一条记录后修改源的同一记录，确认 preview 内容保留且产生冲突。
删除源测试记录应只产生删除候选。所有验收应先在隔离测试数据上执行。
自动化测试位于 `apps/api/tests/migration/preview-data-sync.test.ts`，包含真实 PostgreSQL 的旧 schema
快照恢复、新 migration 转换、三方合并、唯一冲突、回滚及 bigint 精度测试。
