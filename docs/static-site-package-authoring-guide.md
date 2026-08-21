# 静态站点包编写与调试规范

IMSWeb 站点包用于发布独立的静态页面。管理员上传 ZIP 后，服务端会校验文件路径、类型、大小和
活动内容，再把每次上传保存为不可变 revision。公开入口固定为 `/sites/:slug`。

## 目录结构

入口 HTML 必须位于 ZIP 根目录，上传时通过 `entryPath` 指定。资源可以放在子目录中：

```text
site-package.zip
├── index.html
└── assets/
    ├── site.css
    ├── site.js
    ├── site-icon.svg
    └── hero.webp
```

HTML、CSS 和 JavaScript 应使用相对路径引用包内资源：

```html
<link rel="stylesheet" href="./assets/site.css">
<script src="./assets/site.js"></script>
<img src="./assets/hero.webp" alt="">
```

不要引用 ZIP 外的本地路径。远程资源会受站点包 CSP 限制，不应作为页面运行所需资源。

## 浏览器标签图标

在入口 HTML 的 `<head>` 中使用标准 `rel="icon"` 声明：

```html
<link rel="icon" href="./assets/site-icon.svg">
```

图标必须是同一个 ZIP 中的图片文件。支持的扩展名包括 `.ico`、`.svg`、`.png`、`.jpg`、
`.gif`、`.webp`、`.avif` 和 `.bmp`。查询参数可以用于原站点的资源版本标识，IMSWeb 会按当前
revision 的不可变资源地址加载图标。

如果入口 HTML 没有声明图标，IMSWeb 会按顺序查找常见文件名，例如根目录或 `assets/` 下的
`favicon.ico`、`favicon.svg`、`favicon.png`、`favicon.webp` 和 `favicon.gif`。其他目录中名为
`favicon.*` 的图片也可以作为兼容回退。

远程 URL、缺失文件和非图片文件不会被用作浏览器图标。上传结果会提示无效的 icon 声明，站点
正文仍可继续预览。

## 运行模式

`safe` 适用于不含 JavaScript、事件处理器、活动 SVG 或可执行 CSS 的页面。`isolated-script`
允许站点包运行脚本，但 iframe 不包含 `allow-same-origin`，因此脚本不能读取 IMSWeb Cookie、
Local Storage 或父页面 DOM。

两种模式都禁止表单提交、外部网络连接、嵌套 frame 和 object。需要的数据和媒体应直接放入 ZIP。

## 上传与发布

1. 在管理后台创建页面包，填写稳定的 slug、标题和入口文件。
2. 上传 ZIP 并检查服务端警告。
3. 使用预览确认资源、交互、浏览器标签标题和图标。
4. 发布已确认的 revision。
5. 更新站点时上传新 revision，预览后再发布。旧 revision 可以用于回滚。

公开页面外壳会让 iframe 占满视口，并在左下角保留返回 IMSWeb 的入口。站点可以保留自己的
header，不需要为主站返回入口预留顶部空间。

## 本地检查

上传前至少检查以下内容：

- 解压后入口 HTML 位于 ZIP 根目录。
- 所有相对资源都存在，路径大小写完全一致。
- 浏览器图标指向包内图片。
- 页面在目标桌面和手机视口中没有横向滚动或控件遮挡。
- `safe` 包不包含脚本或活动内容。
- ZIP 不包含源码、锁文件、密钥、数据库、嵌套压缩包或符号链接。
