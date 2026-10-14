# 06 管理端路由与页面注册

调研范围：`apps/web/app/route-metadata.ts`、`apps/web/app/routes.ts`、`apps/web/app/layouts/admin-layout.tsx`。

**[事实]** = 源码可读；**[推断]** = 建议。

---

## 1. 注册格式

**[事实]** 页面用一个 `route(path, file, layout, targets, delivery, options?)` helper 描述（`route-metadata.ts:30-47`），全部收进冻结数组 `routeDescriptors`（:49-446）。

**[事实]** admin 段落从 `route("admin/login", ..., "standalone", WEB_TARGET, "spa")`（:341-347）之后开始，随后是 `layout === "admin"` 的条目：

- 工作台索引：`route(undefined, "pages/admin/index.tsx", "admin", WEB_TARGET, "spa")`（:348）。
- 业务页用相对路径，例如 `route("accounts", "pages/admin/accounts/index.tsx", "admin", WEB_TARGET, "spa")`（:423-429）、`route("platform/oauth", ..., "admin", WEB_TARGET, "spa")`（:430-436）、`route("platform/email", ...)`（:437-443）。
- 末条是通配 `route("*", "pages/admin/not-found/index.tsx", "admin", WEB_TARGET, "spa")`（:445）。

**[事实]** `routes.ts:38-45` 把 admin 段包在一个父路由下：`{ path: "admin", file: "layouts/admin-layout.tsx", children: entriesFor("admin") }`。因此 `route-metadata.ts` 里的 `path` **不带 `admin/` 前缀**，最终 URL 由 React Router 拼接为 `/admin/<path>`。

**[事实]** 现有平台配置页的 URL 是 `/admin/platform/oauth`、`/admin/platform/email`（导航 `admin-layout.tsx:149-163`），所以命名惯例是 `platform/<capability>`。

---

## 2. 新增 `/admin/platform/users` 需要改哪几行

**[推断]** 最小改动（页面 `platform-users` 目录名按 kebab-case 建议，URL 用 `platform/users` 以对齐既有 `platform/oauth`、`platform/email`）：

1. **`apps/web/app/route-metadata.ts`**，在 `platform/email` 块（:437-443）与 `system`（:444）之间插入：

```ts
route(
  "platform/users",
  "pages/admin/platform-users/index.tsx",
  "admin",
  WEB_TARGET,
  "spa"
),
```

   若详情走独立页（而非抽屉/对话框），再插一条：

```ts
route(
  "platform/users/:userId",
  "pages/admin/platform-users/user-detail-page.tsx",
  "admin",
  WEB_TARGET,
  "spa"
),
```

2. **新建页面文件** `apps/web/app/pages/admin/platform-users/index.tsx`（React Router 7 的 file-based 路由由 `routes.ts` 消费 descriptor 生成；见 `routes.ts:14-32` 的 `routeEntry`）。文件路径必须与 descriptor 的 `file` 字段逐字一致。

3. **`apps/web/app/layouts/admin-layout.tsx`** 的 `navigation` 数组（:52-170）加一项，放在 `platform/email` 项之后：

```ts
{
  to: "/admin/platform/users",
  label: "平台用户",
  description: "C 端帐号检索与处置",
  icon: UsersRoundIcon,      // 已在该文件 import
  accent: "bg-franchise-cg",
  superOnly: true,
},
```

   `superOnly` 过滤逻辑在 `admin-layout.tsx:450-460`（仅 `super_admin` 可见）。

**[事实]** 不需要改 `routes.ts`：它按 `layout` 过滤 `routeDescriptors`（`routes.ts:33-39`），新增 admin descriptor 会自动进入 admin 父路由。

**[事实]** 不需要手工登记 SPA fallback：`spaFallbackPatternsForTarget` 检测到存在 admin 路由后，只生成一条 `/admin` 前缀模式（`route-metadata.ts:460-489`），随后跳过所有 `layout === "admin"` 的 descriptor（循环内 continue）。新增 admin 子路径自动被该前缀覆盖。

---

## 3. 页面内路由与导航工具

**[事实]** 页面内跳转用 `~/components/navigation/navigation-link` 的 `NavigationLink` / `NavigationNavLink`（`admin-layout.tsx:47-50`），不要直接用 `react-router` 的 `Link`，以保持打包客户端（Tauri）导航策略一致。

**[事实]** 编程式跳转用 `useNavigation()`（`~/lib/navigation/use-navigation`，`admin-layout.tsx:290` 的 `const navigate = useNavigation()`），而非 `useNavigate()`。

**[事实]** 查询参数用 `useSearchParams`（`cards/index.tsx:53-54`），这是分页/检索状态入 URL 的既有做法。

---

## 4. 未发现

**[事实]** 不存在 `/admin/platform-users` 或 `/admin/platform/users` 的任何 descriptor、页面文件或导航项（`grep -rn "platform-users\|platform/users" apps/web/app` 无命中）。
