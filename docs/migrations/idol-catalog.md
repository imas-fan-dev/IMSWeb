# 统一偶像资料库迁移与回放

> 文档类型：迁移
> 状态：Active
> 权威来源：`apps/api/migrations/postgresql/`、`apps/api/scripts/migration/catalog-facts.js`、`apps/api/scripts/migration/legacy-data-cleanup.js` 和 `apps/api/tests/migration/`

## 适用环境与前置条件

先在预览库一致快照的本地隔离副本上验证，再进行预览环境发布。正式库升级在预览方案稳定后
独立演练，不用预览数据覆盖正式数据。连接、服务启动与执行权限遵循
[AI 开发环境](../development/ai-environment.md) 和[数据库配置](../operations/database-configuration.md)。
目标结构与业务归属见[统一偶像资料库](../architecture/idol-catalog.md)。迁移器是 schema 的唯一
写入口，保留已执行文件和 checksum；不能在目标数据库手工重写迁移账本。

## 回放顺序

1. 记录源快照、迁移账本、角色／组合／内容页稳定 ID、担当及导航顺序、剧情与媒体投影；证据
   放在忽略的私有 manifest 中。先恢复副本，不能直接拿运行中业务库开发 DDL。
2. 使用现有 PostgreSQL migration 入口应用增量迁移，建立企划档案、兼容投影和绑定。重复运行
   应无待执行项；schema 最低版本门禁必须与应用一致。
   并行分支可能带入时间戳更早但尚未执行的 migration；门禁同时检查角色权威迁移和上游的
   主页数字别名迁移，不能仅以最新版本已存在判断完整性。
3. 核对旧投影中的字段值、类型、空值和排序。特别保留布局版本的数值类型、对象逻辑键、构图
   和名称定位。核心重命名不改变现有名片、角色、组合、企划和剧情条目 ID。
4. `20261105200000_catalog_public_facts` 在正常 SQL 升级中回填已确认人物的生日及配音事实，
   不依赖发布主机上的 Web 源文件。它按企划和审定名称匹配，保留已有日期、配音状态、CV 与
   手工展示；仅百万现场复用原 765 人物身份。没有目录或独立 Wiki 依据时不凭姓名创建人物。
   空库可正常初始化；已有数据升级后应验收实际生日投影，不能只核对 schema 版本。
   追加迁移中的事实快照随版本冻结，后续事实修订使用新迁移，不改写已发布文件。
   需要另外盘点或回放时，对仓库公开事实执行只读盘点，再明确写入本地副本：

   ```sh
   node apps/api/scripts/migration/catalog-facts.js
   node apps/api/scripts/migration/catalog-facts.js --apply
   ```

   两条命令均从仓库根目录执行，`DATABASE_URL` 必须显式指向本地隔离副本。第一条只读，第二条
   写入可确认的生日、配音状态和必要的人物企划关系；检查返回的冲突与未匹配清单。CV 不由名单
   推测或覆盖，已有手工资料保持优先。重复导入应保持已落地资料及版本不变。
   试运行使用内存中的候选身份／档案预测创建及绑定，不调用序列。已有档案的手工展示资料与
   Wiki 不一致时报告冲突，不覆盖后绑定；出现冲突或未匹配时 CLI 返回 `2`。
5. 完成真实 PostgreSQL、对象存储及管理界面回读后，再按正常发布流程切换预览应用。

同名人物不能跨世界观合并；DS 与 SideM 的秋月凉保留独立身份。765 与百万现场共享人物只有在
源入口和主数据均可确认时增加企划档案，分别保留头像。栏目收录不覆盖组合完整成员。

## 迁移后旧数据清理

清理入口为 `apps/api/scripts/migration/legacy-data-cleanup.js`，默认只读。它要求目标已应用当前
完整 migration catalog 且 checksum 一致；实际执行重新盘点、获取同步与 schema 锁，并锁定
涉及表。范围为七张历史分企划剧情表、旧 `namecard_favorite_characters` 和已核实迁移的
`card_emojis`，不删除规范角色／剧情／名片数据、兼容视图、迁移账本或对象存储。

配置放在仓库外的 `0600` JSON 中，字段为 `target`（连接字符串）、`confirmTargetDatabase`
（实际目标库名）和 `backupDirectory`（备份绝对目录）。可以复用 preview 同步配置并补充备份目录。

```sh
node apps/api/scripts/migration/legacy-data-cleanup.js /private/cleanup.json
node apps/api/scripts/migration/legacy-data-cleanup.js /private/cleanup.json --apply
# 单独核查并清理表情，不处理剧情或旧担当记录
node apps/api/scripts/migration/legacy-data-cleanup.js /private/cleanup.json --scope=emojis
node apps/api/scripts/migration/legacy-data-cleanup.js /private/cleanup.json --scope=emojis --apply --verified-only
```

`--apply` 会先生成私有 PostgreSQL dump，再逐条验证溯源、归属、标题、链接和媒体字段，删除
已核实副本，并核对规范表的行数及内容哈希；不一致则回滚。默认任何未核实来源都会阻止整个
删除事务。需要仅清理已核实子集时显式增加 `--verified-only`；未核实行保留，CLI 仍返回 `2`，
不能把它当成全部清理完成。`0` 表示无已知阻塞，`1` 表示执行失败／未提交清理事务。

`--scope` 接受 `stories`、`favorites`、`emojis` 或逗号分隔的组合，默认检查全部范围。表情按
旧名片 ID 对应的 `card_number`、原始表情字符串和正数计数逐条比对 `namecard_reactions`；
已认领或软删除的名片仍使用原编号，不使用合并目标的累计计数冒充源计数。计数不同、缺少当前
计数、孤立来源或非正数来源全部保留，不按当前表情调色板筛掉历史表情。

表情清理要求没有传入外键，且归档写保护处于启用状态。备份后，同一事务先在操作状态 schema
`legacy_cleanup.emoji_receipts` 保存已核实来源、目标、计数和备份位置，再仅暂停
`card_emojis_read_only` 行写保护以删除指定 ID，提交前恢复保护。其他触发器保持启用，失败时
触发器状态、清理回执和删除一起回滚。当前表情与未选中旧记录参与前后内容哈希校验。
名片对账脚本识别这些回执，不将已清理来源误报为“仅统一表存在”；回执不掩盖仍保留来源的差异。

旧 `cards` 不在删除范围内，仍有历史引用与归档约束。清理不能用删除依赖、置空历史 ID、禁用
全部触发器或 `CASCADE` 绕过关系。来源已被后续人工修改、移动或删除时，保留旧副本并单独
核对；不能用旧数据覆盖当前编辑来满足清理条件。

preview 同步会先在 PostgreSQL 内转换旧表名／列名的 baseline；规范 baseline 接管后，在同一
事务内删除已替代的旧 baseline。`agencies` 同时拆为企划和 Wiki 配置，两个目标都接管后才退役
旧 baseline；未接管、冲突或其他来源的状态保留，历史事件不删除。

## 验证与回滚边界

角色资料收敛阶段将旧角色业务字段填入完整企划档案，并删除身份表上的业务列。已有企划名称
优先保留，与原角色名称不同时将原名称纳入别名；名称差异单独记录在私有验收清单，不静默覆盖。
投影变化时推进身份版本，拒绝迁移前打开的旧编辑器覆盖资料；其他企划已存在的档案排序保留。
名片与认领继续保存角色 ID，读取默认档案。旧目录视图的写适配器同事务维护身份与档案，旧入口
不再拥有另一份角色资料。回放应覆盖默认切换、过期写拒绝、兜底唯一性及全部历史引用。

公开路径、请求、响应和交互保持原契约。检查名片多担当、认领与待审载荷、旧名称链接、独立条目、
绑定／解绑、导航名单与顺序、剧情可达性、CV 与配音状态独立性，以及媒体替换与共享引用保护。
权限、CSRF、资料和媒体版本冲突都需要实际请求验证。

继承名称与原本地定位名的冲突必须在数据库事务中拒绝，不能让现有按名称查询的公开接口产生
歧义。组合新增企划档案后也要验证旧版组合编辑器的过期写入被拒绝，已有档案和成员关系不丢失。

兼容视图承接现有 Repository 协议，不能绕过绑定资料的写权限。预览内容同步保留其本地资料库
绑定，不导入旧源临时生成的档案 ID；同步前后的基线也必须回读验证。

破坏性清理后置。应用回退前先验证其对视图、触发器、档案写入和媒体状态机的理解；旧应用不能
随意覆盖已经绑定的展示资料。若需要恢复数据库，使用切换前的一致备份及相同版本的对象存储证据，
先保留切换后的新增业务数据，不以删除迁移账本或改写已执行 SQL 作为回滚。

字段合并超过长度限制或名称冲突时，迁移应事务失败、保留源记录和原账本；先明确修复源资料的
方案再重试，不能截断别名或修改已执行 migration。覆盖这些情况的真实数据库测试见
`character-profile-authority.test.ts`、`catalog-facts.test.js`、`preview-data-sync.test.ts` 和
`legacy-data-cleanup.test.ts`、`legacy-emoji-cleanup.test.ts`。
