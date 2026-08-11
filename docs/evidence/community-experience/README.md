# 社区与体验交付证据

记录日期：2026-08-11

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
- Web Vitest 完整运行两次：两次均为 69 个测试文件、227 个测试通过。
- API source、server tests 和 Wiki tests TypeScript 检查：通过。
- API handler/model 回归：17/17 通过。
- Wiki 合约回归：57/57 通过。
- FilesystemObjectStorage 发布行为回归：1/1 通过。
- PostgreSQL 迁移静态/runner 回归：3/3 通过。
- Web production build 与 Classic Wiki CSS cascade 检查：通过。
- API server build、Hono architecture、Web client packaging 与 asset scan：通过。
- `git diff --check`：通过。

## 环境限制

- 本机 `127.0.0.1:5432` 没有运行 PostgreSQL，Docker daemon 也未启动，因此依赖真实 PostgreSQL 的完整 API server 测试无法在本轮本地验证；此前完整运行结果为 113/156 通过，其余 43 项均因连接被拒绝失败。
- Windows 环境没有 `sh`，因此根级 `pnpm run check` 和 `pnpm run test` 均在 `check:root` 的 `sh -n scripts/migration/activate-node-release.sh` 停止；停止前规则、工作区边界和设计规范检查通过。其余 Web/API 检查与构建已使用对应的直接命令完成。
- 已新增 Playwright 双面预览规格，但本轮没有保存一份完整 Playwright CLI 运行结果；桌面与移动交互使用本地浏览器进行了人工验证。
- 没有执行生产部署、生产迁移或 GitHub Projects 状态更新。
