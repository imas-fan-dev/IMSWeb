# Cloudflare 全栈迁移设计

Cloudflare 对应产品是 Workers、D1、R2、Images 和 Static Assets。仓库已实现完整 Hono
Worker 入口与适配器；本文描述从当前 SQLite/本地媒体权威源切到该实现的数据和发布闸门。
`apps/api/wrangler.jsonc` 中的资源名/ID 是本地占位值，本文不表示线上资源已创建或生产切写已完成。

## 1. 目标架构

```text
浏览器
  |
  v
Cloudflare Worker（统一路由、鉴权边界、可观测性）
  |-- 普通 HTML/CSS/JS/图片 --> Workers Static Assets
  |-- Hono API 与 Wiki SSR ---> D1 / R2 / Images
  `-- Unity .data -----------> R2（保留旧 URL、支持 Range）

D1 bindings: CORE_DB, STORY_DB
R2 binding:  MEDIA_BUCKET
Images:      IMAGES
Assets:      ASSETS
```

Worker 代码不回源到 Express/Flask。正式切换前，统一 Hono Node 继续以 SQLite/本地媒体作为
权威源；切流通过 Cloudflare route/DNS 在 Worker 和该 Node 入口之间选择。旧源站必须限制
直接访问，且不能配置 Worker 回源到同一个公开入口形成代理循环。

## 2. 设计原则

- 保持 URL 和响应契约，迁移的是实现，不是先迫使前端整体重写；
- Worker 只通过 repository/storage 接口访问持久层，业务代码不拼接 D1/R2 细节；
- D1 保存关系、状态和对象引用；R2 保存二进制对象；
- R2 object key 使用不可变 ID，不用标题、原文件名或可变分类作为唯一标识；
- 审核、改分类和删除先改变 D1 状态，不通过移动对象表达状态；
- 所有迁移记录保留 `legacy_key`，支持对账、幂等重跑和回滚；
- 读路由可按域影子比对和逐步切读；所有共享 D1/R2 的写路由必须在同一最终停写窗口整体切换；
- 日志、联系人、IP 和账号信息按敏感数据处理，最小化迁移和保留。

## 3. 实现与发布阶段

### 已实现的 Worker 路由

`apps/api/src/server/worker.ts` 与 Node 共用 `createHonoApp()`。Core、活动编年史和 Wiki 路由通过
请求绑定构造 D1/R2/Images 适配器；不存在模块级 binding 或 secret 缓存。普通
HTML/CSS/JS/图片进入 Static Assets，大型 Unity `.data` 通过 R2 保持原 URL。

Static Assets 只读取构建生成的 `apps/api/dist/client`，不能把
`apps/legacy/public/` 直接设为资源目录。`apps/api/scripts/build/client-allowlist.json` 是固定
发布清单：新增 Legacy 静态文件不会自动进入产物。
数据库及 sidecar、Python、模板、日志、PID、虚拟环境、归档包、`Data/`、运行时上传和
编年史状态一律不进入 `apps/api/dist/client`。

本地实现验证命令：

```sh
pnpm run check
pnpm run test:fast
pnpm run worker:dry-run
```

### 尚未完成的生产切换

生产读路径可以按业务域和数据闸门推进：

1. 只读资讯和普通静态数据；
2. 宣传活动和资讯后台；
3. 活动编年史；
4. 制作人名片与表情；
5. 账号和统一鉴权；
6. 剧情档案与剧情图片。

每次可只影子比对或切读一组 route，但不能逐域切写。账号、资讯、活动、名片、表情和
Chronicle 共享 `CORE_DB`，这些媒体与剧情图片又共享一次 R2 manifest/object_index；所以
Core、Story、Chronicle、R2 必须在同一最终停写窗口整体导入、对账后一次性切写。窗口结束前
旧 Hono Node 是唯一生产写入点，隔离 D1 不得接收新写。未完成生产快照、影子比对、完整对账
和回滚演练前，不得把本地 dry-run 解释为 Cloudflare 迁移完成。

## 4. D1 数据模型

初期使用两个 D1 数据库以保持故障域和迁移节奏：

- `CORE_DB`：账号、资讯、活动、名片、表情、审核和必要审计；
- `STORY_DB`：企划、偶像、分类、剧情卡片和视频链接。

不要直接把七张剧情表用原 `id` 合并。不同表的自增 ID 会冲突，且多行可能共同描述一张卡的多个视频链接。迁移分两层：

1. 原样落地 `story_legacy_rows`，唯一键为 `source_table + source_id`；
2. 在可验证的转换中生成 `story_cards` 和 `story_links`，每条目标记录保留来源键。

建议的稳定身份策略：

- 公开 ID 使用迁移时生成的 UUID/ULID；
- 原主键保存在 `legacy_id`，原表名保存在 `legacy_table`；
- 对同一旧记录重复导入时由 `(legacy_table, legacy_id)` 唯一约束保证幂等；
- R2 对象引用只存 object key、SHA-256、字节数和 MIME，不存可变公开域名；
- 时间统一存 UTC ISO-8601 或明确的整数时间戳，迁移时记录旧值和解析失败项。

在正式导入前，为所有目标表创建版本化 SQL migration。迁移脚本必须能对空 D1 重建结构，不能依靠 Worker 首次请求隐式建表。

## 5. R2 对象布局

推荐对象键仅表达所有权和不可变身份，例如：

```text
news/{asset_uuid}/original.webp
news/{asset_uuid}/thumb.webp
namecards/{card_uuid}/front.webp
namecards/{card_uuid}/back.webp
stories/{asset_uuid}/original.webp
event-chronicle/{asset_uuid}/original.webp
unity/{build_hash}/Build/game.data
```

原始路径、原文件名、审核状态和业务分类保存在 D1 与迁移清单中。审批不移动 `pending` 到 `used`；D1 的状态字段决定是否公开。删除先软删除并停止公开读取，经过保留期后再异步清理对象。

示例中的 `.webp` 只适用于已经验证并实际转换成 WebP 的新对象。旧数据首次迁移保持原始字节、经过内容检测的 MIME 和扩展名，不能只改 object key 后缀伪装格式。

公开媒体读取由 Worker 根据 D1 状态授权并映射到 R2。对永远公开且不可变的资源可以设置长缓存；投稿原图、待审核内容和管理文件不能直接暴露 bucket 地址。

D1 与 R2 不能组成单一事务。新上传使用显式状态机：先以幂等请求键在 D1 创建 `uploading` 记录和不可变对象 ID，再写 R2 并校验 checksum，最后把 D1 状态切为 `ready/pending_review`；公开读取只接受最终状态。R2 成功而 D1 更新失败时，由同一幂等键重试或由清理任务回收孤儿对象；D1 已建记录但 R2 失败时保留失败状态并允许重试。删除先在 D1 写 tombstone 阻断读取，再由可重试任务删除 R2，对象删除完成后记录清理时间。所有补偿任务都要可重复执行并产生审计记录。

## 6. 生产数据盘点

仓库不是生产数据的权威副本。所有盘点和迁移清单必须在实际运行服务器生成。先从生产进程管理器导出完全相同的路径变量并运行严格审计；生成正式 manifest 前进入停写窗口，对 SQLite 做在线备份，清单只接受备份副本，不读取运行中的主 `.db`：

```sh
export IMS_DB_PATH=/actual/path/to/news.db
export IMS_COMPENSATION_DIR=/actual/path/to/compensation
export IMS_UPLOADS_DIR=/actual/path/to/uploads
export IMS_STORY_DB_PATH=/actual/path/to/idol_data.db
export IMS_STORY_DATA_DIR=/actual/path/to/story-data
export IMS_EVENT_BASE_DIR=/actual/path/to/event-chronicle
export BACKUP_DIR=/secure-backups/ims
install -d -m 700 "$BACKUP_DIR"
pnpm run audit:data --details > "$BACKUP_DIR/legacy-audit.json"
pnpm run audit:data --strict

STAMP=$(date +%Y%m%d-%H%M%S)
sqlite3 "$IMS_DB_PATH" ".backup '$BACKUP_DIR/news-$STAMP.db'"
sqlite3 "$IMS_STORY_DB_PATH" ".backup '$BACKUP_DIR/story-$STAMP.db'"
export IMS_INVENTORY_CORE_DB_PATH="$BACKUP_DIR/news-$STAMP.db"
export IMS_INVENTORY_STORY_DB_PATH="$BACKUP_DIR/story-$STAMP.db"
export IMS_INVENTORY_RUN_ID="$STAMP"
sh scripts/migration/legacy-inventory.sh > "$BACKUP_DIR/legacy-manifest-$STAMP.jsonl"
```

示例路径必须替换为服务器真实值，不能原样执行。普通上传目录通过
`IMS_UPLOADS_DIR` 与 Hono Node、审计和清单脚本共享；版本化 release 必须把它设为真实的
共享绝对路径。`audit:data --strict` 会把缺库、schema/外键错误、缺失目录或引用、Core DB
未引用的普通 upload、Chronicle orphan、未完成或未显式处置的补偿 journal、编年史
非法/重复记录、文件名 alias 以及非空 `.staging/.trash` 作为阻断项。生产 inventory 还
要求唯一 run ID 和两份在线备份路径，并拒绝内部符号链接、归一化键冲突、超长/非法
UTF-8 key 与扫描中变化的文件。

当前仓库副本的只读审计已知有 700 个 core 媒体缺失引用、8,866 个剧情图片缺失引用、33 条孤儿表情记录和 53 个编年史文件名路径 alias，本地 strict 失败是正确行为。不得以本地仓库生成正式 D1/R2 导入物，也不得通过删除引用来让数字表面归零；正式迁移只能以生产服务器审计、修复和复核后的结果为准。

每条记录包含：

- `source_path`：仓库内来源使用相对路径，仓库外权威来源使用绝对路径；
- `object_key`：建议的迁移暂存键；
- `domain`：业务归属；
- `bytes`、`sha256`：源文件完整性字段；`mime` 当前由扩展名推断并以 `mime_source=extension` 明示，上传前仍需做内容检测。

同时生成只读的数据引用报告。默认输出汇总；生产迁移闸门使用严格模式，缺失数据库、
SQLite 结构/外键完整性失败、普通 upload 非 DB-reference-driven exact set、Chronicle orphan、
补偿 journal 未收敛或非法编年史元数据都会返回非零退出码：

```sh
python3 scripts/audit/legacy-data-audit.py --details > /secure-backups/ims/data-audit.json
python3 scripts/audit/legacy-data-audit.py --strict
```

报告中的 `filesystem_path_aliases` 表示元数据文件名与磁盘目录项只有在当前文件系统
归一化规则下才指向同一文件。这类引用迁往 Linux 或 R2 时必须使用明确映射，并在
目标端按 object key 逐项回读验证。

正式清单必须在停写窗口生成。脚本能发现单个文件在哈希期间发生变化，但无法发现目录枚举结束后新增的文件，因此不能以“脚本是只读的”为由跳过停写。数据库备份、媒体目录和 manifest 必须记录同一个恢复点/run ID。

## 7. SQLite 到 D1

迁移不直接上传运行中的 `.db` 文件。流程如下：

1. 使用 SQLite 在线备份得到一致副本；
2. 对副本执行 `PRAGMA integrity_check`；
3. 导出 schema 和数据到暂存环境，清理 SQLite 专属语法；
4. 先导入原样 landing tables，保存来源表、来源 ID 和原值；
5. 执行版本化转换 SQL/脚本写入目标表；
6. 在 D1 上运行外键、唯一键、空值、数量和业务不变量校验；
7. 对失败记录写独立 reject 清单，禁止静默丢弃；
8. 在测试 Worker 中做逐 API 影子读比对。

导入前还要用当时的 Cloudflare 官方限制做自动预检，包括数据库/单行/单条语句大小、绑定参数数量和批次规模；明确外键表导入顺序。`sqlite-to-d1.js` 生成的文件只设置 `PRAGMA defer_foreign_keys = TRUE`，不包含 `foreign_keys=OFF`、`BEGIN` 或 `COMMIT`；事务和批次由 Wrangler/import tool 控制，避免远端中途失败后留下难以判断的半批状态。

每张表至少核对：源行数、目标行数、主键范围、关键空值数、来源键去重数和规范化行哈希。剧情迁移还需核对每个企划/偶像/分类的卡片数、链接数和图片引用数。

本地导出和对账入口如下。`sqlite-to-d1.js` 总是同时创建 reject manifest；只要来源存在
critical null、断裂外键或同一卡片的冲突元数据，就只写 rejects 并拒绝生成 SQL。Story
的 base、landing、card 和 link 也全部先进入 staging；base 按来源主键 UPSERT，landing/card/link
则只在 `migration:*`、`legacy-untracked` 等迁移拥有分区内按 exact snapshot 对账和清理。
同一快照重复导入保持幂等，变化快照会删除不再存在的旧迁移行，但不会删除 `runtime` 行或
无法证明由迁移拥有的额外 base 行。

```sh
pnpm --filter @imsweb/api run migration:d1:export core "$IMS_INVENTORY_CORE_DB_PATH" \
  "$BACKUP_DIR/core-$STAMP.sql" "$STAMP" --snapshot \
  --rejects "$BACKUP_DIR/core-$STAMP.rejects.json" \
  --legacy-json "$BACKUP_DIR/core-legacy-$STAMP.json"
pnpm --filter @imsweb/api run migration:d1:export story "$IMS_INVENTORY_STORY_DB_PATH" \
  "$BACKUP_DIR/story-$STAMP.sql" "$STAMP" --snapshot \
  --rejects "$BACKUP_DIR/story-$STAMP.rejects.json" \
  --legacy-json "$BACKUP_DIR/story-legacy-$STAMP.json"

jq -e '.rejects | length == 0' "$BACKUP_DIR/core-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/story-$STAMP.rejects.json"
```

Core 导出是六张 legacy 表的 exact snapshot，不是只追加 UPSERT。它先将快照写入
`_ims_core_snapshot_stage_*`，再按 FK 顺序清空目标并从 staging 重建；这也会在插入新主键前
释放 `users.username` 和 `card_emojis(card_id,emoji)` 等旧次级唯一键，因此正常的业务键复用
不会阻塞导入。六张 AUTOINCREMENT 表的 `sqlite_sequence(name,seq)` 也在同一只读事务中严格
读取、进入 snapshot hash/staging，并在重建后精确恢复；来源没有 sequence 行定义为“无已记录
高水位”（正常情况下即从未分配），目标对应行必须删除。来源即使已空但保留高水位也必须原值
恢复，避免复用历史 ID。全空快照会
清空这六张表但不会擅自归零已存在的来源高水位。导入开始时唯一的
`_ims_core_snapshot_guard` 记录 run ID、快照 hash 和阶段；中断后 guard 保留，重跑会因
唯一约束失败。结束前工具按所有列双向比较 staging 和目标，发现导入期间混入的额外或变化
行会触发约束错误，不会把 run 标成完成。

run ID 必须匹配 `[A-Za-z0-9][A-Za-z0-9._-]{0,79}`。Core 与 Story 的 snapshot run 表都将
`run_id` 永久绑定到 exact snapshot hash；相同 run ID 只能重放同一 hash，不同 hash 会在创建
staging 和修改业务表之前失败。六张 Core 表全部为空时 export 默认失败；七张 legacy Story
表全部为空时，即使 agencies/idols 等 base 表非空，Story export 也默认失败。只有人工确认
这确实是权威空快照后，才计算对应在线备份本身的 SHA-256，并分别追加
`--confirm-empty-core-source-sha256 <64-hex>` 或
`--confirm-empty-story-source-sha256 <64-hex>`。不得把确认参数设为固定值或自动从输入补齐。

export 使用 `mode=ro&immutable=1` SQLite URI，在一个只读 transaction view 内读取全部表；
WAL-mode header 的静态备份不会因此生成 WAL/SHM。工具仍在读取前后比较文件 SHA-256、inode、
size、mtime 和 ctime；源路径是 symbolic link、预先存在 `-wal`、`-journal`、`-shm` sidecar
或任一 metadata/hash 变化均不创建制品。INTEGER 必须能安全表示为 JavaScript safe integer，
TEXT 必须实际使用 SQLite `text` storage class、是严格有效且可逐字节 roundtrip 的 UTF-8，并且
已经是 NFC；BLOB、NUL、非法 UTF-8、非 NFC 文本及其他 storage class 写入 reject manifest，
不生成 SQL 或 legacy JSON。raw `row_json` 和 exact hash 不会静默改写 Unicode 字节序列。

Core 和 Story 的这些内部表是 migration-only 协议，不是在线锁。成功后对应
`_ims_{core,story}_snapshot_stage_*` 与 assertion 会删除；只有空的 guard 和 snapshot run 表
作为受管导入控制/审计表永久保留，Story 同时在 `story_import_runs` 写入完成审计。
只有全部 transient 表删除后才会把 run 标为 `completed` 并释放 guard；失败时尚未删除的
staging/assertion 可能部分残留用于调查。生成 SQL 不含触发器、`foreign_keys=OFF`、
`BEGIN` 或 `COMMIT`，所以它不能阻止一个已经绑定该 D1 的 Worker 发起并发写。导入目标必须
是未出现在 production、preview 或开发 Worker 配置中的隔离 D1；先完成导入与对账，最后
才更新 binding。若 guard 非空，不得手工删除后盲目重跑；保存 guard/run/staging/目标导出后
调查，尚未切流时优先废弃并重建这个隔离目标。

应用 migrations 和 SQL 后，从两个目标 D1 导出按表名组织的 JSON。以下是 local staging
命令；正式远端验收使用同样的 `SELECT` 和 `jq` 映射，但必须指向人工核准且尚未绑定 Worker
的 database ID：

```sh
D1_PERSIST="$BACKUP_DIR/d1-local-$STAMP"
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

CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT id,username,password,dept,producername FROM users ORDER BY id;
   SELECT id,title,image,thumbnail,content,date,author FROM news ORDER BY id;
   SELECT id,username,producername,action,target,ip,time FROM logs ORDER BY id;
   SELECT id,image1_url,image2_url,hash1,hash2,ip,status,created_at FROM cards ORDER BY id;
   SELECT id,title,name,contact,image_url,created_at FROM events ORDER BY id;
   SELECT id,card_id,emoji,count FROM card_emojis ORDER BY id;
   SELECT name,seq FROM sqlite_sequence WHERE name IN ('users','news','logs','cards','events','card_emojis') ORDER BY name;" \
  > "$BACKUP_DIR/core-d1-raw-$STAMP.json"
jq '(.[6].results | map({key:.name,value:.seq}) | from_entries) as $seq |
    {users:.[0].results,news:.[1].results,logs:.[2].results,cards:.[3].results,
     events:.[4].results,card_emojis:.[5].results,
     sqliteSequence:{users:($seq.users // null),news:($seq.news // null),
       logs:($seq.logs // null),cards:($seq.cards // null),
       events:($seq.events // null),card_emojis:($seq.card_emojis // null)}}' \
  "$BACKUP_DIR/core-d1-raw-$STAMP.json" > "$BACKUP_DIR/core-d1-$STAMP.json"

CI=1 NO_COLOR=1 pnpm --filter @imsweb/api exec wrangler d1 execute STORY_DB \
  --local --persist-to "$D1_PERSIST" --json --command \
  "SELECT id,code,name_cn,color FROM agencies ORDER BY id;
   SELECT id,agency_id,name_cn,folder_name,color FROM idols ORDER BY id;
   SELECT name,color FROM theme_colors ORDER BY name;
   SELECT legacy_table,legacy_id,row_json,normalized_hash,last_seen_run_id FROM story_legacy_rows ORDER BY legacy_table,legacy_id;
   SELECT id,idol_id,category,card_name,subtitle,image_file,source_table,source_id,last_seen_run_id FROM story_cards ORDER BY id;
   SELECT id,card_id,up_name,video_title,url,source_table,source_id,source_link_index,last_seen_run_id FROM story_links ORDER BY id;" \
  > "$BACKUP_DIR/story-d1-raw-$STAMP.json"
jq '{agencies:.[0].results,idols:.[1].results,theme_colors:.[2].results,
     story_legacy_rows:.[3].results,story_cards:.[4].results,story_links:.[5].results}' \
  "$BACKUP_DIR/story-d1-raw-$STAMP.json" > "$BACKUP_DIR/story-d1-$STAMP.json"

pnpm --filter @imsweb/api run migration:d1:reconcile \
  "$BACKUP_DIR/core-legacy-$STAMP.json" "$BACKUP_DIR/core-d1-$STAMP.json" \
  migrations/fixtures/critical-fields.json \
  --rejects "$BACKUP_DIR/core-reconciliation-$STAMP.rejects.json"
pnpm --filter @imsweb/api run migration:d1:reconcile \
  "$BACKUP_DIR/story-legacy-$STAMP.json" "$BACKUP_DIR/story-d1-$STAMP.json" \
  migrations/fixtures/reconciliation-config.json \
  --rejects "$BACKUP_DIR/story-reconciliation-$STAMP.rejects.json"

jq -e '.differences | length == 0' "$BACKUP_DIR/core-reconciliation-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/core-reconciliation-$STAMP.rejects.json"
jq -e '.differences | length == 0' "$BACKUP_DIR/story-reconciliation-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/story-reconciliation-$STAMP.rejects.json"
```

`core-legacy-$STAMP.json` 和 `story-legacy-$STAMP.json` 由上面的同一次 export、同一个只读
transaction view 直接生成。Core 结构是六张表 arrays 加固定六键的 `sqliteSequence`；缺少
来源 sequence row 的键必须显式为 JSON `null`，不能改用 `MAX(id)` 或字符串。Story 结构是
`{ "表名": [rows...] }`；不得另行从运行中的 SQLite 重查或手工拼接。上述命令任一步非零即停止；
不能用空文件替代 reject manifest，也不能在 reconcile 失败后更新 Worker binding。Core 与
Story 都要确认 guard 为空、snapshot run 为 `completed`、Story 完成审计 hash 一致，且
`sqlite_master` 中不存在对应 staging/assertion transient 表。

对账输入是按表名组织的 JSON arrays。Story 目标导出必须包含 `story_legacy_rows`、
`story_cards`、`story_links`、`agencies` 和 `idols`；工具会校验 landing 中保存的
`normalized_hash`，从 raw/landing 行确定性派生 canonical card/link，再按来源映射和规范化
hash 比较 `card_name`、`subtitle`、`image_file`、`up_name`、`video_title`、`url` 及
link-to-card 关系。来源键重复、外键断裂、关键空值、字段漂移和业务聚合差异都会写入
结构化 reject 报告。

`tests/migration/wrangler-d1-import.test.js` 使用临时 `--persist-to`，从空 Core/Story D1
应用版本化 migrations，并通过真实 `wrangler d1 execute --local --file` 执行 Core
`A -> B -> B`、次级唯一键在新主键上复用及带源 SHA 确认的重复空快照。Story 同样覆盖
`A -> B -> B`、`A(run-x) -> B(run-x)` 冲突、确认后的空快照和 transient DROP 前尾部截断。
测试还验证变化快照精确收敛、外键顺序、混入写断言、guard/run 状态、最终 gate、内容、行数
和 `foreign_key_check`；全程不访问远端资源。

账号迁移必须保留现有密码哈希算法和参数，先验证登录兼容，再单独设计渐进式哈希升级。日志表按合规和实际排障需求确定保留范围，不应无期限搬迁全部 IP 数据。

## 8. 本地文件到 R2

1. 根据清单生成不可变 object key，并将映射写入迁移表；
2. 对源字节做内容检测，再批量上传到 R2，设置经过验证的 Content-Type 和缓存元数据；
3. 核对上传对象数和总字节数；
4. 不依赖 multipart ETag 作为 SHA-256，在对象元数据或 D1 中保存源 SHA-256；
5. 每次 PUT 提交源 SHA-256 checksum，并逐对象核对 R2 保存的 checksum；若所用迁移工具不能逐对象核对，则全部回读计算 SHA-256，不以大文件抽样代替最终对账；
6. 将数据库中的旧相对路径解析到 object key，报告所有孤儿对象和缺失引用；
7. 通过 Worker URL 检查状态码、Content-Type、缓存和 Range 请求，重点验证 Unity 构建文件。

原图与缩略图都先原样迁移以保持显示一致。图片转换策略稳定后再异步重建衍生图，不能在首次切流时同时改变编码、尺寸和 URL。

仓库提供 audit-gated formal manifest、离线 fixture transport 和显式远端 transport。
正式清单只接受同一恢复点的 Core/Story 备份与媒体副本：普通 uploads 必须全部由 Core DB
引用，Chronicle 不能有 orphan，补偿 journal 必须为空或全部 completed 并有显式 disposition。
它为 uploads、Data、Chronicle pending/used 建立独立 scope，并且只选择两个 Unity payload：
`runninggame/Build/webgame.data` 和 `runninggame/BuildMobile/webgame.data`。同目录的 loader、
framework 和 wasm 继续由 Static Assets 提供，不进入 R2 清单。

```sh
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
  --output "$BACKUP_DIR/r2-$STAMP.json"
jq -e '.migration_ready == true' "$BACKUP_DIR/formal-audit-$STAMP.json"
jq -e '[.manifest.entries[]
  | select(.logicalKey | startswith("unity/runninggame/")) | .logicalKey] == [
    "unity/runninggame/Build/webgame.data",
    "unity/runninggame/BuildMobile/webgame.data"
  ]' "$BACKUP_DIR/r2-$STAMP.json"

# 非空 compensation 目录必须给 manifest 命令追加经人工批准的
# --compensation-disposition <absolute-json>，否则 formal manifest 不会生成。
# formal auditGate 会绑定 report SHA、run ID、sourceProof 及批准文件的 path/SHA/approver/time；
# 任一远端 apply/verify 都会在读取 credentials 前复核，generic manifest 仅可用于本地 fixture。

pnpm run migration:d1:chronicle -- export \
  "$MEDIA_BACKUP/event-chronicle/meta" "$BACKUP_DIR/r2-$STAMP.json" \
  "$BACKUP_DIR/chronicle-$STAMP.sql" "$STAMP" \
  --rejects "$BACKUP_DIR/chronicle-$STAMP.rejects.json" \
  --snapshot-json "$BACKUP_DIR/chronicle-$STAMP.snapshot.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/chronicle-$STAMP.rejects.json"

# 默认只读：重新读取并核对每个源文件，不创建目标。
pnpm run migration:r2:transfer -- transfer \
  --manifest "$BACKUP_DIR/r2-$STAMP.json"

# 本地离线验收：对象写入 fixture 目录，映射写入本地 SQLite object_index。
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
```

远端模式使用 R2 S3 SigV4 和 Cloudflare D1 HTTP API，不读取环境变量中的隐式账号。必须
同时给出 `--remote`、`--apply`、权限为 `0600` 的 credentials JSON 和与 manifest 完全
一致的 `--confirm-run-id`。凭据文件字段为 `accountId`、`apiToken`、`r2AccessKeyId`、
`r2SecretAccessKey`、`bucket`、`databaseId`。只在人工批准的最终停写窗口对全新、隔离的目标
执行。目标 bucket 与 `object_index` 必须专用于本次完整 merged manifest，不得混放其他应用对象。
R2 exact transfer 写入对象、收敛 manifest scopes 内的 stale mapping/object，并更新同一
`CORE_DB.object_index` 后，才能执行上面生成的 Chronicle
SQL；该 SQL 会把 metadata/items 与 Chronicle object_index 做 exact association 断言。随后
独立执行 `--bucket-exact` 全桶远端 verify，再导出 `chronicle_metadata`、`chronicle_items` 和
Chronicle `object_index` 行并执行：

```sh
pnpm run migration:r2:transfer -- transfer \
  --manifest "$BACKUP_DIR/r2-$STAMP.json" --apply --remote \
  --credentials "$R2_CREDENTIALS" --confirm-run-id "$STAMP" \
  --prune-exact-scopes --confirm-prune-run-id "$STAMP" \
  --report "$BACKUP_DIR/r2-remote-transfer-$STAMP.json"
pnpm --filter @imsweb/api exec wrangler d1 execute CORE_DB --remote \
  --file "$BACKUP_DIR/chronicle-$STAMP.sql" --yes
pnpm run migration:r2:transfer -- verify \
  --manifest "$BACKUP_DIR/r2-$STAMP.json" --remote \
  --credentials "$R2_CREDENTIALS" --confirm-run-id "$STAMP" \
  --bucket-exact \
  --report "$BACKUP_DIR/r2-remote-bucket-verify-$STAMP.json"
pnpm run migration:d1:chronicle -- reconcile \
  "$BACKUP_DIR/chronicle-$STAMP.snapshot.json" "$BACKUP_DIR/chronicle-d1-$STAMP.json" \
  --rejects "$BACKUP_DIR/chronicle-reconciliation-$STAMP.rejects.json"
jq -e '.rejects | length == 0' "$BACKUP_DIR/chronicle-reconciliation-$STAMP.rejects.json"
```

完整远端命令、三表导出以及 `_ims_chronicle_snapshot_guard`、run status 和 transient table
闸门见运维手册 7.2。局部 `--scope` verify 只用于 shadow/诊断，报告
`physicalCoverage=indexed-associations`，不能作为切写闸门；正式 `--bucket-exact` 报告
`physicalCoverage=full-bucket`，会把无 index 的纯 orphan 与任意全局 extra 一并判失败。
bytes、SHA-256、检测 MIME、保存 MIME 或映射任一差异都会返回非零。仓库测试和默认命令绝不会
进入远端模式。

## 9. 切流与验证

前四步可以按业务域推进，写切换只能全局执行一次：

1. **契约固定**：保存旧 API 的正常、未登录、无权限和错误响应样本；
2. **预演导入**：向隔离的 shadow D1/R2 导入一致快照并通过行数/哈希/引用校验；
3. **影子读取**：线上请求仍返回旧结果，后台异步比较新旧结果并脱敏记录差异；
4. **小比例切读**：先内部账号，再逐步放量，持续比较 4xx/5xx、延迟和业务计数；
5. **全局停写**：同时关闭所有会写 Core、Story、Chronicle 或同批 R2 的 legacy 入口；
6. **最终 exact snapshot**：同一 run ID 重新备份、audit-gated manifest、整体导入 Core 六表、
   Story、R2/object_index 和 Chronicle；整个过程目标 D1 不得有任何在线新写；
7. **整体对账**：Core/Story/Chronicle reconcile、guard/run/transient、外键和五个 R2 scope
   全部为绿，任何差异都回到旧 Hono Node，不能只放行某个写域；
8. **一次性切写**：同时更新 bindings/routes，只保留 Worker 一个权威写入点，验证新建、修改、
   审核和删除；
9. **稳定观察**：旧服务保持只读，不立即删除 SQLite 或本地媒体；
10. **确认完成**：保存最终对账报告、恢复点和迁移版本。

Core importer 是六张 legacy 表的 exact snapshot 协议，不是可用于逐域补写的增量工具。不得长期
双写 SQLite 和 D1；跨网络双写无法形成原子事务。切写后不得再次运行 legacy exact importer，
否则会删除或覆盖 Worker 已产生的合法新数据。

## 10. 回滚

切读期间的回滚只需将 Worker route 指回 legacy origin，因为旧系统仍是权威写入点。

切写后的回滚必须先停止新写入并对 D1/R2 新增数据做反向导出或业务补录。只有确认切换后没有新数据，才能直接把旧 SQLite/本地目录重新设为权威源。任何回滚都不得静默丢弃 Cloudflare 期间的投稿、审核或账号变更。

每个迁移批次需要预先记录：route 回退方式、旧系统恢复点、D1 migration 版本、R2 manifest、增量数据提取方法和最大可接受停写时间。

## 11. 完成标准

读路由可以逐域达到 shadow/read 完成；生产写迁移只有整体同时满足以下条件才算完成：

- 所有公开和后台契约测试通过；
- D1 行级对账和 R2 对象级对账无未解释差异；
- 权限、CSRF、上传限制和审计在 Worker 路径生效；
- 监控可以区分 Worker、D1、R2 和 legacy origin 故障；
- 已演练路由回退和数据恢复；
- 旧数据进入只读保留期，且有明确销毁日期与责任人。
