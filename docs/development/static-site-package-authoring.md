# 静态站点包编写与调试规范

> 文档类型：开发
> 状态：Active
> 权威来源：`apps/api/src/domains/delivery/site-packages/`、`apps/web/app/pages/admin/site-packages/` 和站点包测试

站点包是由后台上传、解析、审核、预览和发布的静态内容版本，不是第二套 Web 应用。它通过
主站的 `/sites/<slug>` 公共路径提供内容，并继承主站的请求来源和安全边界。

## ZIP 内容

- 上传必须是单个 ZIP，压缩包最大 25 MiB，解压后总大小最大 100 MiB，单文件最大 25 MiB，
  文件数最大 500。
- `entryPath` 必须是 ZIP 根目录中的 HTML 文件，不能包含 `/`。
- 允许 HTML、CSS、JavaScript、JSON、文本、XML、SVG、常见图片、字体和 PDF；源代码、
  可执行文件、压缩包、密钥、`.env`、package manifest、数据库和私有配置均拒绝。
- 路径必须是规范 Unicode 的相对路径，不得包含 `..`、反斜杠、控制字符、URL 编码路径、
  symlink 或特殊文件。
- manifest 由 API 解析器生成，记录每个文件的 content type、大小和 SHA-256；不要在 ZIP
  中提交伪造 manifest。

## 浏览器标签图标

入口 HTML 在 `<head>` 中用标准 `rel="icon"` 声明图标：

```html
<link rel="icon" href="./assets/site-icon.svg">
```

图标必须是同一个 ZIP 内的图片文件，支持 `.ico`、`.svg`、`.png`、`.jpg`、`.gif`、
`.webp`、`.avif` 和 `.bmp`。IMSWeb 按当前 revision 的不可变资源地址加载图标。

入口 HTML 没有声明时，解析器会按顺序查找常见文件名：根目录或 `assets/` 下的
`favicon.ico`、`favicon.svg`、`favicon.png`、`favicon.webp` 和 `favicon.gif`，其他目录中的
`favicon.*` 图片作为兼容回退。

远程 URL、缺失文件和非图片文件不会被采用；上传结果会提示无效的 icon 声明，站点正文
仍可预览。

## Runtime mode

| 模式 | 用途 | 安全边界 |
| --- | --- | --- |
| `safe` | 默认的静态内容 | 阻断活动 HTML、事件属性、危险 scheme 和活动 SVG/CSS；不执行脚本 |
| `isolated-script` | 明确需要脚本的受控内容 | 使用隔离站点路径、独立 CSP 和无主站 Cookie 的上下文；仍须通过 archive inspection |

管理员选择 `isolated-script` 不等于内容可信。脚本站点必须使用与主站不同的 Cookie 作用域，
并通过 CSP 和 frame-ancestors 限制嵌入来源。

## 上传与发布流程

1. 本地构建站点包，确认 entry HTML、资源相对路径和 runtime mode。
2. 使用后台站点包页面上传 ZIP，读取 parser warnings、文件数和总大小。
3. 在 preview URL 中验证 HTML、CSS、字体、图片、浏览器标签标题与图标、刷新、404 和缓存头；
   预览 token 只用于当前 revision，不写入 issue、截图或日志。
4. 检查管理员审阅结果后再执行 publish。发布会把 revision 指针原子切换到 ready 版本；
   旧版本仍由 revision/outbox 清理流程负责，不手工删除对象。
5. 发布后验证 `/sites/<slug>`、主站首页、登录、Cookie 边界和公开资源。回滚使用上一个
   已验证 revision，不重新上传同一 ZIP。

## 常见失败

- `entryPath` 带目录：把入口 HTML 放到 ZIP 根目录，并重新上传。
- 资源引用绝对 URL：改为包内相对路径；跨源资源必须有明确的部署和 CSP 决策。
- 被拒绝的扩展名或文件名：删除源代码、锁文件、密钥和构建临时文件。
- 发布后页面仍旧：确认 revision 状态、缓存头和当前 slug，不直接修改对象存储 key。
- 删除历史版本后对象仍在：检查 PostgreSQL `object_deletion_jobs`，由 worker 重试，不绕过
  数据库控制面直接删 bucket 前缀。
- 标签图标不生效：确认 `rel="icon"` 指向包内图片，而不是远程 URL 或已删除的文件。

公开页面外壳让 iframe 占满视口，并在左下角保留返回 IMSWeb 的入口，站点不需要为主站导航
预留顶部空间。

## 验证

```sh
pnpm --filter @imsweb/api run test:server -- site-package
pnpm --filter @imsweb/web run test:unit -- site-package
pnpm run test:web-routing
```

涉及 runtime mode、CSP、对象补偿或 revision CAS 时，必须运行完整 API server suite，并在
PR 中记录预览和发布验证结果。不要把真实站点包、用户上传或带 token 的 URL 提交到仓库。
