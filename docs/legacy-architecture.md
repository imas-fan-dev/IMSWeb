# 旧架构回滚基线

本文记录 Hono 迁移前的 Express + Flask 事实基线，用于契约比对和受控回滚。它不是当前
仓库的部署说明；当前运行方式见 `README.md` 和 `docs/operations-runbook.md`。生产服务器
上的实际 Nginx、进程管理器、证书和防火墙配置仍需单独归档。

## 1. 迁移前拓扑

```text
浏览器
  |
  v
Nginx
  |-- /story, /wiki/, /image/, /api/wiki/* --> Flask :5000
  `-- 其他页面、静态资源、/api/*          --> Express :3000

Express --> apps/legacy/database/news.db
        --> apps/legacy/public/uploads/
        --> apps/legacy/public/assets/images/eventchronicle/events/{upload,used,meta}/

Flask   --> apps/legacy/public/idol_data.db
        --> apps/legacy/public/Data/
        --> apps/legacy/flask/templates/, apps/legacy/public/icon/, apps/legacy/public/css/
```

旧 Nginx 会在转发 `/wiki/` 时剥离前缀。Hono 直接实现 `/wiki/`，当前单上游配置必须保留
原始 URI，不能继续沿用该 Flask `proxy_pass` 行为。

## 2. 旧进程职责

Express 曾负责门户静态文件、Core 登录与权限、资讯、宣传活动、制作人名片、表情、活动
编年史、图片派生和 Core SQLite。Flask 曾负责 Wiki SSR、Story SQLite、剧情图片与
Bilibili 链接解析。

当前这些能力位于：

```text
apps/api/src/server/
  app.ts                       Hono 应用工厂和中间件顺序
  main.ts                      Node listener 与生命周期
  worker.ts                    Cloudflare Worker 入口
  ports/                       业务依赖接口
  adapters/node/               SQLite、文件系统、Sharp、Busboy
  adapters/cloudflare/         D1、R2、Images、Assets
  domains/                     Core、Chronicle、Wiki Hono 路由与服务
```

Node 兼容阶段继续使用旧 SQLite 和本地目录格式，因此代码回滚与数据回滚仍是两件事。
旧 Flask/Jinja/Gunicorn/uWSGI 源码与回归测试位于 `apps/legacy/flask` 和
`apps/legacy/tests`，Express 基线位于 `apps/legacy/src/server`，原站浏览器资源位于
`apps/legacy/public`。Python 依赖由该 workspace 的 `pyproject.toml` 与 `uv.lock` 管理。它们已由
`apps/api/tests/wiki` 的共享 Hono 契约替代，不属于生产部署；只有显式 `legacy:*`
命令才会运行该 workspace。

## 3. 旧数据所有权

| 业务域 | Node 兼容阶段权威数据 | 可变文件 |
| --- | --- | --- |
| 账号、资讯、宣传活动、名片、表情、日志 | `apps/legacy/database/news.db` | `apps/legacy/public/uploads/` |
| 活动编年史 | `meta/*.json` 和目录状态 | `events/upload/`、`events/used/`、`events/meta/` |
| 剧情档案 | `apps/legacy/public/idol_data.db` | `apps/legacy/public/Data/` |
| 门户、图标和普通图片 | Git 工作树 | 无，除非人工替换发布内容 |
| Unity WebGL | Git 工作树中的 `apps/legacy/public/runninggame/` | 无运行时写入 |

`news.db` 包含 `users`、`news`、`events`、`cards`、`card_emojis` 和 `logs`。
`idol_data.db` 包含 `agencies`、`idols`、`theme_colors` 及七张 `*_stories` 表。
编年史的旧审核状态由目录表达；Worker 适配器将其映射为 D1 中的明确状态，R2 只存对象。

## 4. 必须维持的兼容契约

- 门户、`/story`、`/wiki/`、`/image/`、`/api/wiki/`、Core API 和媒体 URL 不变；
- Core 继续接受裸 Token、Bearer 和 Cookie，Wiki 保留自己的 Cookie/CSRF 差异；
- 数据库主键、图片 URL 和编年史活动 ID 不做原地改写；
- 上传原图、缩略图和审核目录不随代码发布覆盖；
- SQLite 与对应媒体必须保存为同一恢复点；
- 已切到 Cloudflare 写入后，代码回滚前必须先导出并处理 D1/R2 增量。

## 5. 仍需在线确认的缺口

- 生产 TLS、域名、真实监听端口、Cloudflare 账户与资源 ID；
- 生产数据库和媒体的严格审计结果、停写窗口和完整对账报告；
- Cloudflare Images 的账户能力和费用；
- Hono Node 与 Cloudflare 数据回滚演练、只读保留期限和责任人；
- 旧后台 `localStorage` Token 的后续收敛方案。

仓库内数据不是生产权威副本。没有上述证据时，只能确认迁移实现和本地验证完成，不能
声明线上 D1/R2 切写或旧数据退役完成。
