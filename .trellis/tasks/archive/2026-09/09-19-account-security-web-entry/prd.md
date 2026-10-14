# 网页端帐号安全入口

## Goal

Web 端已登录用户能从站头账号菜单进入「帐号安全」页。

现状是**页面活着但没有入口**：`/account/security` 在 Web 上可访问、被 prerender、预览站返回 200，
四个分区（密码、邮箱凭据、登录设备、第三方帐号）在 web 目标下全部渲染，但全站没有任何链接指向它。
它唯一的入口长在 `/account/me` 里，而那个页面被声明为 app-only。

用户价值：Web 用户能自行修改密码、补绑/换绑邮箱与第三方帐号、查看并下线自己的登录设备——
这些能力今天在 Web 上已实现，却点不到。

## Background

### 两个页面的 delivery 差异（实测确认）

`route(path, file, layout, targets, delivery, options)`（`route-metadata.ts:13-32`）：

| 页面 | targets | delivery | 预览站 |
| --- | --- | --- | --- |
| `account/security`（`:141-151`） | `SHARED_TARGETS`（web+app） | `prerender` | **HTTP 200** |
| `account/me`（`:307-313`） | `APP_TARGET`（仅 app） | `none` | **HTTP 404** |

`/account/me/cards` 同样 404；`/account/login`、`/account/register`、`/account/security` 均 200。
差异完全由 targets 与 prerender 决定，不是服务端回退故障。

### 唯一入口的位置

- `account-me-page.tsx:314` — 「帐号安全」入口，位于**已登录分支内**（`if (!signedIn)` 在 `:154`，
  最终 `return (` 在 `:218`）。代码本身正确。
- `app-tab-model.ts:135` — app 的 tab 模型中指向 `/account/security`。

两条都在 app 侧，Web 侧一条也没有。

### Web 侧通向 account 的全部链接

扫遍 `apps/web/app` 生产代码，只有三处，且全是未登录访客用的：

- `platform-account-menu.tsx:91` `/account/login`
- `platform-account-menu.tsx:102` `/account/register`
- `community-office-page.tsx:605` `/account/login`

**已登录账号菜单（`platform-account-menu.tsx`）只有两个动作**：`:167` 的
`to="/community/exchange/me"`（我的名片）与 `:185` 的退出登录。这就是 Web 用户全部的账号界面。

该菜单由 `site-header.tsx:251` 渲染，桌面与移动 Web 共用同一处，不需要第二个入口。

### 可复用的 i18n（无需新增键）

| 键 | zh-CN | en |
| --- | --- | --- |
| `platformAccount.security.title` | 帐号安全 | Account security |
| `platformAccount.security.entryDescription` | 密码、登录设备与第三方绑定 | Password, devices, and linked providers |

与 `/account/me` 中该入口使用的键完全一致，图标同理复用 `ShieldCheckIcon`。

### 安全页在 web 下自足

`account-security-page.tsx` 自带 `h1` 标题与 loading / error / anonymous 分支，不依赖从
`/account/me` 进入。四个分区在 web 与 app 都渲染，只有 `oauth-link-section.tsx:347` 一处按
`IS_APP_TARGET` 分流授权方式——那是应有的（app 走深链回跳，web 走整页导航）。

### 为什么这次改动可以做小

`/account/security` 已经是 `SHARED_TARGETS` + `prerender`，所以**入口是纯增量的 UI 改动**：
不碰路由 targets、不碰 prerender 清单、不碰 wire-contract inventory、不碰契约包。

## Requirements

- WR1 Web 已登录账号菜单提供「帐号安全」入口，指向 `/account/security`
- WR2 入口文案与图标与 `/account/me` 中的同名入口一致；复用既有 i18n 键，不新增键
- WR3 入口只在已登录分支渲染；未登录分支的登录 / 注册入口保持原样
- WR4 app 构建的可达性不回归（`/account/me` 入口与 app tab 模型均不动）
- WR5 不改动路由 targets、prerender 清单、契约包与 wire-contract inventory
- WR6 入口位置符合 Web 账号菜单既有视觉范式（与「我的名片」同一组 `buttonVariants` 按钮形态）

## Acceptance Criteria

- [x] AC1 Web 构建下，已登录用户可从站头账号菜单点击进入 `/account/security`
- [x] AC2 入口文案为「帐号安全」/「Account security」，与 `/account/me` 中该入口一致
- [x] AC3 未登录时不渲染该入口
- [x] AC4 app target 的可达性无回归
- [x] AC5 `git diff` 中不出现 `route-metadata.ts`、`packages/contracts`、
      `scripts/contracts/current-wire-contract-inventory.json` 的改动
- [x] AC6 新增入口有单元测试覆盖，且既有 `platform-account-menu` 测试不回归

## Out of Scope

- 把 `/account/me` 开放给 Web（改 targets + 加 prerender）。它会让 Web 拥有完整账号中心，
  但需要同时重做 Web 的账号信息架构，且改动面含 `routes.test.ts` 硬编码计数、前端路由元数据契约
  期望与 wire-contract inventory。属独立的产品决策，本次不做。
- Web 账号菜单的信息架构重做（例如加入个人资料、我的名片等更多入口）
- 安全页自身的功能、分区与文案调整
- app 侧入口（已存在，不动）

## Open Questions

无。

## Notes

- 本任务为轻量任务，PRD-only。
- 关键前提是 `/account/security` 的 delivery 已经是 `prerender` 且 targets 已含 `web`；
  若将来有人把它改回 app-only，本入口会指向一个 404——验收 AC1 就是这条前提的门禁。
