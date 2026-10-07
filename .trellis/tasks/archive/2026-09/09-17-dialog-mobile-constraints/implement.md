# 移动端对话框约束完善 — 执行计划

## 结构

单任务串行，文件所有权不重叠，无需并发轨道。顺序：基元 → 单测 → 迁移 → 浏览器验证 → 收口。

## T1 基元（`app/components/ui/dialog.tsx`）

- [x] T1.1 `DialogContent` 增加 `layout?: "scroll" | "pinned"`（默认 `"scroll"`），落到 `data-layout` 上便于断言与样式钩子。
- [x] T1.2 `pinned` 分支：在 `className` 之后追加 `flex flex-col overflow-hidden` 与安全区几何（居中位移与 max-h/w 两分支共用一份），不出现第三份几何来源。
- [x] T1.3 新增并导出 `DialogBody`：`min-h-0 flex-1 overflow-y-auto overscroll-contain`，带 `data-slot="dialog-body"`。
- [x] T1.4 `DialogHeader` 与 `DialogFooter` 追加 `shrink-0`（对 `scroll` 布局无影响，pinned 下防止被压缩）。
- [x] T1.5 在 `safeArea === "inset"` 处写清所有权注释：安全区尺寸归基元，调用方不得再传 `max-h` / `w`，并点明这是 tailwind-merge 的覆盖顺序。
- [x] T1.6 额外收口：滚动能力不进公共类，由 `layout` 分支决定（`scroll` → `overflow-y-auto overscroll-contain`，`pinned` → `overflow-hidden`），不依赖 tailwind-merge 对 `overflow` 与 `overflow-y` 的冲突判定。

验证：`pnpm --filter @imsweb/web run typecheck`（通过）。

## T2 基元单测（`tests/unit/components/ui/dialog.test.tsx`，新建）

- [x] T2.1 `layout="scroll"`（默认）渲染出根节点的 `overflow-y-auto`，且不出现 `flex flex-col`。
- [x] T2.2 `layout="pinned"` 渲染出 `flex flex-col overflow-hidden`，`DialogBody` 带 `overflow-y-auto` 与 `min-h-0`。
- [x] T2.3 传入 `className="max-h-[90svh]"` 时，基元的安全区高度仍在调用方之后（R1 护栏）。
- [x] T2.4 `data-slot`/`data-layout` 属性存在，供 E2E 定位。

验证：`pnpm --filter @imsweb/web exec vitest run tests/unit/components/ui/ tests/unit/components/community/` → 5 文件 / 15 用例通过。

## T3 迁移调用方

- [x] T3.1 删除调用方 `max-h` 补丁：实际删除 11 处、10 个文件（`admin-config-dialog.tsx:52`、`producer-map/index.tsx:210`（保留其中生效的 `max-w-[calc(100%-2rem)]`）、`information-editor-dialog.tsx:90`、`homepage-link-form.tsx:64`、`producer-map-editor-dialogs.tsx:225,398`、`wiki-entity-editor-sheet.tsx:337`、`story-editor-dialog.tsx:376`、`story-source-catalog-dialog.tsx:132`、`admin/events/editor-page.tsx:1118`（保留生效的 `max-w-6xl`）、`tier-list/components/import-dialog.tsx:24`）。prd/design 里列的 `wiki-entity-editor-sheet.tsx:339` 是**内层 div** 的真实高度限制（非 `DialogContent`），按范围外的原则保留；`tier-list/components/import-dialog.tsx` 是首轮清单漏掉的一处。删除按「只改含 `<DialogContent` 的行」脚本化执行并复核 diff。
- [x] T3.2 `namecard-claim-dialog.tsx`：`layout="pinned"` + `<form className="flex min-h-0 flex-1 flex-col space-y-5">` 作为 flex 链 + `DialogBody` 包住字段 + `DialogFooter` 留在表单内。
- [x] T3.3 `namecard-upload-dialog.tsx`：`layout="pinned" className="gap-0 p-0"`，各区自带内边距（页眉 `p-4`、内容区 `px-4 py-5`），页脚 `m-0 rounded-none` 抵消为 `p-4` 根节点设计的负边距。
- [x] T3.4 不动 admin 那批手写 `grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden` 固定页脚的对话框：它们的 grid 布局原样保留，只移除了其中已经失效的 `max-h` 文本。
- [x] T3.5 额外收口（R6）：关闭按钮 `max-sm:size-11`（手机上 44×44，桌面仍是 `icon-sm`），偶像候选行 `min-h-10` → `min-h-11`。

验证：`pnpm --filter @imsweb/web run lint`、`run typecheck`、`exec vitest run` → 209 文件 / 1360 用例通过。

## T4 浏览器验证（`tests/e2e/namecard-claim-workflow.spec.ts`）

复用该 spec 已有的 fixture 注册（`mockPlatformSession` + `/api/wiki/catalog` + `/api/community/exchange/me/cards` + `/api/cards` + `/api/reactions`，抽成 `mockClaimSurface`），并用 `openClaimDialog` + `settleDialog` 统一「打开并等动画结束」。

- [x] T4.1 `@mobile` 用例（375×667）：`DialogContent` 完整落在 `window.visualViewport` 内；「提交认领审核」未滚动即可见；`document.scrollingElement.scrollTop` 为 0；关闭按钮与每个候选行 ≥44×44。
- [x] T4.2 320×568 用例：`DialogBody.scrollHeight > clientHeight`，把 body 滚到底后 `DialogFooter` 与关闭按钮的 boundingBox 不动（±1px），页面 `scrollTop` 仍为 0。
- [x] T4.3 触控目标断言包含在 T4.1 内。
- [x] T4.4 记录测试写法上的必要让步：弹窗开场有 100ms zoom，`toBeVisible()` 后立刻量会把 44px 量成 43.45px，因此 `openClaimDialog` 先等 `getAnimations({subtree:true})` 的有限动画结束（`Promise.allSettled`）再取几何。fixture 足以驱动到认领对话框，无需替代路径。

验证：`CI=1 pnpm --filter @imsweb/web exec playwright test tests/e2e/namecard-claim-workflow.spec.ts --workers=1 --retries=0` → 8 通过（4 条既有 + 2 条新用例 × chromium-desktop/chromium-mobile）。

## T5 收口

- [x] T5.1 `pnpm run check:root` + `pnpm --filter @imsweb/web run check`（lint / typecheck / 209 文件 / 1360 用例 / 生产构建）全部通过（exit 0）。
- [x] T5.2 `CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0`（chromium-desktop / chromium-mobile / firefox-desktop）→ 113 通过 / 11 跳过 / 0 失败（4.5m），其中含本任务的两条 `@mobile` 用例。
- [x] T5.3 明确记录未验证项：真机 iOS 软键盘下的 `dvh` 收缩无法自动化；名片上传对话框只验证了迁移结构与既有 spec 不回归，未单独写 pinned 几何断言。这两条不得以单测或构建成功替代。
- [x] T5.4 `components-and-ux.md` 补「Mobile dialog sizing and scrolling」场景（7 段式：契约、错误矩阵、好坏例、测试要求、正误对照），含 pinned 契约与调用方禁令。

## 回滚点

- R-A：T1/T2 单独成立（基元新增分支不进默认路径），回滚 = 还原 `dialog.tsx` 与删除其单测。
- R-B：T3.1 的 `max-h` 删除单独成立（死代码清理，渲染结果不变）。
- R-C：T3.2/T3.3 的 pinned 迁移单独成立，回滚 = 两个对话框去掉 `layout="pinned"` 与 `DialogBody`。

## 环境前置

Node ≥ 22.13.0、pnpm 11、`pnpm install --frozen-lockfile`。Playwright 会自行起 `pnpm dev`（端口 4173）。
E2E 必须按 CI 口径跑（`CI=1`、`--workers=1`、`--retries=0`），本机默认并发下的偶发失败不作为回归结论。
