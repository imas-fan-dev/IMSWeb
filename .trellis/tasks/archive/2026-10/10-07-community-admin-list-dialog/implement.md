# 制作人社区后台样式实施计划

## 进入实施的条件

- [x] 用户评审并批准本次 [设计](design.md)。
- [x] 需求与设计无未解决的范围或保存语义问题。
- [x] 上下文清单中每条 spec/research 引用有效。
- [x] 完成工作区和本地环境预检后再运行 `task.py start`。

用户以“开始实施”批准最新方案。Node、pnpm、依赖和本地容器检查通过；dev:doctor 仅报告已有 Valkey 占用 6379，验证需使用现有测试启动器或其他本地端口。受保护路径哈希与暂存 patch 已记录在 /tmp。

## 1. 建立实现基线

- [x] 按 `docs/development/ai-environment.md` 准备工作区；若需要隔离验证，使用仓库的 worktree helper。
- [x] 记录主工作区 staged/unstaged 文件与哈希，保护名片交换设计任务及既有三个 API 构建脚本删除。
- [x] 读取 `trellis-before-dev`、Web .rules、设计规范，以及本任务实现上下文。
- [x] 读完原社区管理 unit/E2E，明确现有错误、冲突、图片及清空列表回归。

## 2. 单项模型与编辑会话

- [x] 新增页面私有 `community-model.ts`，复用合同类型和已有单项 schema；只放 UI 纯逻辑。
- [x] 在 Web endpoint facade 具名导出 `communityContentEntrySchema`，不改变请求、响应或 contracts。
- [x] 实现原 ID 定位、候选副本、重复 ID 错误和无更改确认；页面基线独立于当前编辑会话。
- [x] 将上传绑定到会话 token 与上传序号，处理卸载、过期响应、失败及 finally。

回退点：本段完成后，原页面业务仍可通过现有接口运行；不能引入新保存协议。

## 3. 入口编辑 Dialog

- [x] 实现 `community-entry-editor-dialog.tsx`，迁移原有全部字段、图标、图片能力。
- [x] 使用 `DialogContent layout="pinned"` 和完整 flex 链，确保只滚动 DialogBody。
- [x] 桌面两栏、窄屏单列；复用现有表单控件，统一高度、标签、提示和错误反馈。
- [x] 关闭、取消、Escape、遮罩语义一致；上传处理中禁止误关闭和重复确认。
- [x] 确认只更新页面候选，取消不改列表；关闭后恢复可见焦点。

## 4. 列表与页面整合

- [x] 实现 `community-entry-list.tsx`：桌面表格、窄屏合并元数据及更多操作菜单。
- [x] 保留上移下移边界、删除确认、隐藏项管理、空态与 100 项限制。
- [x] 页头整合保存/重新读取，基础设置与入口分别使用 AdminPanel。
- [x] 保存失败、读取失败、409、重新读取丢弃确认保持原有保护。
- [x] 移除旧的展开式 `community-entry-editor.tsx`，不保留第二套字段实现。

## 5. 验证

先运行有意义的集中回归：

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/pages/admin/community/admin-community-page.test.tsx tests/unit/pages/community/community-page.test.tsx tests/unit/lib/api/endpoints/community-content.test.ts
pnpm --filter @imsweb/web run test:e2e tests/e2e/community-content-management.spec.ts
```

- [x] unit 保留已有读取/保存/409/上传/清空场景，增加取消新增、取消编辑、无更改、单目标更新和过期上传。
- [x] 用组件测试证明未确认编辑不发配置更新请求；只有页头保存才提交整页与 revision。
- [x] Playwright 覆盖 op/editor、列表排序、弹窗字段、清除图片、保存回读、删除为空及 Axe。
- [x] 320×568 下实际滚动到图片区及底部，检查只滚动弹窗正文、关闭按钮与确认按钮可触达、焦点返回。
- [x] 保留桌面列表、桌面弹窗、窄屏列表、窄屏弹窗截图在仓库外，不把浏览器生成物提交。

之后执行 Web 与根规则门禁：

```sh
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run check
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

若新增独立模型/组件测试文件，将它们加入集中回归命令。路由和 fallback 不在计划改动内；只有范围变化或相关失败才扩大到 `test:web-routing`。不重复已经通过且没有新变化的检查。

## 6. 完成与交付

- [x] 按 AC1–AC7 写验收与验证证据，区分原型验证和正式产品验证。
- [x] 独立检查保存语义、上传归属、ID 变更后的焦点及窄屏菜单。
- [x] 更新社区跨层 spec 的后台编辑流程，保持权威来源与相对链接有效。
- [x] 限定提交本任务文件，保护主工作区其他暂存及删除内容。
- [x] 完成 Trellis 收尾和归档。本任务不自动推送、部署或修改 Preview 数据。

## 回退边界

回退本任务前端文件及测试即可恢复旧编辑界面。接口和已有服务器配置不需要回退或迁移。发生共享组件或后端范围变化时，应先返回设计评审。

## 实施交付状态

正式产品证据见 [acceptance.md](acceptance.md) 和 [verification.md](verification.md)。隔离环境内的实施和独立复核已完成，主会话已核对源码与截图、更新社区配置规范并完成工作提交和任务归档。本任务不推送或部署。
