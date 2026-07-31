# IMSWeb

IMSWeb 是面向《偶像大师》中文社区的内容站与管理平台，提供资讯、活动、作品推荐、剧情、
Wiki、编年史以及配套的内容管理能力。

本项目由社区独立维护，不是《偶像大师》系列的官方网站，也不代表相关官方或权利人。

## 项目状态

当前公开仓库由 Hono Node API 和 React Web 组成。前端生产构建会被验证并打包进 API 的
发布目录，Hono 是唯一服务端运行时。历史 Express/Flask 实现及其素材、数据不属于本开源
项目，已在独立私有仓库中保留。

## 仓库结构

IMSWeb 是一个 pnpm monorepo：

| 路径        | 包            | 职责                                    |
| ----------- | ------------- | --------------------------------------- |
| `apps/api/` | `@imsweb/api` | Hono + TypeScript Node API              |
| `apps/web/` | `@imsweb/web` | React Router 7 + React 19 Web 应用      |
| `data/`     | -             | 被 Git 忽略的本地数据库、上传和迁移输入 |
| `deploy/`   | -             | 本地 PostgreSQL 与 MinIO 编排           |
| `scripts/`  | -             | 边界检查、迁移、发布与运维工具          |
| `tests/`    | -             | 仓库级基础设施和部署契约测试            |

根 package 只负责编排，依赖必须安装在实际使用它的 workspace 中。

## 快速开始

### 环境要求

- Node.js `>=22.13.0`
- pnpm `>=11.10.0`，建议通过 Corepack 使用
- macOS 或 Linux；Windows 开发使用 WSL2
- Docker 或 Podman，以及可连接本机引擎的 Compose v2

从仓库根目录安装依赖：

```sh
corepack enable
pnpm install --frozen-lockfile
```

### 启动开发环境

日常开发只需要一个命令：

```sh
pnpm dev
```

该命令会检查本机环境，启动 PostgreSQL 和 MinIO，等待依赖就绪，幂等应用数据库迁移，再启动
支持热更新的 Hono API 与 React Web。默认地址如下：

- Web：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3000`
- MinIO 控制台：`http://127.0.0.1:9001`

需要让同一套 API/Web 热更新环境连接 Cloudflare R2 测试桶时，在被 Git 忽略的
`apps/api/.env` 中填写测试桶配置后运行：

```sh
pnpm run dev:r2
```

该入口继续使用本地 PostgreSQL，但不会启动或初始化 MinIO。启动器只读取 R2 存储字段和 AWS
凭据，并拒绝名称未明确标记为 `test` 的 bucket；API 的 JWT、站点地址和数据库仍使用隔离的
本地开发配置。

首次启动可能需要拉取容器镜像。`Ctrl+C` 只停止本次启动的 API 和 Web，PostgreSQL、MinIO
及数据卷会保留，以便下次快速启动；不再使用时运行：

```sh
pnpm run dev:down
```

`pnpm run dev:doctor` 可执行只读环境诊断，并核对 Compose 实际连接的是本机 endpoint。
`pnpm dev` 与 `pnpm run dev:down` 会拒绝远程 Docker/Podman context。启动器会提供隔离的本地
数据库和对象存储配置，日常开发不必先创建 `.env`；端口覆盖、独立 workspace 启动和外部服务配置见
[AI 开发环境指南](docs/ai-development-environment.md)。

## 常用命令

| 命令                        | 作用                                               |
| --------------------------- | -------------------------------------------------- |
| `pnpm dev`                  | 一键启动本地依赖、迁移、API 与 Web 热更新环境      |
| `pnpm run dev:r2`           | 使用 R2 测试桶启动 API 与 Web 热更新环境           |
| `pnpm run dev:doctor`       | 只读检查 Node、pnpm、依赖、容器运行时和端口        |
| `pnpm run dev:down`         | 停止本地 PostgreSQL 与 MinIO，保留数据卷           |
| `pnpm run dev:node`         | 热重载启动 Hono Node API（源码和 `apps/api/.env`） |
| `pnpm run dev:web`          | 启动 React Router 开发服务器                       |
| `pnpm run build`            | 构建 Web、API 和可发布客户端                       |
| `pnpm run check`            | 运行边界、静态、架构、测试和资产检查               |
| `pnpm run test`             | 运行基础设施、API、Web 和路由契约测试              |
| `pnpm run test:web`         | 运行 Web 单元测试与 Playwright 测试                |
| `pnpm run test:web-routing` | 验证真实前端产物与 Hono 路由所有权                 |

## 架构边界

- Web 页面、组件和浏览器 API 位于 `apps/web/`；请求使用同源相对 URL。
- API 业务代码依赖 `apps/api/src/ports/`，具体数据库、存储和媒体实现由 `runtime` 组合。
- Web 构建产物经 manifest 和逐文件内容校验后复制到 `apps/api/dist/client` 与
  `apps/api/dist/node-client`；不要手工维护 API 静态目录。
- PostgreSQL 是活动运行时的唯一权威数据库，MinIO/S3 是可变媒体的统一存储。SQLite 与
  filesystem 适配器仅保留给显式迁移、测试和离线兼容流程。
- `data/` 只保存本地运行状态和迁移输入，除 `.gitignore` 外不会进入版本控制。

更具体的约束见 [API workspace](apps/api/README.md)、[Web workspace](apps/web/README.md)及各目录
的 `.rules`。`AGENTS.md` 与 `CLAUDE.md` 均为指向同目录 `.rules` 的兼容入口；运行
`pnpm run check:rules` 可快速校验链接完整性。

## 参与贡献

提交 Issue 或 Pull Request 前请阅读 [贡献指南](CONTRIBUTING.md)。请勿提交真实凭据、生产
数据库、用户上传、个人信息、构建产物或来源不明的素材。

安全问题请不要在公开 Issue 中披露可利用细节；在项目启用私密安全报告后，优先通过该渠道
联系维护者。

## 许可证与内容权利

本仓库中由 IMSWeb contributors 原创的源代码和项目文档采用 [MIT License](LICENSE)。
依赖项和第三方内容继续适用其各自许可证，MIT 不会重新授权这些内容。

Web 公开资产必须登记来源和许可状态，见
[资产来源记录](apps/web/docs/ASSET_PROVENANCE.md)。没有明确再分发授权的图片、字体、
音视频、品牌标识、游戏资源或社区投稿不得加入公开仓库。

《偶像大师》及相关名称、商标、角色和素材归各自权利人所有。本项目许可证不授予任何商标权，
也不表示官方授权或背书。

## 文档索引

- [贡献指南](CONTRIBUTING.md)
- [静态站点包编写与调试规范](docs/static-site-package-authoring-guide.md)
- [AI 开发环境指南](docs/ai-development-environment.md)
- [数据库配置](docs/database-configuration.md)
- [数据库架构与 PostgreSQL 迁移边界](docs/database-architecture.md)
- [Node 文件对象存储](docs/object-storage.md)
- [部署、备份与回滚](docs/operations-runbook.md)
- [本地依赖服务](deploy/README.md)
