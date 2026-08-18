# @imsweb/contracts

跨端线格式契约的唯一事实源：zod schema 定义 API↔Web 传输面，静态类型由
`z.infer` 派生，两端通过 `workspace:*` 消费同一个运行时对象。

## 布局约定（flat-first）

与 `apps/api/src/domains` 的原则一致：**单文件业务保持平铺，多文件的大业务
升级为文件夹**。

```text
src/
  z.ts                   # zod 封装子路径：消费端唯一的 z 来源
  index.ts               # 根导出：按业务命名空间聚合（非扁平 re-export）
  wiki.ts                # 单文件域：平铺（含偶像媒体目录管理）
  namecards.ts           # 名片公开/投稿/管理员队列
  admin.ts               # 后台会话与管理员账号
  about.ts / producer-map.ts / homepage-links.ts / site-packages.ts
  information.ts / news.ts / chronicle.ts / events.ts / live.ts
  platform/              # 多文件大业务：文件夹分级
    index.ts             # 会话/资料/OAuth 发现/注册验证
    admin.ts             # 超管 OAuth 提供方配置
  fudaba/
    index.ts             # 交换站核心（原子 + 公开/业主线契约）
    card-claims.ts       # 认领信封/认领/审核
    location-review.ts   # 位置审核
```

多源汇聚域（如 `information`、`news`、`chronicle` 同时承接公开与管理员
线契约）按 “公开在前、管理在后” 排列；管理员 schema 以 `admin` 前缀
区分（`adminRecommendationSchema` vs `recommendationSchema`）。

- 子路径与目录一一对应：`@imsweb/contracts/fudaba`、
  `@imsweb/contracts/fudaba/card-claims`、`@imsweb/contracts/fudaba/location-review`。
- 当平铺域获得第二个文件时，提升为文件夹（`platform.ts` →
  `platform/index.ts` + `platform/admin.ts`），并在 `package.json` 的
  `exports` 中补充对应子路径。
- 跨模块共享的原子 schema 只从其所属核心模块导出（如 `fudaba/index.ts`），
  兄弟模块内部原子不导出，避免 Web 端 barrel 星导出撞名。

## zod 封装（`@imsweb/contracts/z`）

zod 依赖由本包单点声明与封装；apps 不得直接依赖 zod，统一
`import { z } from "@imsweb/contracts/z"`，版本升级只在本包进行。

## 根导出（`@imsweb/contracts`）

根 `index.ts` 不做扁平 re-export（跨域原子名必撞），而是按业务聚合
命名空间，供工具链与符合性测试一站式引用：

```ts
import { fudaba, fudabaCardClaims } from "@imsweb/contracts"
fudaba.fudabaOwnerCardListSchema.parse(body)
```

- 命名规则：命名空间 = 子路径的 camelCase（`fudaba/card-claims` ↔
  `fudabaCardClaims`）；新增模块时两处同步。
- 业务代码（Web endpoints、API response）仍用子路径导入，保持按需
  加载与明确依赖面；根导出不是业务消费路径。

## 公共响应结构（`@imsweb/contracts/common`）

跨域公共部分统一抽离到 `common.ts`：`successFlagSchema` / `successEnvelope`
组合成功信封，`cursorPageInfoSchema` / `snapshotPageInfoSchema` /
`numberedPageInfoSchema` 组合三类分页页信息。业务模块通过组合（extend /
引用 / 链式 `superRefine`）复用，不在各域内联重复定义。

## 类型放置

线类型（`z.infer` 别名及其索引派生，如 `AdminSession`、`IdolMediaAgency`）与
schema 同文件放置，包是类型与运行时校验的同一事实源；Web 端仅保留
UI 语义别名（如 `HomeInformationCard = InformationCard`）、请求/输入类型与
`File`/`FormData` 形状。

## 消费规则

- **Web**：endpoints 模块 `import` 所需 schema 并 `export *` 再导出；请求侧
  输入校验（含 `File` 上传）与本地类型别名留在 Web。
- **API**：response 序列化以 `import type` 引用派生类型（生产运行时不加载
  zod）；运行时执法在测试中完成——`tests/wiki/wire-contract-conformance.test.ts`
  与各 HTTP 路由测试响应读取点的内联 `schema.parse`。
- 新增/修改契约必须同时通过双端 typecheck 与上述符合性测试；
  `scripts/check-workspace-boundaries.mjs` 限制本包依赖仅为 zod。

## 构建

CJS + d.ts，`build-if-sources.mjs` 守卫 `prepare`（Docker manifest 层安装时
源码缺失则跳过）。`pnpm --filter @imsweb/contracts run build`。
