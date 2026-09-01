# IMSWeb 文档中心

> 文档类型：导航与规范
> 状态：Active
> 权威来源：本文件、各 workspace `.rules` 和仓库自动化检查

`docs/` 只保存长期有效、能够指导设计、开发、运维或数据迁移的仓库级知识。一次修改的说明、
某次测试结果、日期快照、Issue 审计、临时截图和发布证据不属于长期文档，应保存在 Pull Request、
Issue、release record 或私有运维记录中。

代码目录、workspace 运行方式和组件设计优先写在所属目录的 `README.md`、`DESIGN.md` 或
`.rules`。仓库级文档链接到这些权威入口，不复制第二份实现说明。

## 文档地图

| 分类            | 用途                                            | 内容边界                                              |
| --------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `architecture/` | 系统结构、领域边界、端口、数据面和共享 contract | 解释为什么以及模块如何协作，不记录发布快照            |
| `development/`  | 本地开发、测试和内容编写规范                    | 提供可重复流程，不记录某次执行结果                    |
| `operations/`   | 配置、部署、备份、回滚和资源交付                | 描述长期 runbook，具体 release 数据进入运维记录       |
| `migrations/`   | 可重复的数据导入、对账、切流和恢复合同          | 记录不变量和步骤，具体来源/数量/日期进入私有 manifest |
| `governance/`   | 资产来源、许可、安全和发布治理                  | 保存可追溯权利信息，不保存需求过程或测试反馈          |

## 架构

- [Domain 能力结构](architecture/domain-capabilities.md)：五个 API section、capability 化大域、扁平小域和组合规则。
- [数据库架构](architecture/database.md)：PostgreSQL、repository ports、事务、幂等和迁移边界。
- [对象存储架构](architecture/object-storage.md)：S3-compatible 数据面、保护对象、状态机和补偿。
- [缓存架构](architecture/cache.md)：Valkey、Memory fallback、限流和非权威缓存边界。
- [Wiki 管理架构](architecture/wiki-management.md)：Wiki 数据模型、公开/后台 API 和媒体关系。
- [URL 与公共路径架构](architecture/url-paths.md)：共享路径 builders、路由所有权和变更流程。
- [玻璃折射的平台策略](architecture/glass-refraction-platform-strategy.md)：伪折射地板、Chromium 真折射封顶和跨引擎降级。
- [@imsweb/contracts](../packages/contracts/README.md)：API↔Web wire contracts、路径 builders 和 zod 封装。

## 开发

- [AI 开发环境](development/ai-environment.md)：安装、启动器、端口覆盖、R2 模式和验证边界。
- [测试规范](development/testing.md)：按风险选择测试、测试位置和提交前门禁。
- [静态站点包编写规范](development/static-site-package-authoring.md)：归档、manifest、预览和发布约束。
- [Tauri 移动端基础设施](development/tauri-mobile.md)：移动外壳现状、前置条件、跨源 API 契约和阻塞项。
- [液态玻璃升级与 App 外壳实施计划](development/liquid-glass-app-shell-plan.md)：分层模型、并发轨道编排、三批交付和验证门。

## 运维与迁移

- [数据库配置](operations/database-configuration.md)
- [部署与发布](operations/github-actions-deployment.md)
- [现网运行手册](operations/runbook.md)
- [地图资源交付](operations/map-delivery.md)
- [OpenMap S3 发布规范](operations/openmap-s3-publication.md)
- [Fudaba Platform 数据迁移合同](migrations/fudaba-platform.md)
- [Producer Map 数据迁移与对账](migrations/producer-map-online.md)

## 治理

- [公开资产来源与许可](governance/assets.md)
- [贡献指南](../CONTRIBUTING.md)
- [Web 设计系统](../apps/web/DESIGN.md)

## 文档规范

### 1. 权威性

每个事实只能有一个权威来源：

- 代码结构和运行行为以代码、类型、migration 和自动化检查为准；文档解释边界和操作方式。
- API↔Web wire format 以 `@imsweb/contracts` 为准；API ports、数据库 Records 和 Web UI 类型不
  作为跨 workspace contract。
- URL 与公共资源前缀以 `@imsweb/contracts/paths` 为准；文档只说明责任和变更影响面。
- PostgreSQL schema 以 `apps/api/migrations/postgresql/` 为准；文档不维护手工表数量或版本快照。
- 生产发布以 `.github/workflows/`、`deploy/` 和发布脚本为准；文档不复制独立 shell 实现。
- 具体迁移来源、对象数量、hash、release 和执行结果以私有 manifest/release record 为准。

### 2. 文档头部

每个 `docs/**/*.md` 文件必须在标题后写元信息：

```markdown
> 文档类型：导航与规范 | 架构 | 开发 | 运维 | 迁移 | 治理
> 状态：Active | Decision
> 权威来源：代码路径、脚本、配置或上级文档
```

`Active` 描述需要持续与实现同步的事实和流程；`Decision` 描述必须长期保持的架构或迁移决策。
迁移和运维文档还必须写明适用环境、前置条件、回滚边界和验证方法。

### 3. 内容写法

- 文件名使用英文 kebab-case；标题可使用中文，产品名、代码标识和命令保持原样。
- 先写适用范围和结论，再写原因、步骤、例外和验证。
- 使用“必须、不得、应、可”表达约束；只有能由权威来源验证的事实才写成现状。
- 命令必须可从仓库根目录或明确标注的 workspace 执行；危险命令注明数据影响和回滚方法。
- 内链使用真实存在的相对 Markdown 链接；不要保留旧路径兼容副本。
- 示例引用 package script 或现有脚本，不复制容易漂移的完整实现；配置说明同时标注变量拥有者
  和浏览器可见性。
- 一份文档只服务一个主要读者和任务；需要跨主题时链接到权威文档，不复制章节。

### 4. 禁止内容

长期文档不得包含：

- 某次修改、某个分支或某个工作树的状态说明；
- 某次测试的通过数量、截图、执行日期或临时验证结论；
- 带日期的 Issue 审计、排期、完成清单或阶段性 TODO；
- 可从 migration、schema、package scripts 或代码自动得到的手工快照数字；
- 真实 token、Cookie、个人信息、生产日志、私有 bucket 或数据库凭据；
- 已失效内容的“历史归档副本”。没有长期价值的内容直接删除；仍有价值的规则应改写后并入
  对应的架构、开发、运维、迁移或治理文档。

日期、commit、对象数量和测试结果如果是发布或迁移证据，应进入 PR、Issue、release record、
CI artifact 或被 Git 忽略的私有 manifest，而不是 `docs/`。

### 5. 生命周期

新增文档前先判断它是否具有跨发布的长期价值，以及属于哪个分类。小域说明留在代码目录
README。改动结构、脚本、配置、migration 或发布流程时，同一变更更新对应文档和链接。文档
失效时删除并把仍有效规则合并到权威文档，不创建 `archive/` 或日期后缀文件。

提交前至少运行：

```sh
pnpm run check:rules
pnpm run test:infra
```

跨 workspace、数据库、对象存储或发布改动继续运行根目录 `pnpm run check` 和
`pnpm run test`，并在 PR 中记录实际结果。

## 自动检查

`pnpm run check:rules` 运行 agent/source/docs 三类规则。docs checker 验证 taxonomy、元信息、
相对链接、旧路径、日期快照和一次性文档命名；`tests/test_docs.py` 固定这些约束。修复漂移时应
更新权威文档或删除一次性记录，不得通过降低检查范围保留过期内容。
