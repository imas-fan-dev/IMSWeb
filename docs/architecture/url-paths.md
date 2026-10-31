# URL 与公共路径架构

> 文档类型：架构
> 状态：Active
> 权威来源：`packages/contracts/src/paths.ts`、API route registrars 和 `apps/web/app/lib/api/endpoints/`

共享 URL 前缀必须只有一个定义。API 路由注册、middleware 路径分类、cookie scope、公共资源
响应和 Web endpoint 都从 `@imsweb/contracts/paths` 导入常量或 builder；调用方只保留业务
后缀和动态参数。

## 路径层级

| 层级 | 典型 builder | 责任 |
| --- | --- | --- |
| API | `apiPath`、`adminApiPath`、`platformApiPath` | Hono route 和 Web API endpoint |
| 身份 | `platformAuthPath`、`platformAuthOAuthPath`、`adminPlatformAuthOAuthPath` | session、OAuth 和 refresh |
| 社区 | `communityApiPath`、`exchangePath`、`adminExchangePath` | Fudaba exchange 和后台审核 |
| 内容 | `wikiPath`、`adminWikiPath`、`eventChroniclePath` | Wiki、编年史和内容 route |
| 交付 | `publicUploadsPath`、`publicAssetsPath`、`siteContentPath`、`sitesPath` | 媒体、静态内容和站点包 |
| 静态资源 | `mapsPath`、`imagePath`、`iconPath`、`cssPath` | 地图和公共交付前缀 |
| App 深链 | `APP_OAUTH_CALLBACK_URL` | Tauri 外壳的 OAuth 回跳入口，非 HTTP |

路径 builder 负责前缀和斜杠归一化。例如：

```ts
apiPath(`/site-packages/${encodeURIComponent(slug)}`)
sitesPath(`/${encodeURIComponent(slug)}`)
```

不要在业务代码中重新拼接 `/api`、`/uploads`、`/site-content`、`/sites` 或其他共享前缀。
测试 fixture 为了断言公开 URL 可以保留 literal，但生产源码必须通过 source-rules。

### App 深链

`APP_OAUTH_CALLBACK_URL`（`imsweb://oauth/callback`）是这张表里唯一的非 HTTP 常量，也是 App
外壳接收 OAuth 回跳的入口。流程是：provider 回调到既有的 HTTPS `redirect_uri`，API 在自己的
回调里判定发起方是 App 之后，再 303 到这个 scheme。provider 因此永远看不到它，也就仍然只需
要配置一个 HTTPS `redirect_uri`。

这个常量必须只有一处定义。Tauri 注册（`apps/web/src-tauri/tauri.conf.json` 的 deep-link 插件）、
capability 授权和 Web 端的深链匹配器都对齐它，匹配时逐段比较 scheme、host 和 path；不要在任
一侧只内联其中一段。

## 路由所有权

- `apps/api/src/app.ts` 只组合 domain registrar；具体 prefix 由 capability routes 使用 builder。
- `apps/api/src/routing/frontend-route-policy.ts` 使用同一套 delivery builders 判断 Hono、静态
  文件和 SPA fallback 的所有权。
- `apps/web/app/routes.ts` 负责页面 URL；`app/lib/api/endpoints/` 负责 API URL，二者不要互相
  复制请求逻辑。
- App 深链的 scheme、host 和 path 同属共享定义；改动时同步 Tauri 注册、capability 与 Web
  匹配器，并确认这个非 HTTP 常量不会被误当作 route 前缀。
- cookie path、public delivery 和 middleware sensitive-path 判断都属于共享路径变更的影响面。

## 变更流程

1. 在 `packages/contracts/src/paths.ts` 增加或修改 prefix/builder。
2. 更新 contracts package build、API route、Web endpoint、middleware 和 path contract tests。
3. 搜索旧 literal，确认只剩测试、外部协议或文档示例中的有意断言。
4. 运行 `pnpm run check:rules`、API/Web typecheck、API server suite、Web unit 和
   `pnpm run test:web-routing`。
5. 若 public URL 真的改变，必须在迁移/发布文档中写 redirect、缓存、cookie 和回滚影响；
   仅仅把旧 literal 换成 builder 不改变公开 URL。
