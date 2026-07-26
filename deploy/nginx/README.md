# Nginx 正式入口

[`imsweb.conf.example`](imsweb.conf.example) 是安装在宿主机上的 Nginx 配置模板，不是
Compose 服务。模板使用 `http2 on;`，要求 Nginx `1.25.1` 或更高版本。推荐拓扑为：

- `www.example.com`：Web、`/api` 和业务媒体路由全部代理到回环地址上的 Hono Node；
- `objects.example.com`：同一台机器上的 MinIO S3 API，代理到回环地址 `127.0.0.1:9000`；
- PostgreSQL、Hono、MinIO API 和 MinIO Console 都不直接监听公网地址。

生产构建已经由 Hono 托管 Web 静态文件和前端 fallback，因此不要在 Nginx 中另外配置
`root` 或把 `/api` 分到另一个公网 origin。整站代理到 Hono 才能保持管理 Cookie、CSRF 和
浏览器请求同源。

## 安装

先准备同时覆盖主域名与对象域名的 TLS 证书。复制模板后替换以下占位符：

| 占位符 | 示例 | 含义 |
| --- | --- | --- |
| `__IMS_APP_DOMAIN__` | `www.example.com` | Web 与 Hono 共用的主域名 |
| `__IMS_S3_DOMAIN__` | `objects.example.com` | 浏览器可访问的 MinIO S3 API 域名 |
| `__IMS_CERT_NAME__` | `www.example.com` | `/etc/letsencrypt/live/` 下的证书目录名 |

```sh
sudo install -m 0644 deploy/nginx/imsweb.conf.example \
  /etc/nginx/conf.d/imsweb.conf
sudo editor /etc/nginx/conf.d/imsweb.conf
sudo nginx -t
sudo systemctl reload nginx
```

模板假定 Hono 监听 `127.0.0.1:3000`、MinIO S3 API 监听 `127.0.0.1:9000`。若目标端口不同，
只修改对应 `upstream`。两个 HTTPS 入口默认将请求体限制为 `64m`，覆盖当前应用的 `50 MiB`
最大上传；调高应用上传限制时必须同步调整。不要把 MinIO Console 的 `9001` 端口加入公网
Nginx 配置；需要管理时使用 SSH 端口转发或受控的内网入口。

## 应用环境

主域名入口启用后，Hono 至少使用：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
IMS_CLIENT_ADDRESS_SOURCE=nginx
IMS_SITE_ORIGIN=https://www.example.com
IMS_COOKIE_SECURE=true
```

同机 MinIO 使用 path-style S3 地址。公开对象基址必须包含 bucket，S3 endpoint 则不能包含
bucket：

```dotenv
IMS_OBJECT_STORAGE=s3
IMS_S3_BUCKET=imsweb-media-prod
IMS_PUBLIC_READ_URL_BASE=https://objects.example.com/imsweb-media-prod
IMS_S3_REGION=us-east-1
IMS_S3_ENDPOINT=https://objects.example.com
IMS_S3_FORCE_PATH_STYLE=true
IMS_S3_PREFIX=
IMS_S3_READ_URL_TTL_SECONDS=300
```

`IMS_S3_ENDPOINT` 同时用于服务端 S3 请求和浏览器的短期签名 URL，因此不能设置为
`http://127.0.0.1:9000`。如果服务器访问自己的公网地址存在 NAT hairpin 问题，可只在服务器
的 split-horizon DNS 或 `/etc/hosts` 中把 `objects.example.com` 解析到 `127.0.0.1`；公网 DNS
仍应指向该服务器，TLS 域名保持不变。

不要用主域名的 `/s3/` 前缀转发到 MinIO。代理移除或增加路径前缀会改变 SigV4 的 canonical
URI，受保护对象的签名 URL 会返回 `SignatureDoesNotMatch`。对象域名应保留原始 Host 和 URI。

MinIO bucket 策略仍是访问控制的权威来源：公开对象允许匿名 `GetObject`，任何层级中的
`__protected/` 路径拒绝匿名读取，只有应用签发的短期 URL 可以读取。仓库的
`deploy/minio-public-policy.json` 提供了这一策略；生产凭据、版本控制、备份和恢复必须按目标
环境单独配置，不能沿用 `deploy/.env.example` 的本地默认值。

## 切流检查

```sh
curl --fail --silent --show-error https://www.example.com/api/wiki/test
curl --fail --silent --show-error https://www.example.com/ >/dev/null
curl --fail --silent --show-error \
  https://objects.example.com/minio/health/live >/dev/null
```

随后验证一个公开对象、一个经鉴权后获得的受保护对象签名 URL、登录刷新和最大尺寸上传。
确认公网不能直连 `3000`、`9000`、`9001`，并检查 Nginx 与应用日志中的 4xx/5xx。
