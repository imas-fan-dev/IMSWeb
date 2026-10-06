# 验证记录

## 最终源码验证

主工作区保留任务开始前的三个构建脚本删除：

- `apps/api/scripts/build/build-server.js`
- `apps/api/scripts/build/build-client.js`
- `apps/api/scripts/build/check-client.js`

完整门禁在 `.worktrees/community-validation` 的隔离副本执行。副本保留这三个 HEAD 脚本，其余本任务源码、测试与 wire inventory 按主工作区逐文件同步。没有向主工作区恢复脚本。临时同步清单包含路径和 SHA-256；提交候选逐文件与已验证副本核对。

最终 API 修复后运行的门禁：

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @imsweb/contracts run build` | 通过 |
| `pnpm --filter @imsweb/api run test` | 71 文件；887 通过、1 跳过；owner 包含 build、syntax/typecheck、architecture |
| `pnpm --filter @imsweb/web run format` | 通过；核对没有引入无关格式差异 |
| `pnpm --filter @imsweb/web run check` | lint、typecheck、build；225 unit 文件、1579 测试通过 |
| `pnpm run check:rules` | agent/source rules、31 contracts entrypoints、non-JSON 边界、inventory freshness、25 份 docs 检查通过 |
| `pnpm run check:boundaries` | 通过 |
| `pnpm run test:web-routing` | 2 文件、10 测试通过；客户端打包/资产与 Hono route ownership |

浏览器 spec 增加顶层 describe，并加强公共页重试成功的 unit 断言后，主工作区再次运行四份 community endpoint/public/admin unit：17 测试通过。此后没有产品源码改动。

独立 `trellis-check` 修复持久化未知字段/损坏数据处理和缺少原子存储能力时的保存行为。API focused 9 测试、Web focused 32 测试、root contracts 29 测试通过；最终完整 API 套件已包含新增回归。

临时完整门禁汇总 `/tmp/community-final-gates-results.json`；单项日志 `/tmp/community-final-*.log`。记录的执行 cwd 为隔离验证树，所有退出码为 0。首次隔离 API 执行因 contracts 未重建而失败；重建后通过，该首次失败未当作成功证据。

## 浏览器与截图

Web 交付完成了 9 个相关浏览器案例，覆盖管理页/可访问性、交换、App 导航和首页 smoke。主测试为 `apps/web/tests/e2e/community-content-management.spec.ts`，四个项目组合为 op/editor × desktop/mobile，手机为 320×568。验证标题/简介、添加编辑、排序/隐藏/范围、图片上传与 40×40 展示、保存重新读取、清除图标、删除为空及 Axe。

8 张截图位于 Playwright 临时输出目录，未加入 Git。父会话读取核对了 desktop 公共页和 mobile editor 管理页。

- `community-content-manageme-a5e80-at-desktop-and-phone-widths-chromium-desktop/community-public-op.png`
- `community-content-manageme-2d38b-at-desktop-and-phone-widths-chromium-mobile/community-editor-editor.png`

浏览器使用 contracts 驱动的 HTTP fixture。API 测试使用实际 Sharp/Busboy 解析上传，覆盖配送和原子存储接口；这些证据不代表生产对象存储或实机原生安装。

## 提交与收尾核对

只提交本任务文件及其必要共享注册/导航/测试/inventory/spec。使用独立 Git index 保留已有名片交换 staged 文件；不提交三个已删除的构建脚本、密钥、数据或运行截图。工作提交后按 Trellis 流程归档当前任务并记录会话，保留其他两个活动任务。
