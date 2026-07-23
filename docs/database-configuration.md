# SQLite 数据库配置

本说明适用于 Hono Node、本地 Legacy Express 和 Legacy Flask。Cloudflare Worker 不读取
本地 SQLite 文件，而是使用 `apps/api/wrangler.jsonc` 中绑定的 D1 数据库。

## 数据库职责

| 数据库 | 环境变量 | 本地默认路径 | 使用者 |
| --- | --- | --- | --- |
| Core | `IMS_DB_PATH` | `apps/legacy/data/core/news.db` | Hono Node、Legacy Express |
| Story | `IMS_STORY_DB_PATH` | `apps/legacy/data/story/idol_data.db` | Hono Node、Legacy Flask |

Core 保存账号、资讯、日志、名片、活动和表情数据；Story 保存企划、偶像、剧情及剧情关联。
`IMS_COMPENSATION_DIR` 不是数据库，但它记录 Hono Node 文件操作的补偿任务，必须和 Core、
Story 及媒体目录一起备份和切换。

应用只读取进程环境变量，不会自动读取任何 `.env`。API 模板位于
`apps/api/.env.example`，应由当前 shell、systemd、Supervisor、PM2 或其他进程管理器
注入实际值。

## 路径解析

- 从仓库根目录启动 Hono Node 时，相对路径按仓库根目录或 `IMS_PROJECT_ROOT` 解析。
- 在 `apps/legacy` 中启动 Express 或 Flask 时，相对路径按 `apps/legacy` 或
  `IMS_PROJECT_ROOT` 解析。
- 生产环境必须使用 release 目录之外的绝对路径，避免代码切换改变数据库位置。
- 变量必须指向主 `.db` 文件，不要指向 `-wal` 或 `-shm` 侧车文件。

SQLite 在目标文件不存在时可能创建一个空数据库，因此不能把“进程成功启动”当作配置正确。
切换配置前必须先用 `test -f` 确认数据库存在，并检查其完整性。

## 本地配置

从仓库根目录启动 Hono Node：

```sh
export IMS_DB_PATH="$PWD/apps/legacy/data/core/news.db"
export IMS_STORY_DB_PATH="$PWD/apps/legacy/data/story/idol_data.db"
export IMS_COMPENSATION_DIR="$PWD/apps/legacy/data/core/compensation"
test -f "$IMS_DB_PATH"
test -f "$IMS_STORY_DB_PATH"
IMS_JWT_SECRET='<high-entropy-secret>' pnpm run dev:node
```

直接运行 Legacy 时，在两个终端分别配置所需数据库：

```sh
cd apps/legacy

# Legacy Express
export IMS_DB_PATH="$PWD/data/core/news.db"
test -f "$IMS_DB_PATH"
pnpm run start:node

# Legacy Flask，在另一个终端执行
export IMS_STORY_DB_PATH="$PWD/data/story/idol_data.db"
test -f "$IMS_STORY_DB_PATH"
pnpm run start:flask
```

## 生产配置

生产数据库和相关可变状态应放在共享持久目录，而不是版本化 release 内：

```sh
export IMS_PROJECT_ROOT=/srv/ims/current
export IMS_DB_PATH=/srv/ims/shared/database/news.db
export IMS_STORY_DB_PATH=/srv/ims/shared/database/idol_data.db
export IMS_COMPENSATION_DIR=/srv/ims/shared/database/compensation
export IMS_UPLOADS_DIR=/srv/ims/shared/uploads
export IMS_STORY_DATA_DIR=/srv/ims/shared/story-data
export IMS_EVENT_BASE_DIR=/srv/ims/shared/event-chronicle
```

数据库文件及其父目录必须允许应用运行用户读写。变更路径时，先停止所有写入进程，生成与媒体
目录配对的 SQLite 在线备份，再更新进程管理器环境变量。Hono Node 与 Legacy 不能同时写入
同一份 Core 或 Story 数据库；任意时刻只能有一个权威写入端。

## 配置验证

在启动应用前执行：

```sh
test -f "$IMS_DB_PATH"
test -f "$IMS_STORY_DB_PATH"
sqlite3 "$IMS_DB_PATH" 'PRAGMA quick_check;'
sqlite3 "$IMS_STORY_DB_PATH" 'PRAGMA quick_check;'
pnpm run audit:data
```

两个 `PRAGMA quick_check` 都必须输出 `ok`。`audit:data` 的 `databases.core.path` 和
`databases.story.path` 必须与进程管理器配置一致，且 `exists` 为 `true`。仓库内兼容数据有
已知引用缺口，因此本地 `audit:data --strict` 失败不代表路径配置失败；生产切换仍必须按
[运维手册](operations-runbook.md)完成在线备份、严格审计和恢复演练。

不要直接复制正在写入的 `.db`，也不要手工删除活动数据库的 `-wal` 或 `-shm` 文件。
