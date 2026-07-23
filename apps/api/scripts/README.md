# 操作脚本目录

操作脚本按风险和职责分类。日常使用从 monorepo 根调用稳定命令，或显式使用
`pnpm --filter @imsweb/api run <命令>`，避免依赖内部文件路径。

| 分类 | 路径 | 数据影响 | 稳定入口 |
| --- | --- | --- | --- |
| 构建辅助 | `build/` | 构建 `dist/server/`、717-file Worker `dist/client/`、719-file Node `dist/node-client/` | 根 `pnpm run build` |
| 发布检查 | `checks/` | 只读；检查 Hono 架构边界 | 根 `pnpm run check` |
| 迁移准备 | `migration/` | 只读业务库；生成 D1/R2 清单，或显式同步 Wiki 来源素材 | `pnpm run migration:*`、根 `pnpm run wiki:media:sync` |
| 账号运维 | `operations/accounts/` | `add-user.js` 会写权威核心数据库；哈希工具不写数据库 | 根 `pnpm run ops:account:add`、`pnpm run ops:password:hash` |

## 使用边界

- `checks/` 可以在正常运行期间执行，但生产路径必须与进程管理器一致；
- `build/client-allowlist.json` 是受审查的发布集合；新增 `apps/legacy/public/` 文件不会自动进入
  Static Assets，Unity `.data` 另由固定 R2 清单处理；
- 仓库根 `scripts/migration/legacy-inventory.sh` 的正式输出只能在停写窗口中生成，并且
  生产模式必须指向 SQLite 在线备份副本，不能直接清点运行中的主数据库；
- 根 `migration:media:manifest` 是正式媒体入口。它先执行 strict data gate：普通 uploads
  必须是 Core DB-reference-driven exact set、Chronicle 不得有 orphan，补偿 journal 必须为空
  或全部 completed 且有精确 disposition；闸门失败时只生成 audit report，不生成 formal manifest；
- formal manifest 固定包含 logical keys `unity/runninggame/Build/webgame.data` 和
  `unity/runninggame/BuildMobile/webgame.data`，旧 URL 仍为 `/runninggame/...`，且不包含相邻
  Unity wasm/framework/loader；
- `migration:r2:transfer` 默认只做源文件 dry-run；本地写入必须显式给 `--apply` 和
  `--fixture-dir`。远端 apply/verify 只接受 `migration:media:manifest` 生成的 formal envelope：
  在读取 credentials 或创建远端 transport 前，命令会稳定读取 `auditGate.report`，重算并核对
  SHA-256，且要求 manifest、gate、audit report 的 run ID 一致、两个 ready 值严格为 `true`，并
  逐值绑定 source proof 和补偿 disposition 证据。
  远端还必须给 `--remote`、`--confirm-run-id` 和权限为 `0600` 的 credentials 文件，测试及发布
  检查不读取隐式 Cloudflare 凭据。普通 apply 只 PUT/UPSERT；
  只有同时给 `--prune-exact-scopes --confirm-prune-run-id <manifest.runId>` 才会删除 manifest
  scope 内的 stale index 和已经证明没有任何活跃 logical key 引用的旧 immutable object。
  prune 必须在目标 D1/R2 停写窗口执行；清理结果和候选证据写入 stdout/`--report`。缺少迁移
  归属 metadata 的无 index 对象只记录、不删除；
- `migration:r2:transfer -- verify` 必须显式给一个或多个 manifest 声明的 `--scope`，或单独给
  `--bucket-exact`。scope 模式只精确比较选中 prefix 的 index/object association，报告中的
  `physicalCoverage=indexed-associations` 明示它不能证明 bucket 没有无 index orphan；正式切换验收
  必须对完整 merged manifest 执行 `--bucket-exact`，精确比较全 bucket `objects/` 与全表
  `object_index`，且不得和 `--scope` 混用；
- Chronicle metadata 必须用 merged R2 manifest 和同一个 run ID 导出：

  ```sh
  pnpm run migration:d1:chronicle -- export \
    "$MEDIA_BACKUP/event-chronicle/meta" "$BACKUP_DIR/r2-$STAMP.json" \
    "$BACKUP_DIR/chronicle-$STAMP.sql" "$STAMP" \
    --rejects "$BACKUP_DIR/chronicle-$STAMP.rejects.json" \
    --snapshot-json "$BACKUP_DIR/chronicle-$STAMP.snapshot.json"
  ```

  先完成 R2 transfer/object_index，再对同一 `CORE_DB` 执行 SQL；之后导出
  `chronicle_metadata`、`chronicle_items`、Chronicle `object_index` 三表，用
  `migration:d1:chronicle -- reconcile <snapshot.json> <target.json> --rejects <file>` 对账，并
  验证 guard 为空、run completed、无 staging/assertion。空 meta 还需人工提供
  `--confirm-empty-source-sha256`；
- `migration:d1:export` 与 `migration:d1:reconcile` 输出结构化 reject manifest。Story
  快照用 `last_seen_run_id` 清理不再存在的 landing/card/link 行，不静默保留旧数据；
  生成 SQL 不内嵌事务或关闭 FK，`wrangler-d1-import.test.js` 会通过真实 local D1 重复导入；
  对账从 raw/landing 派生 canonical card/link，逐字段、来源映射和规范化 hash 检测漂移；
- `wiki:media:sync` 只抓取 `idol-master.top` 的第一方 Wiki 素材。默认下载首页、全部剧情页和
  页面引用的素材到 Git 忽略的 staging，并生成来源 URL、页面归属、SHA-256、MIME、大小与
  目标对象键清单；页面/数据库角色集合不一致、资源缺失、跨域跳转、未知角色或内容校验失败
  都会使清单不完整。只有 `--upload` 或 `--upload-existing` 会写配置的 S3/R2；后者会在上传前
  重新核对 staging 文件和业务映射，不重新抓取远端。
- 读路径可以分域 shadow/read；写路径不可以。Core 六表 exact importer、Story、Chronicle 和
  同批 R2 必须在同一最终停写窗口整体导入、对账后一次切写，期间隔离 D1 不得收到新写。
  切写后不得再次运行 legacy exact importer；
- 根 `migration:release:activate` 只接受包含代码、lockfile、host-installed `node_modules`、
  client/node-client/server dist 的完整同机 staging release，并原子替换 `current`；必须先
  `pnpm install --frozen-lockfile`，再 build/check/test，不能在构建前使用 `--prod`。生产
  `IMS_PUBLIC_DIR` 必须是 `$IMS_CURRENT_LINK/apps/api/dist/node-client`；六个可变数据路径必须是
  releases/current 树之外、canonical pairwise disjoint 的绝对路径。已有 release 用
  `migration:release:rollback -- <release-id>` 原子回切，禁止覆盖 live 目录；
- `operations/` 下的命令属于人工确认操作。执行账号写入前必须显式设置
  `IMS_DB_PATH`、确认已备份，并只在受控 shell 中短暂注入明文密码；
- 真实密钥、密码、清单和备份不得写回仓库。

需要把 manifest 重定向为机器可读 JSONL 时，按迁移手册直接执行
`sh scripts/migration/legacy-inventory.sh > <受保护路径>`，避免在输出链路中混入包管理器日志。

兼容命令 `pnpm run user:add` 和 `pnpm run password:hash` 暂时保留，分别转发到新的
`ops:*` 命令，后续自动化应改用分类后的入口。
