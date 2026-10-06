# 社区后台列表与弹窗研究记录

## 权威来源

- `apps/web/.rules`：组件归属、API facade、现有框架和可视化验证要求。
- `apps/web/DESIGN.md`：后台紧凑、中性、可扫描；表格比较信息；Dialog 用于编辑；不在列表行使用玻璃效果。
- `.trellis/spec/web/frontend/components-and-ux.md`：pinned Dialog 的 flex 链、唯一正文滚动区域、窄屏触摸目标和原语安全区尺寸。
- `.trellis/spec/web/frontend/api-state-and-contracts.md`：接口归属、类型、Cookie 与 CSRF。
- `.trellis/spec/web/frontend/testing.md`：语义断言、typed HTTP fixture、可访问性与桌面/窄屏覆盖。
- `.trellis/spec/api/backend/community-content.md`：空默认、权限、CAS、图片归属和草稿保留。

Web .rules 的根 `DESIGN.md` 引用当前不存在；Web 设计文档与 spec 索引均明确指向 `apps/web/DESIGN.md`，本次以实际存在的 Web 文档及主题实现为依据。该引用问题不扩大到本次样式任务。

## 当前实现

| 源码 | 已核实事实 |
| --- | --- |
| `apps/web/app/pages/admin/community/index.tsx:31` | 页面持有 draft、revision、busy、conflict、dirty、loaded |
| 同文件 `:98` | 保存校验整个 draft，并调用原有版本更新接口 |
| 同文件 `:133` | 上传成功按捕获的列表下标修改页面内容；新增弹窗后必须改为编辑会话归属 |
| 同文件 `:182`、`:244` | 保存/重读在页头下方；新增在表单列表底部直接追加 |
| `apps/web/app/pages/admin/community/components/community-entry-editor.tsx:30` | 每项完整展开；native select 自定义高度为 h-11，字段间距与公共后台表单不同 |
| `apps/web/app/components/admin/admin-ui.tsx:21` | 共享控件高度 h-10，并提供 AdminField、AdminPageHeader、AdminPanel、AdminEmptyState |
| `apps/web/app/components/ui/dialog.tsx` | 已提供 pinned 布局、DialogBody、安全区和 NativeTabBarSuppression |
| `apps/web/app/components/ui/table.tsx` | 已提供语义表格、边线、hover 和滚动容器 |
| `packages/contracts/src/community-content.ts:23` | 单项 schema 已导出；Web facade 当前仅显式导出 draft schema |
| `apps/web/app/lib/api/endpoints/community-content.ts:45` | 更新与上传继续使用统一鉴权/CSRF 元数据 |

## 参考页面

1. `apps/web/app/pages/admin/stories/components/story-table.tsx`：图标/图片与名称主次层级，次要列按断点隐藏，并将内容合并到主列；行内用紧凑编辑和删除按钮。
2. `apps/web/app/pages/admin/information/components/information-editor-dialog.tsx`：Dialog 标题、说明、字段分组、图片预览及底部操作；结构参考须结合现有 pinned 规范，不直接复制旧滚动实现。
3. `apps/web/app/pages/admin/platform-users/index.tsx`、`user-detail-dialog.tsx`：共享面板、表格及具名弹窗的模式参考。

## 保留的业务行为

- 保存对象是整页配置，数组顺序即入口顺序。不存在单项 CRUD HTTP 端点。
- 缺失配置和明确保存的空列表都不注入旧入口；公共页完全读取服务器内容。
- op/editor 可管理；Cookie 写入使用既有 CSRF。
- 读取失败不得当作空配置覆盖；409 保留内容并禁止继续覆盖。
- 成功上传素材不随取消编辑或清除引用删除，避免破坏未保存和并行编辑。
- 原入口 ID 字段可编辑。新编辑会话使用原 ID 找目标，确认后才替换候选 ID，必须检查唯一性并恢复焦点。

## 现有回归

`apps/web/tests/unit/pages/admin/community/admin-community-page.test.tsx` 已覆盖读取失败重试、添加编辑排序隐藏删除、上传成功/失败/清除、重新读取失败、保存失败重试和 409。新方案更新操作入口，保留这些行为断言。

`apps/web/tests/e2e/community-content-management.spec.ts` 覆盖 op/editor、桌面和 320px 手机宽度、图片、保存回读、删除为空及可访问性。集中补充弹窗生命周期、焦点和正文滚动，不改为跳过原保护的测试。

## 本次原型

`design-preview.html` 是任务内可交互设计样例。`preview-assets.js` 读取当前公共 Preview 配置作为 5 行示例，图标由本地现有 Lucide React 组件输出静态 SVG。没有引入新的依赖或应用入口。

原型在桌面与 320×568 上核对新增、编辑、取消、确认、重新读取和菜单排序；它不模拟真实上传、权限、CSRF、409 或原生 App。截图和检查输出留在 `/tmp`，产品验收须按 implement.md 重新执行。

## 共享工作区保护

设计基线为 `2e546377ff3bf132828f387c75d893080b82a752`。任务前已有名片交换设计文件的暂存与未暂存修改，以及三个 API 构建脚本删除。规划只新增本任务目录；实现与验证不得恢复或提交这些无关内容。

## 实施时核实

源码基线不存在共享 DropdownMenu。主会话批准在社区列表内直接使用已有 `@base-ui/react/menu`，没有扩展共享 UI。隔离检出缺少 `.trellis/scripts/get_context.py`，已直接读取全部 curated context；生命周期由主会话负责。
