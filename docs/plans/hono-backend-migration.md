# Hono 后端全量迁移计划

> 本文保留 2026-07-21 的双运行时迁移计划作为历史记录。2026-07-24 起当前实现与验收只支持
> Hono Node；Worker、D1、R2 和 Cloudflare Images 章节不再是待执行计划。

## 1. 目标与已确认决策

- 将现有 Express 与 Flask 后端全部迁移到 TypeScript + Hono。
- 共享一套业务核心，同时提供 Node 和 Cloudflare Worker 两个运行入口。
- 当前服务器最终合并为单个 Hono Node 进程，继续监听 `127.0.0.1:3000`。
- Flask Wiki 的 Jinja 页面迁为 Hono JSX/TSX 服务端渲染，保留现有 URL、HTML 和浏览器脚本行为。
- Cloudflare 目标产品按 Workers + D1 + R2 设计。
- 代码迁移一次完成，生产分两次切换：先切 Hono Node，再在数据对账后切换 D1/R2。
- SQLite、本地媒体与 D1/R2 不长期双写；任何时刻只能有一个权威写入源。
- 仓库采用 pure root aggregator：Hono 位于 `apps/api`，Legacy 位于 `apps/legacy`；
  根 `package.json` 只编排 workspace，不承载应用依赖。
- `apps/legacy/public/` 是原站唯一受版本管理的静态资源源，并与 Express、Flask 同属一个
  workspace。API 只生成独立发布产物，不复制 SQLite、`Data/`、上传、编年史状态或补偿目录。
- `apps/legacy` 只用于回归对照和代码回滚，不加入默认构建、生产 Compose 或 Cloudflare 部署。

本计划不包含直接创建或修改线上 Cloudflare 资源。正式部署前还需要确认账户、域名、
D1/R2 资源 ID、Images 能力、停写窗口和回滚责任人。

## 2. 迁移前基线和备份

迁移开始前已生成并校验源码快照：

```sh
cd .backups/express
shasum -a 256 -c express-pre-hono-20260721-pre-hono-final.tar.gz.sha256
```

`express-pre-hono-20260721-pre-hono-final.tar.gz` 包括：

- `src/server/` Express TypeScript 源码与干净的 `dist/server/` 发布制品；
- `js/server.js`、构建脚本、TypeScript 配置、包清单和 pnpm 锁文件；
- Node 安全回归、操作脚本测试、Compose 和关联 Nginx 配置；
- 当前 Git commit、工作树状态和快照内部逐文件 SHA-256。

该快照有意不包含 SQLite、WAL、上传媒体、剧情数据、日志、虚拟环境、密钥或 `.env`。
生产回滚必须另外保存同一停写窗口内的数据库在线备份与媒体清单，不能以源码快照代替数据备份。

Legacy workspace 的 Express 源码只从该归档选择性恢复；Flask 源码与模板从 Git commit
`10430da` 精确恢复。不得恢复归档中的 `dist`、Compose、deploy、根 manifest/lock，也不得
把运行数据当作源码恢复。

## 3. 目标代码结构

```text
package.json                      # 只编排 workspace，默认命令只运行 Hono
pnpm-workspace.yaml
compose.yaml                      # 仅 Nginx -> Hono Node
deploy/nginx/
scripts/                          # workspace boundary、数据审计和迁移前 inventory
tests/                            # 根部署与数据审计测试
apps/
  api/                            # @imsweb/api
    src/
      app.ts                      # createHonoApp()，只负责路由与中间件装配
      main.ts                     # Node 兼容入口
      worker.ts                   # Cloudflare Worker 入口
      ports/*.ts                  # 业务能力、Repository 与运行时注入契约
      infra/cache/                # filesystem、memory 适配器
      infra/db/                   # provider、共享 Repository 与内部 SQL Driver 契约
      infra/http/                 # busboy、filesystem 等适配器
      infra/media/                # sharp 适配器
      infra/oss/                  # filesystem、s3 对象存储适配器
      infra/security/             # bcrypt、hmac 适配器
      runtime/                    # 唯一组合根，选择具体中间件
  legacy/                         # @imsweb/legacy
    public/                       # 原站浏览器资源与本地兼容数据
    database/                     # Express 本地 SQLite
    flask/                        # Flask 剧情服务
      domains/                    # auth/audit/news/events/wiki 等业务域
    migrations/
    scripts/build/
    scripts/checks/
    scripts/migration/
    tests/
    dist/                         # 仅 Hono 构建输出
    wrangler.jsonc
  legacy/                         # @imsweb/legacy，仅回归/回滚
    src/server/                   # 恢复的 Express TypeScript
    js/server.js
    flask/                        # app.py、Gunicorn/uWSGI 配置、Jinja templates
    tests/
    dist/                         # 仅 Legacy Express 构建输出
```

Legacy 的 Gunicorn/uWSGI 配置只接受 package-local 路径和环境变量，不保留历史
`/idolweb/...` 或日志目录硬编码；它们仍不进入根 Compose 或生产进程配置。

业务域只能依赖 `ports/` 中的接口，不得导入任何 `infra/` 路径或直接导入
Express、Flask、`sqlite3`、`fs`、
Sharp、Multer、Pillow 或 Node 环境变量。

## 4. Hono 应用和兼容约束

### 4.1 Node 入口

- `createHonoApp(resolveServices)` 返回标准 Hono 实例。
- 新增 `honoApp` 导出，供标准 Request/Response 测试使用。
- 原 `app` 继续导出 Node request listener 函数。
- `startServer({ host, port })` 继续返回 Node `Server`。
- `closeDatabase()`、加载模块时不自动监听、从任意工作目录启动等契约保持不变。
- `apps/api/js/server.js` 继续作为旧 PM2/systemd 命令的兼容转发入口。

Node 入口使用 `@hono/node-server`。Worker 入口直接导出 `app.fetch`，两者共用同一个
应用工厂和业务域注册代码。

### 4.2 安全中间件

以下行为是迁移契约，不能直接以 Hono 默认中间件替换：

- 同时接受 `Bearer <token>` 和旧前端使用的裸 `Authorization: <token>`；
- Cookie JWT 的 HS256、claim、两小时有效期和 `csrfSecret` 保持兼容；
- Cookie 写操作继续比较 CSRF Header、`csrf_token` Cookie 和 JWT claim；
- Authorization 鉴权写操作继续跳过 Cookie CSRF；
- 保持 `op` 权限、现有中文错误消息、Cookie 属性和退出清除行为；
- 只信任一层 Nginx 转发的客户端地址；Worker 使用可信的 Cloudflare 请求信息；
- 敏感路径和私有媒体检查必须先于任何静态资源回退。

Hono 的 `secureHeaders`、CORS 和 Cookie helper 可以使用，但配置必须以现有响应契约测试为准。

## 5. 业务域迁移

### 5.1 Core 业务

先为 SQLite 提供 Promise repository，再迁移 `auth`、`audit` 和 `reactions`。保留
`/api/emojis` 与 `/api/reactions` 不同的成功响应，不在迁移中顺手统一历史 API。

随后迁移 `news`、`events`、`namecards` 和 `media`：

- 名片保持两张、每张 3 MiB；
- 活动保持一张、3 MiB；
- 资讯保持可选一张、10 MiB；
- 名片继续转 WebP 并按内容哈希去重；
- 资讯继续生成缩略图；
- 待审核名片及缩略图只能由 `op` 访问，并返回私有缓存头；
- 删除数据库记录后，媒体清理仍按可重试的补偿操作处理。

### 5.2 活动编年史

- 上传保持最多五张、每张 5 MiB；
- 名片和编年史继续共享每小时 30 次上传额度；
- Node 适配器兼容当前 `upload/used/meta/.staging/.trash` 目录；
- 业务层改用明确的 `pending/approved/deleted` 状态；
- Worker 使用 D1 保存记录和状态，R2 保存对象，不再通过移动对象表达审批；
- 所有上传、审核、拒绝和删除必须有幂等键及失败补偿。

### 5.3 Flask Wiki

- 将 `public/app.py` 的静态、查询、写入、Bilibili 解析和布局接口全部迁入 `domains/wiki/`；
- `/wiki/` 明确返回 Wiki 首页，`/` 继续返回主站首页；
- `/story`、`/image/...` 和 `/api/wiki/...` 保持现有路径；
- 九个 Jinja 模板（首页、剧情页和七个 agency partial）迁为 TSX SSR 组件，保留页面
  DOM、CSS class、内联数据和浏览器脚本契约；
- Bilibili 请求改用标准 `fetch` 和超时信号；
- 全部 Flask 契约测试迁移后，从活动部署删除 Python Web 运行时和 5000 端口依赖；
  `apps/legacy/flask` 只保留回归与回滚能力。

## 6. Node 与 Cloudflare 适配器

### 6.1 Node

- Core 和 Story 分别连接现有两份 SQLite；
- 媒体继续使用当前可配置的绝对目录；
- Sharp 负责图片解码验证、WebP 和缩略图；
- multipart 使用流式解析并在解析前限流；
- Node 仍以单实例运行，直到编年史状态完全迁入 D1。

### 6.2 Worker

Worker 环境绑定：

```text
CORE_DB       D1Database
STORY_DB      D1Database
MEDIA_BUCKET  R2Bucket
ASSETS        Fetcher
IMAGES        ImagesBinding
IMS_JWT_SECRET secret
```

- 每次请求从 `c.env` 构造适配器，禁止把 binding 或密钥缓存到模块全局；
- D1 使用 prepared statements 和版本化 migration；
- R2 object key 使用不可变对象 ID，不使用标题、分类或原始文件名作为身份；
- Images binding 处理上传验证、WebP 和缩略图；正式切写前必须确认账户能力和费用；
- 小时级业务限流使用 D1 窗口计数表，保持名片和编年史的共享额度；
- Worker 公开读取只接受 D1 最终状态，不能直接暴露待审核 R2 对象。

## 7. 静态资源和 Nginx

- 从 `apps/legacy/public/` 通过 `apps/api/scripts/build/client-allowlist.json` 构建独立
  `apps/api/dist/client`，禁止直接把 Legacy 目录设为 Workers Assets 根目录；
- 排除数据库、WAL、Python、模板、日志、虚拟环境、`Data/`、上传目录和编年史状态；
- 普通 HTML/CSS/JS/字体/固定图片进入 Static Assets；
- 超过 Static Assets 限制的 Unity 文件进入 R2，并保持旧 URL 映射；
- Worker-first 只覆盖 API、Wiki SSR、受保护媒体和需要安全头处理的路径；
- Node 切换时删除 Nginx 的 `ims_flask` upstream 和 Wiki 分流，全部代理到 `ims_node:3000`；
- Compose 继续挂载官方 Nginx 镜像配置，不构建自定义镜像。

## 8. D1/R2 数据迁移

### 8.1 D1

- Core 初期保持现有表和字段语义；
- Story 先导入 `story_legacy_rows`，再转换为 `story_cards` 和 `story_links`；
- `(legacy_table, legacy_id)` 建唯一约束，确保重复导入幂等；
- 所有 schema 使用版本化 SQL migration，禁止首请求隐式建表；
- 对账包括行数、主键范围、关键空值、来源键、规范化行哈希和业务聚合数量。

### 8.2 R2

- manifest 保存 run ID、旧路径、object key、字节数、内容检测 MIME 和 SHA-256；
- 拒绝符号链接、非 UTF-8、Unicode 归一化冲突、重复 key 和超过 1024 字节的 key；
- `.staging`、`.trash` 和运行中产生的文件不能进入正式清单；
- 每次 PUT 提交 SHA-256，并逐对象核对或完整回读，不以抽样代替最终对账；
- D1/R2 上传使用 `uploading -> pending/ready -> deleted` 状态机和补偿任务。

### 8.3 切写

1. 在生产路径运行严格只读审计并修复所有阻断项。
2. 短暂停写，对两份 SQLite 执行在线备份，并生成同一 run ID 的媒体清单。
3. 导入 D1 landing tables 和 R2 对象，执行完整对账。
4. 先影子读和内部读流量，不拆分写请求。
5. 再次停写并补齐增量，只在确认无差异后将 Worker 设为唯一写入源。
6. 旧 SQLite 和媒体进入只读保留期，不立即删除。

## 9. 测试矩阵

根默认门禁只运行 Hono；Legacy 必须显式执行：

```sh
pnpm run check:boundaries
pnpm run build
pnpm run check
pnpm run test
pnpm run worker:dry-run

pnpm run legacy:build
pnpm run legacy:check
pnpm run legacy:test
pnpm run test:all
```

- 保留现有 Node 安全回归，并将 Flask 测试迁为共享 Hono 契约测试；
- 同一业务契约分别运行在 Node SQLite/文件适配器和 Worker D1/R2 环境；
- 覆盖裸 Token、Bearer、Cookie、CSRF、角色、Cookie 属性和跨运行时 JWT；
- 覆盖错误 JSON、multipart 字段顺序、中断、超大小、超数量、伪造 MIME 和临时文件清理；
- 覆盖共享限流、响应 body/header 和 429 必须发生在文件落盘之前；
- 覆盖敏感路径双编码、HEAD、Range、Content-Length、MIME、ETag 和私有缓存；
- 覆盖 Unicode 分解/合成路径、编年史补偿和 D1/R2 状态机重试；
- `honoApp.request()` 测纯业务，真实 HTTP 测 Node adapter、Cookie、multipart 和生命周期；
- Worker 使用 Cloudflare Vitest integration 测 D1、R2、Assets 和 Images 绑定。

## 10. 发布和回滚

### 阶段一：Hono Node

1. 使用数据库和媒体副本在旁路端口完成测试。
2. 短暂停写，停止旧 Express/Flask，从根 `pnpm start` 启动统一 Hono Node `3000`。
3. 验证登录、资讯、后台写入、上传、匿名 pending `401` 和 `op` pending `200`。
4. Nginx 切为单上游并恢复写入。
5. 本阶段数据格式不变，失败时停止 Hono；在独立数据副本上验证
   `pnpm run legacy:test` 后，才可按回滚手册恢复旧 release。Legacy 不得与 Hono 同写。

### 阶段二：Cloudflare

1. D1/R2 全量导入、影子读和对象级对账通过后再安排切写。
2. 切写前保存 D1 migration 版本、R2 manifest、旧数据恢复点和增量导出方法。
3. Worker 代码回滚不等于数据回滚；若 Cloudflare 已产生新写入，必须先导出增量。
4. 禁止直接把旧 SQLite 恢复为权威源而丢弃 Cloudflare 期间的数据。

## 11. 完成标准

- Express 和 Flask 路由均由 Hono 实现，Flask 进程和 5000 端口退出部署；
- 根 manifest 不声明应用依赖，`apps/api` 与 `apps/legacy` 是两个真实 pnpm workspace；
- 根默认 `build/check/test/start/worker:dry-run` 仅执行 `@imsweb/api`，Legacy 只由显式
  `legacy:*` 或 `test:all` 命令触发；
- `apps/legacy/public/` 保持原站唯一 tracked 静态源，API/Legacy 的 `dist`、配置和测试互不混用；
- workspace boundary、根 Compose/Nginx、Hono client/Worker bundle 均确认不包含
  Legacy、Python、数据库、`Data`、上传或 `desktop.ini`；
- Node 与 Worker 契约测试、构建、Wrangler dry-run 和静态资源扫描全部通过；
- D1 行级对账与 R2 对象级对账不存在未解释差异；
- 权限、CSRF、限流、上传清理、审计和私有媒体行为无退化；
- 完成一次 Hono Node 代码回滚和一次 Cloudflare 数据回滚演练；
- 旧数据有明确的只读保留期、销毁条件和责任人。

## 12. 官方参考

- [Hono Node.js adapter](https://hono.dev/docs/getting-started/nodejs)
- [Hono Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/)
