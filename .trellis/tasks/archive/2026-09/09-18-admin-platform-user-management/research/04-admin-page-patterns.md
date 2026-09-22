# 04 现有管理端页面范式

调研范围：`apps/web/app/pages/admin/accounts/index.tsx`（完整 418 行）、`apps/web/app/pages/admin/cards/index.tsx`、`apps/web/app/components/admin/admin-ui.tsx`、`apps/web/app/components/shared/confirm-action-dialog.tsx`、`apps/web/app/pages/admin/hooks/use-confirm-action.ts`、`apps/web/app/lib/api/endpoints/admin.ts`。

**[事实]** = 源码可读；**[推断]** = 建议。

---

## 1. 数据获取方式：alova `useRequest`

**[事实]** 页面用 alova 的 `useRequest`，不是手写 fetch/React Query。

- 引入：`import { useRequest } from "alova/client"`（`accounts/index.tsx:1`）。
- 调用：`const { data, loading, error, send: refresh, onError } = useRequest(getAdminAccounts(), { initialData: { success: true as const, accounts: [] } })`，紧接着 `onError(() => undefined)` 防止未处理错误冒泡到全局（`accounts/index.tsx:67-75`）。
- 刷新：用户点「刷新」按钮时 `await refresh()`（:113、:139）。
- endpoint 函数返回 alova 方法对象：`adminApiClient.Get(path, parsed(schema, { errorSchema, meta: withBackofficeAuth() }))`（`apps/web/app/lib/api/endpoints/admin.ts:112-121`）。
- 分页页（cards）改用 `useState + useEffect + useCallback` 手动管理，因为要跟随 URL `page` 参数：`loadCards(page)` → `.send()`（`cards/index.tsx:44-46, 52-102`）。分页状态用 `useSearchParams`，`changePage` 写回 `?page=`（:103-110）。

**[事实]** 管理端 client 是 `adminApiClient`（`apps/web/app/lib/api/admin-client.ts`），自带 401 自动 refresh + CSRF；`meta` 用 `withBackofficeAuth()` / `withBackofficeCsrf()`（`apps/web/app/lib/api/types.ts:40-46`）。

**[推断]** 平台用户列表有检索 + 分页，照抄 cards 的 URL 参数模式（`?page=&q=&field=`），不要照抄 accounts 的纯 `useRequest(initialData)`。

---

## 2. 表格列定义范式

**[事实]** 用 shadcn 表格原语 `Table/TableHeader/TableBody/TableRow/TableHead/TableCell`（`accounts/index.tsx:43-51`），列由 JSX 直接书写，没有列配置数组、没有 DataTable 抽象。

- 表头：`<TableHead>制作人名称</TableHead>` 等，操作列固定 `className="w-16 text-right"`（:181-185）。
- 行：`data.accounts.map((account) => ...)`，`key={account.id}`（:188）。
- 文本换行：`className="min-w-40 whitespace-normal"` 与 `break-all`（:191-201）。
- 状态徽章：`<Badge variant={...}>` + lucide 图标（:204-220）。
- 每行一个 `size="icon-sm"` `aria-label` 完整的危险按钮（:224-233）。

**[推断]** 平台用户表格列建议：显示名 / 邮箱 / 状态 Badge / 注册时间 / 活跃会话数 / 操作（禁用·启用、强制下线、触发重置、解绑）。危险操作与安全操作应分色，且禁用需二次确认。

---

## 3. 危险操作的确认对话框

**[事实]** 两套并存，推荐新页用后者：

1. **就地 `AlertDialog`**（accounts 页）：`<AlertDialog open={deleteTarget !== null} onOpenChange=...>` + `AlertDialogMedia/Title/Description/Footer/Action`，自己管理 `deleteTarget`/`deleting`（`accounts/index.tsx:312-372`）。
2. **通用 hook + 组件**（cards 页）：`useConfirmAction<T>({ onConfirm, getTitle, getDescription, successMessage, getFallbackFocus })`（`pages/admin/hooks/use-confirm-action.ts:24-96`）+ `<ConfirmActionDialog open status ... />`（`components/shared/confirm-action-dialog.tsx:29-67`）。hook 内部处理 in-flight 去重、焦点恢复、成功 toast、失败 `adminErrorMessage`（:72-93）。

**[事实]** 通用组件默认 `confirmLabel="确认删除"`、`variant="destructive"`（`confirm-action-dialog.tsx:35-37`），可按动作传文案。

**[推断]** 平台用户处置动作多，统一用 `useConfirmAction` + `ConfirmActionDialog` 更省代码；「解绑 OAuth」因可能被末位凭据保护拒绝，`onConfirm` 要 catch 业务码并 toast 出可区分信息。

---

## 4. 错误与 loading 处理

**[事实]** accounts 页三态：

- `error` → `<Alert variant="destructive">` + `AlertTitle` + `AlertDescription` + `AlertAction` 重试按钮（`accounts/index.tsx:143-160`）。
- `loading` → 3 个 `<Skeleton className="h-14 w-full" />`，外层 `aria-label="正在加载管理员账号"`（:161-168）。
- 空 → `<AdminEmptyState icon title description />`（:236-241）。

**[事实]** 错误文案统一 `errorMessage(error) = isApiError(error) ? error.message : "请求失败，请稍后重试"`（:60-62）；异步 action 失败 `toast.error(...)`（:99-101、:129-131）。

**[事实]** cards 页额外用 `error` 布尔 + `loading` 布尔，失败不抛（`cards/index.tsx:56-102`）。

---

## 5. 分页：没有现成组件

**[事实]** `find apps/web/app/components -iname "*pagination*"` 无结果。唯一分页 UI 在 cards 页手写：两个 `Button`（`ArrowLeftIcon`/`ArrowRightIcon`）+ `Badge` 显示「第 page 页 / 共 pageInfo.total 条记录 / 第 page / totalPages 页」，`disabled={page <= 1 || loading}` 等（`cards/index.tsx:228-240, 375-400`）。

**[事实]** 分页数据结构用共享件：`numberedPageInfoSchema`（`packages/contracts/src/common.ts:73-79`），契约组合方式 `successEnvelope({ data: ..., pageInfo: numberedPageInfoSchema })`（`packages/contracts/src/namecards.ts:62-65`）。

**[推断]** 平台用户分页直接复用 cards 的「URL 参数 + 手动 prev/next」，或把该段抽成新共享组件；**不存在**现成 `Pagination` 组件可直接 import。

---

## 6. 新增「平台用户管理」页应照抄的范式清单

**[推断]** 清单（每项附参照文件）：

1. **页面文件** `apps/web/app/pages/admin/platform-users/index.tsx`，默认导出页面组件，另导出 `meta()` 返回 `[{ title: "..." | IMSWeb" }]`（参照 `accounts/index.tsx:374-376`、`cards/index.tsx:48-50`）。
2. **权限门**：页内若只有 super_admin 可访问，照抄 `AdminAccountsPage` 的 `adminSession.adminRole !== "super_admin"` → 显示 `<Alert variant="destructive">仅最高管理员可访问`（`accounts/index.tsx:378-417`）。session 来自 `useOutletContext<{ adminSession: AdminSession }>()`（:381）。
3. **数据获取**：分页+检索用 `useSearchParams` + `useEffect/useCallback` 手管（参照 `cards/index.tsx:52-110`）；简单只读用 `useRequest(initialData)`（参照 `accounts/index.tsx:67-75`）。
4. **页头/面板/空态**：`AdminPageHeader`（eyebrow/title/description/actions）、`AdminPanel`（title/description/icon/contentClassName）、`AdminEmptyState`（icon/title/description）——全部来自 `~/components/admin/admin-ui`（`components/admin/admin-ui.tsx:57-170`）。
5. **表格**：shadcn `Table` 原语，列内 UI 直接写 JSX（参照 `accounts/index.tsx:172-243`）。
6. **危险/敏感动作确认**：`useConfirmAction` + `ConfirmActionDialog`（参照 `pages/admin/cards/index.tsx:120-200`、`hooks/use-confirm-action.ts`）。
7. **loading/error/empty**：Skeleton / destructive Alert + 重试 / AdminEmptyState 三态（参照 `accounts/index.tsx:143-241`）。
8. **toast**：`import { toast } from "sonner"`，成功用中文短语，失败用 `errorMessage(error)`（accounts）或 hook 内建 `adminErrorMessage`（cards）。
9. **endpoint 函数**：在 `apps/web/app/lib/api/endpoints/platform/admin-users.ts` 用 `adminApiClient.Get/Post/Put/Delete(path, body, parsed(schema, { errorSchema, meta: withBackofficeAuth()|withBackofficeCsrf() }))`，路径从 `@imsweb/contracts/paths` 的 `adminApiPath()` 拼（参照 `endpoints/admin.ts:112-142` 与 `endpoints/platform/admin.ts`）。
10. **导出**：在 `apps/web/app/lib/api/endpoints/index.ts` 加一行 `export * from "./platform/admin-users"`（现有：`index.ts:15` 已有 `./platform/admin`）。
11. **导航入口**：在 `apps/web/app/layouts/admin-layout.tsx` 的 `navigation` 数组加一项 `{ to: "/admin/platform/users", label, description, icon, accent, superOnly: true }`（现有项见 `admin-layout.tsx:52-170`，侧栏渲染在 :450-460 按 `superOnly` 过滤）。

**[事实]** 侧栏 `superOnly` 只在 `adminRole === 'super_admin'` 时显示；`editorOnly` 项对非 editor 隐藏（`admin-layout.tsx:450-460`）。
