# OpenMap S3 发布规范

> 文档类型：运维
> 状态：Active
> 权威来源：`apps/api/scripts/operations/publish-openmap.js`、`scripts/maps/prepare-exchange-map.mjs`、`apps/web/app/pages/community/exchange/exchange-map-model.ts`
> 适用环境：本地 RustFS、测试 S3-compatible bucket 与生产前发布验证
> 前置条件：已激活完整 OpenFreeMap release，目标 bucket 支持 multipart upload、HTTP Range 和 CORS
> 回滚边界：对象 release 不可变；回滚只切换后台完整 style URL，不删除当前或上一 release
> 验证方法：发布脚本的对象清单、HEAD 元数据、公共 CORS 和 16 KiB PMTiles Range 检查

本规范定义 Fudaba exchange map 在 S3-compatible storage 中的唯一对象布局。对象键必须先声明
`openmap` namespace，再声明 release version。App 不打包地图数据，后台只向客户端下发当前生效的
完整 style URL。

## 对象键

release version 由准备阶段的 manifest 派生：

```text
<openFreeMapVersion>-z0-<maxZoom>
```

完整对象树为：

```text
openmap/<release-version>/
├── exchange-style.json
├── manifest.json
└── exchange/
    ├── openfreemap-z0-<maxZoom>.pmtiles
    ├── natural-earth/<z>/<x>/<y>.png
    ├── sprites/ofm.json
    ├── sprites/ofm.png
    ├── sprites/ofm@2x.json
    ├── sprites/ofm@2x.png
    └── fonts/<fontstack>/<range>.pbf
```

不得使用 `latest`、`current`、覆盖式目录或省略 release version。相同 release version 下的对象必须
不可变。本地内容变化时必须生成新 release version，发布脚本使用 `--immutable` 拒绝覆盖远端差异。

`exchange-style.json` 保持仓库中的 `/maps/exchange/**` 资源引用。客户端根据完整 style URL 把这些
引用重写到同一 release 根下的 `exchange/**`，因此 style、PMTiles、glyph、sprite 和 raster 必须由
同一个公开 origin 提供。

## Manifest

`manifest.json` 由发布脚本生成，不直接复制准备阶段的 manifest。它必须包含：

- `schemaVersion` 与 `namespace`；
- `releaseVersion`、`objectRoot`、`styleObject` 和 `assetRoot`；
- 对象总数与资源总字节数；
- style 的字节数和 SHA-256；
- 完整的准备阶段 source manifest，包括 OpenFreeMap snapshot、PMTiles SHA-256、zoom 和 attribution。

发布结果、上传时间和目标 bucket 属于私有 release record，不写入长期文档。

## 对象元数据

| 对象                                         | Content-Type              | Cache-Control                         |
| -------------------------------------------- | ------------------------- | ------------------------------------- |
| `exchange-style.json`、sprite JSON、manifest | `application/json`        | `public, max-age=31536000, immutable` |
| `.pmtiles`                                   | `application/vnd.pmtiles` | `public, max-age=31536000, immutable` |
| glyph `.pbf`                                 | `application/x-protobuf`  | `public, max-age=31536000, immutable` |
| raster 与 sprite `.png`                      | `image/png`               | `public, max-age=31536000, immutable` |

不得为 PMTiles 设置动态 gzip。8.5 GiB 级归档必须使用 multipart upload；发布器固定使用 256 MiB
part 与可恢复的 rclone S3 上传。

## CORS 与公开读取

地图对象是无凭据公开资源。bucket policy 或 CDN 必须允许匿名 `GetObject`。RustFS 与使用 AWS
CORS 格式的 S3-compatible 服务至少配置：

```json
[
  {
    "ID": "imsweb-openmap-public-read",
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range", "if-match"],
    "ExposeHeaders": [
      "etag",
      "accept-ranges",
      "content-range",
      "content-length"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

Cloudflare R2 不接受上述 AWS CORS 文档。Wrangler 文件使用顶层 `rules` 和小写字段：

```json
{
  "rules": [
    {
      "allowed": {
        "origins": ["*"],
        "methods": ["GET", "HEAD"],
        "headers": ["Range", "If-Match"]
      },
      "exposeHeaders": [
        "ETag",
        "Accept-Ranges",
        "Content-Range",
        "Content-Length"
      ],
      "maxAgeSeconds": 3000
    }
  ]
}
```

`AllowedOrigins: ["*"]` 仅适用于公开、无 cookie、无 Authorization 的地图对象。访问控制仍由 bucket
policy 决定；CORS 本身不授予读取权限。使用私有 S3 origin 时应通过 CloudFront/R2 custom domain
公开读取，不得把带查询参数的预签名 style URL 写入后台配置。

## 安全门禁

发布器默认 dry-run，并要求：

1. `--env-file` 指向目标环境文件；
2. `--expect-bucket` 与环境中的 `IMS_S3_BUCKET` 完全一致；
3. 目标 endpoint 是回环 RustFS，或 bucket 名包含独立的 `test` 段；
4. 只有显式 `--apply` 才会上传和验证；未传 `--skip-cors` 时，发布器还会先配置 CORS。

该门禁拒绝生产 bucket。生产发布应在独立受控流程中增加审批，不复用本地测试命令。

## 发布命令

先 dry-run：

```sh
pnpm --filter @imsweb/api run ops:openmap:publish -- \
  --env-file <rustfs-env-file> \
  --expect-bucket <rustfs-bucket>

pnpm --filter @imsweb/api run ops:openmap:publish -- \
  --env-file <r2-test-env-file> \
  --expect-bucket <test-bucket>
```

核对 bucket、endpoint、对象根、对象数、总字节和 style URL 后执行：

```sh
pnpm --filter @imsweb/api run ops:openmap:publish -- \
  --env-file <rustfs-env-file> \
  --expect-bucket <rustfs-bucket> \
  --apply

pnpm --filter @imsweb/web exec wrangler r2 bucket cors set \
  <test-bucket> --file <r2-cors-json> --force
pnpm --filter @imsweb/web exec wrangler r2 bucket cors list <test-bucket>

pnpm --filter @imsweb/api run ops:openmap:publish -- \
  --env-file <r2-test-env-file> \
  --expect-bucket <test-bucket> \
  --skip-cors \
  --apply
```

发布器会为 RustFS/S3 合并 OpenMap CORS rule，不删除其他 rule。R2 CORS 由 Wrangler 或 Cloudflare API
管理；只有已设置并核对 policy 后才可传 `--skip-cors`。该参数只跳过写入，发布后的公共 CORS 与 Range
验证仍会执行。上传完成后必须验证：

- release prefix 下对象数量和总字节与本地 publication manifest 一致；
- style 与 PMTiles 的 MIME 和 Cache-Control 正确；
- 公共 style GET 返回 `200` 并允许 Tauri origin；
- PMTiles `Range: bytes=0-16383` 返回 `206`、16,384 字节及正确总长度。

## 后台切换

本地测试以 LAN RustFS style URL 作为 `IMS_FUDABA_MAP_STYLE_URL`。可以用
`IMS_FUDABA_MAP_STYLE_URLS` 初始化 R2 测试桶、官方 OpenFreeMap 与 `/maps/exchange-style.json`，
也可以在“系统配置 > 交换地图源”中直接新增或编辑这些配置。持久化集合创建后，后台 CRUD 和激活项
是权威来源，不需要为地图源变更重启 API。先检查：

```sh
curl --fail http://127.0.0.1:3000/api/community/exchange/map/config
```

响应必须是后台当前激活配置的完整 `styleUrl`。管理员切换使用“系统配置 > 交换地图源”，客户端不得
自行选择或回退到另一个 provider。

## 回滚

回滚只把后台选择切回上一条已验证 style URL。不得覆盖或删除当前 release prefix。观察期结束后，
旧 release 的删除必须使用独立清理流程，并先确认后台、客户端和私有 release record 均不再引用它。
