# 社区与体验交付证据

记录日期：2026-08-11（最新更新）

## 视觉检查

- 桌面视口：Chrome，1440 × 900。
- 移动视口：Pixel 7，412 × 915。
- 移动端正反面切换按钮实测约 49.6 × 44 像素，满足不小于 44 × 44 像素的触控目标。
- 检查了正反面切换、当前面状态、固定预览容器、缩放控件、空白区域关闭以及桌面/移动布局。
- 本轮未采集 Lighthouse CLS 数值；人工切面检查未观察到预览容器尺寸跳动。

截图：

- `namecard-preview-desktop.webp`
- `namecard-preview-mobile.webp`

截图使用本地视觉测试数据，不包含生产投稿数据。

## 自动化验证

- Web ESLint：通过，0 warning。
- Web typecheck：通过。
- Web Vitest：72 测试文件 / 255 测试通过。
- Web production build 与 Classic Wiki CSS cascade 检查：通过。
- Web client packaging 与 asset scan：通过。
- `git diff --check`：通过。
- API check：syntax + TypeScript + Hono architecture + build 全部通过。
- API `test:node`：52/52 通过（含 auth contract、media range、reaction、multipart、chronicle 合约与 probe）。
- API `test:server`：165/165 通过（含 handler/model 回归、runtime adapter、story repository、local upload sync、rate limiter、validation 兼容性）。
- API `test:wiki`：57/57 通过（admin data contract、public data contract、Bilibili parser、CSRF contract、media/story object paths、CRUD cleanup、upload validation、entity revision）。
- API `test:migration`：51/51 通过（brand assets、information media、namecards、producer map、local upload、PostgreSQL runner、public object placement、semantic keys、single bucket、wiki media sync、wiki metadata audit）。
- **API 完整测试套件：325/325 通过。**

## 环境限制

- Windows 环境缺少 `sh`，根级 `pnpm run check` 和 `pnpm run test` 的 `check:root` 步骤在 `sh -n` 和 `bash -n` 处停止；规则、工作区边界和设计规范检查通过。Web/API 子 workspace 的完整 check 和 test 已用直接命令全部验证通过。
- 本机 PostgreSQL 端口为 5433（非默认 5432），需通过 `IMS_TEST_DATABASE_URL` 环境变量指定；Docker 容器（PostgreSQL 18 + RustFS）正常运行，API 完整测试套件已验证通过。
- 根级 `test:infra`（Python unittest）需要 Python 3 + `unittest`，本轮未在本机执行。
- 已新增 Playwright 双面预览规格，但本轮未保存完整 Playwright CLI 运行结果；桌面与移动交互使用本地浏览器进行了人工验证。
- 没有执行生产部署、生产迁移或 GitHub Projects 状态更新。
