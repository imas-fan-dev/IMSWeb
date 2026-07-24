# 参与贡献

感谢你参与 IMSWeb。贡献应保持 API、Web、数据和部署边界，并提供与改动风险相匹配的验证
证据。

## 开始之前

1. 搜索现有 Issue 和 Pull Request，避免重复工作。
2. 跨 workspace、数据迁移、路由所有权或部署方式的较大改动，应先用 Issue 说明范围和验收方式。
3. 缺陷报告请提供最小复现；新增行为请说明用户场景和不在本次范围内的内容。
4. 不要在公开 Issue 中粘贴密钥、生产日志、个人信息或未脱敏的数据样本。

## 准备环境

需要 Node.js `>=22.13.0` 和 pnpm `>=11.10.0`：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check:root
```

应用不会自动加载 `.env`。从 `apps/api/.env.example`、`apps/web/.env.example` 或
`deploy/.env.example` 选择变量，并只在本地 shell、进程管理器或未提交的 env 文件中设置
实际值。完整流程见 [AI 开发环境指南](docs/ai-development-environment.md)。

## 选择修改位置

| 修改范围 | 主要位置 | 最小验证 |
| --- | --- | --- |
| Hono API、数据库、媒体、服务端路由 | `apps/api/` | `pnpm run check:api`、`pnpm run test:api` |
| React 页面、组件、浏览器 API | `apps/web/` | `pnpm run check:web`、`pnpm run test:web` |
| 根脚本、部署或文档契约 | `scripts/`、`deploy/`、`docs/`、`tests/` | `pnpm run check:root`、`pnpm run test:infra` |
| 跨 workspace 契约 | 多个位置 | `pnpm run check`、`pnpm run test` |

历史 Express/Flask 项目位于独立私有仓库，不接受从该仓库复制代码、数据或资产到公开项目。

## 编码约定

- 使用严格 TypeScript；依赖放在实际使用它的 workspace，不创建子锁文件。
- API 使用四空格、分号、单引号，内部导入使用以 `apps/api/src` 为根的 `@/` 别名。
- Web 使用两空格、无分号、双引号和 `~/` app 别名；文件名使用 kebab-case，React 组件使用
  PascalCase。
- Web 改动提交前运行 `pnpm --filter @imsweb/web format` 和
  `pnpm --filter @imsweb/web lint`。
- 复用现有 port、adapter、API client 和 UI 原语，不在页面或业务域重复实现基础设施逻辑。
- 保持 Pull Request 聚焦，不夹带无关格式化、生成产物或目录重构。

修改前还应阅读根目录和目标 workspace 的 `AGENTS.md`。

## 测试要求

测试应放在受影响 workspace 附近，并使用仓库已有的 Node test runner、Vitest、Testing
Library、Playwright 或 Python `unittest`。文件名遵循现有 `*.test.*`、`*.spec.ts` 或
`test_*.py` 约定。

- 缺陷修复应加入能够在修复前失败的回归测试。
- API 持久化改动必须覆盖当前 Node 运行时和真实数据库 contract。
- 路由所有权变化必须更新并运行 `pnpm run test:web-routing`。
- 可见 Web 改动应检查桌面端和移动端，并在 Pull Request 中附截图。
- 跨 workspace 或发布边界改动应运行完整 `pnpm run check` 与 `pnpm run test`。

Pull Request 中列出实际运行的命令和结果；无法运行的门禁要说明原因。

## 数据、资产与安全

禁止提交：

- `.env`、访问令牌、Cookie、私钥或真实账号；
- 数据库、上传、日志、备份、构建产物或其他运行状态；
- 未脱敏的用户数据或生产数据样本；
- 来源、权利人和再分发许可不明确的图片、字体、音视频、品牌标识或内容数据。

新增公开资产必须在 `apps/web/docs/ASSET_PROVENANCE.md` 记录原始来源、权利人、许可证或
书面授权、允许的使用范围、修改状态和文件 SHA-256。仅有外链、作者昵称或“非商用”说明不
等于取得开源再分发许可。

不要绕过数据库对账、单写入端、媒体状态机、CSRF、路径策略或发布门禁。

## 提交与 Pull Request

提交信息使用 Conventional Commit 风格，例如：

```text
feat: add recommendation moderation filters
fix: preserve chronicle media ordering
docs: clarify PostgreSQL setup
test: cover rejected story uploads
```

Pull Request 应包含改动目的、受影响 workspace、数据或配置变化、实际验证命令、关联 Issue，
以及可见 Web 改动的桌面端和移动端截图。

## 贡献许可

提交贡献即表示你有权提交相关内容，并同意将你原创的源代码和项目文档按仓库根目录的
[MIT License](LICENSE) 提供。第三方内容仍适用其原许可证，贡献者不能替第三方授予额外权利。
