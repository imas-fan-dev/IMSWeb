# Fudaba Platform 数据迁移与维护合同

> 文档类型：迁移
> 状态：Decision
> 权威来源：`apps/api/src/domains/community/fudaba/`、`apps/api/migrations/postgresql/`、Fudaba migration scripts 和运行时 contract tests
> 适用环境：隔离演练、生产导入、增量对账和切流

本文定义 Fudaba 数据进入 IMSWeb 的长期边界。它不记录某个分支、commit、测试批次或上线日期；
每次执行的来源版本、数据集标识、对象 bucket、导出时间和 SHA-256 必须写入被 Git 忽略的迁移
manifest，而不是修改本文。

## 固定架构边界

- IMSWeb 是唯一 Hono API 和 React Web 运行时；Fudaba 不以 iframe、第二套 SPA、Worker 或
  D1 runtime 长期挂载。
- PostgreSQL 是身份、事务所、名片、地图、审核和迁移状态的唯一权威数据库。
- 可变媒体通过 `ObjectStorage` 和补偿端口进入同一个 S3-compatible 数据面；domain 不直接
  使用 R2 binding、bucket SDK 或物理 key。
- Backoffice 与 Platform 是独立身份域。管理员 JWT、角色和 refresh session 不得作为平台
  用户身份；平台账号也不获得后台权限。
- 历史 guest namecards 与注册用户 Fudaba cards 保持独立表面，通过 claim/binding 关系协作，
  不靠相同文本 ID 自动取得所有权。
- API↔Web wire contract 和共享 URL prefix 分别由 `@imsweb/contracts` schema 与 path builders
  管理；迁移不能引入旁路 JSON 或临时 URL。

## 业务不变量

### 注册用户名片

注册用户管理自己的 Fudaba card。新写入必须包含 primary series 和 1–20 个唯一、存在的 idol
ID；跨企划选择允许，primary series 只表示主要企划。发布和管理员审核使用 revisioned CAS，
`approving` 状态冻结源记录、目标记录和对象版本，避免并发覆盖。

### Guest 名片

Guest 上传只保留 token 状态查询和 pending withdrawal。Guest 不拥有图片替换、拒绝后重提或
wall placement 权限。Guest 请求同样提交 primary series 和 idol IDs，但不获得平台注册身份。

### 历史认领

- same-ID match 只生成 ownership envelope，不自动绑定。
- envelope 的 confirm/decline 与 legacy claim 都使用 revisioned transition。
- 一个 legacy card 同时最多有一个 active/approved claim。
- 管理员批准后才建立 durable binding；已删除但仍绑定的 card 仍视为 claimed。
- legacy media 复制、保护、发布、数据库完成和失败补偿必须能处理 complete-then-throw、
  put-after-write 和部分复制等不确定结果。

### 地图与事务所

公开 series、office、location 和 map 读取受 feature gate 控制；office/location 写入属于注册用户
Platform session。事务所位置由认证用户通过同源地点搜索选择，精确坐标只保留在 owner 投影；
公开事务所与地图投影展示审核通过的地址文本，地图 marker 只使用区域化坐标且界面不显示经纬度
数字。区域坐标、封面、office slug 和 revision 均由现有 request/response contract 验证，迁移不得
绕过审核或位置冲突规则。

## 数据迁移流程

### 1. 来源锁定

为每次导入建立独立、被 Git 忽略的工作目录，并记录：

- 来源仓库或数据导出的不可变标识；
- 数据库/对象存储来源身份；
- 输入文件的相对路径、字节数和 SHA-256；
- 目标 PostgreSQL、bucket、prefix 和应用 release；
- 执行者、只读盘点结果和批准记录。

禁止把来源数据库、用户上传、manifest、token 或生产配置提交到 Git。历史私有仓库的代码、CSS、
设计文档和素材不能作为公开仓库的复制来源；只有经授权的数据和媒体可以进入目标。

### 2. 只读提取

```sh
pnpm --filter @imsweb/api run migration:fudaba -- extract
```

提取必须规范化编码、ID、时间、状态、企划/偶像引用和对象清单，并拒绝重复主键、孤儿引用、
未知状态、非法路径和无法归属的媒体。提取产物只能进入 `data/migration/`。

### 3. PostgreSQL 导入

先备份目标 PostgreSQL，再应用当前 migration ledger：

```sh
pnpm run migration:postgresql
pnpm run migration:fudaba:import
```

导入必须事务化并可重跑。已有相同业务键但内容不同的记录属于冲突，不能用 upsert 静默覆盖。
Platform account、provider identity、guest submission、registered card、office 和 claim 的归属要
保持原始身份边界；不能仅按 email 自动合并账号。

### 4. 媒体计划与写入

```sh
pnpm run media:fudaba:sync
pnpm run media:fudaba:sync -- --apply
```

默认命令只生成计划。写入前核对来源授权、MIME、尺寸、字节数、SHA-256、逻辑 key、目标 scope
和 owner token。写入后必须从对象存储回读并比对哈希，再更新 PostgreSQL 控制面。失败清理只按
本次 object ID/owner token 执行，不能删除共享 prefix 或较新的对象版本。

### 5. 对账

```sh
pnpm run migration:fudaba:reconcile
```

对账至少覆盖：

- 每类实体的来源、导入、拒绝和冲突计数守恒；
- series/idol 外键、office/card ownership 和 claim/binding 唯一性；
- guest/registered 状态机与 revision 单调性；
- 逻辑 key、object ID、physical key、scope、MIME、字节数和 SHA-256；
- 公开读取、owner workspace、claim、审核和 map placement 的代表性 HTTP 行为；
- PostgreSQL 与对象存储备份属于同一停写窗口。

任何差异都必须通过修复迁移器或新增 forward migration 解决，不能直接修改已发布 SQL 或手工补
生产行。

## 切流与回滚

切流前必须完成备份、只读对账、写入演练、媒体授权审查、feature gate 验证和桌面/移动关键流程。
先开放公开读取，再开放 owner write 和审核；每个阶段都要保留关闭 gate 的回退能力。

应用回滚只能回到理解当前 PostgreSQL schema 和对象状态机的版本。数据回滚必须成对恢复数据库和
媒体；不能只恢复一侧。已经签发的 session、已完成 claim 或已发布 object 需要显式兼容策略，
不能依赖删除新表或重用旧 ID。

## 变更要求

修改 Fudaba schema、状态机、路由、对象 key 或迁移脚本时，同一变更必须更新：

1. PostgreSQL forward migration 与 repository contract；
2. `@imsweb/contracts` schema/type/path；
3. API/Web consumer 与 HTTP conformance tests；
4. extract/import/reconcile/media plan；
5. 本合同中受影响的不变量和回滚边界。

完成标准不是“脚本退出 0”，而是来源可追溯、计数守恒、对象回读一致、HTTP 行为符合 contract，
并且回滚责任和 feature gate 已明确。
