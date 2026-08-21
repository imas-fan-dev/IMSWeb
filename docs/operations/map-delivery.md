# 地图资源交付与同源托管

> 文档类型：运维
> 状态：Active
> 权威来源：`apps/web/public/maps/`、地图组件资源 allowlist、`@imsweb/contracts/paths` 和部署入口配置
> 适用环境：公开 Producer Map、Fudaba exchange map 与自托管地图资源

公开地图需要稳定、可审计且不泄露 provider key 的资源链。生产设计以同源交付为目标：style、
tile、glyph、sprite 和行政边界均由受控 origin 提供，Web 代码不硬编码第三方 token 或临时 host。

## 资源分类

| 资源               | 作用                                       | 权威来源                                     |
| ------------------ | ------------------------------------------ | -------------------------------------------- |
| Style JSON         | source、layer、font、sprite 与 attribution | `apps/web/public/maps/` 中的版本化文件       |
| Vector/raster tile | 底图数据                                   | 经许可的上游快照或自托管 PMTiles/tile tree   |
| Glyph              | 中文和拉丁文字形                           | 与 style font stack 对应的许可字体产物       |
| Sprite             | 底图图标和 symbol                          | style 对应的 sprite JSON/PNG                 |
| 行政边界           | Producer Map 和合规边界显示                | `apps/web/public/maps/` 中登记来源的 GeoJSON |

只镜像 tile 而继续远程读取 glyph 或 sprite 不算同源。所有 URL 必须使用 shared path builder 或
style 中的相对路径，并通过客户端 allowlist。

## 当前生产合同

Fudaba exchange map 固定使用 OpenFreeMap snapshot `20260816_080001_pt`：planet 从官方远程
PMTiles 裁剪为全球 z0–11 单文件，Natural Earth z0–6、Bright sprite 和三套 Noto Sans BMP glyph
完整镜像。浏览器通过 `pmtiles:///maps/exchange/openfreemap-z0-11.pmtiles` 读取归档；PMTiles
protocol 将根相对地址解析为当前 origin 的 HTTP Range 请求。style、raster、glyph、sprite 和
PMTiles 均不包含第三方运行时 host。

大型产物不进入 `apps/web/public/` 或应用镜像：

```text
# 开发机（Git 忽略）
data/maps/releases/openfreemap-20260816_080001_pt-z0-11/
data/maps/current -> releases/openfreemap-20260816_080001_pt-z0-11

# 生产宿主机
/srv/imsweb/maps/releases/openfreemap-20260816_080001_pt-z0-11/
/srv/imsweb/maps/current -> releases/openfreemap-20260816_080001_pt-z0-11
```

开发 Vite 只在 serve 模式把 `data/maps/current/` 映射为 `/maps/exchange/`；生产 Nginx 用同一个
URL prefix 静态读取宿主机 current symlink。生产 Range 请求不经过 Hono，应用 release 和地图
release 可以独立发布、回滚。

## 数据源与许可

选择地图源时必须记录：

- 上游项目、版本/快照标识和下载 URL；
- 数据、style、字体、图标各自的许可证与 attribution；
- 下载文件的字节数和 SHA-256；
- 目标 zoom、bbox、layer 和裁剪参数；
- 是否允许公开托管、缓存和再分发。

资产登记写入[公开资产来源与许可](../governance/assets.md)。一次部署的具体下载时间、对象数量和
性能数据写入私有运维记录，不写入本长期文档。

## 交付方案

### 解包静态 tile

服务端或对象存储按稳定路径提供 `/{z}/{x}/{y}.pbf`。该方案浏览器无需 PMTiles protocol，
适合现有 style 和 CDN；缺点是文件数较多，更新和原子切换需要版本目录。

### PMTiles（当前采用）

浏览器注册 PMTiles protocol 并向同源 Nginx 发起 Range 请求。该方案只有一个约 7.92 GiB 的
planet 文件，避免数百万 inode，版本切换只涉及一个目录软链接。Nginx 限制为单 Range、关闭
动态 gzip，并返回 `Accept-Ranges`、`Content-Length`、`Content-Range`、ETag 和短时可重验证缓存。
同源请求不需要 CORS。

选择方案时以部署环境、缓存层、更新频率和回滚方式为依据，不在页面组件中分叉业务逻辑。

## 生成资源

准备命令默认是无写入 dry-run，只有显式 `--apply` 才下载；`--activate` 原子切换本地 current：

```sh
node scripts/maps/prepare-exchange-map.mjs
node scripts/maps/prepare-exchange-map.mjs --apply --activate
```

脚本固定使用 `go-pmtiles v1.31.2`。若未传 `--pmtiles-bin`，它按当前 Linux/macOS 架构下载官方
release archive，先核对仓库内固定的 SHA-256 再解包。核心命令等价于：

```sh
pmtiles extract \
  https://btrfs.openfreemap.com/areas/planet/20260816_080001_pt/tiles.pmtiles \
  openfreemap-z0-11.pmtiles \
  --maxzoom=11 \
  --download-threads=4
pmtiles verify openfreemap-z0-11.pmtiles
```

完整资源计划为 4 个 sprite 文件、3 × 256 个 glyph 文件和 5461 个 Natural Earth raster tile；
默认并发数为 8，可用 `--concurrency 1..32` 调整。脚本要求至少 12 GiB 可用空间；伴随资源会按
Content-Type 及 JSON/PNG/PBF 文件头复核，已通过验证的小文件可复用。CLI 压缩包固定 SHA-256，
不匹配时删除并重取一次。PMTiles 只有经过 `verify` 才从 staging 原子进入 release；已完整但尚未
rename 的 partial 可恢复，但 `go-pmtiles extract` 不支持续传未完成的输出，中途退出后该归档提取
会从头执行。每个 release 最终写入 `manifest.json`，记录 snapshot、zoom、归档字节数、SHA-256、
伴随资源数量和 attribution。

## 生产发布与回滚

先在具备稳定国际出口和足够磁盘的受控机器生成 release，再同步到生产主机的新目录。不要覆盖
current 指向的目录：

```sh
RELEASE=openfreemap-20260816_080001_pt-z0-11
sudo install -d -m 0755 "/srv/imsweb/maps/releases/$RELEASE"
sudo rsync -a --delete \
  "data/maps/releases/$RELEASE/" \
  "/srv/imsweb/maps/releases/$RELEASE/"
sudo chown -R root:nginx "/srv/imsweb/maps/releases/$RELEASE"
sudo find "/srv/imsweb/maps/releases/$RELEASE" -type d -exec chmod 0750 {} +
sudo find "/srv/imsweb/maps/releases/$RELEASE" -type f -exec chmod 0640 {} +
sudo ln -s "releases/$RELEASE" /srv/imsweb/maps/current.next
sudo mv -Tf /srv/imsweb/maps/current.next /srv/imsweb/maps/current
sudo nginx -t
sudo systemctl reload nginx
```

`nginx` 是示例 worker group；目标主机使用其他运行组时替换它。若 `current.next` 已存在，先核对
其目标再删除，不能盲目覆盖。回滚执行同一组 `ln -s` + `mv -Tf`，目标改为仍保留的上一 release，
不需要重建或重启应用。

入口切换后验证静态文件和 Range：

```sh
ORIGIN=https://www.example.com
curl --fail --head "$ORIGIN/maps/exchange/sprites/ofm.json"
curl --fail --head "$ORIGIN/maps/exchange/fonts/Noto%20Sans%20Regular/0-255.pbf"
curl --fail --head "$ORIGIN/maps/exchange/natural-earth/0/0/0.png"
curl --fail --silent --show-error --dump-header - --output /dev/null \
  --header 'Range: bytes=0-16383' \
  "$ORIGIN/maps/exchange/openfreemap-z0-11.pmtiles"
```

最后一条必须返回 `206`、`Accept-Ranges: bytes`、正确的 `Content-Range: bytes 0-16383/<size>`
和 `Content-Length: 16384`。

## 目录与路由

- 静态 Web 地图资源通过 `mapsPath()` 管理 `/maps` 前缀。
- 大型 tile/glyph/sprite 可放在对象存储或宿主机版本目录，由同源 Nginx/Hono 入口转发。
- API route、middleware path ownership 和 Web asset URL 使用 `@imsweb/contracts/paths`；路径变更
  同时更新 frontend routing contract。
- 地图响应设置正确 MIME、immutable cache（带版本的资源）、ETag/Last-Modified 和 Range。
- 公开响应保留 OpenStreetMap/OpenMapTiles/OpenFreeMap 或实际数据源要求的 attribution。

## 更新流程

1. 在隔离目录下载新上游快照并验证 checksum、许可证和 manifest。
2. 运行 `node scripts/maps/prepare-exchange-map.mjs --apply` 生成 z0–11 PMTiles、glyph、sprite 和
   raster，并
   核对 `manifest.json`。
3. 将产物写入新的不可变版本目录，不覆盖当前版本。
4. 在 staging 修改 style/version pointer，验证桌面和移动地图、中文标签、低/高 zoom、离线错误和
   attribution。
5. 原子切换版本指针，保留上一版本以便回滚；观察 404、range、缓存命中和加载延迟。
6. 观察期后通过受控清理流程回收旧版本，不直接删除当前 pointer 引用的对象。

## 验证清单

- style、source、glyph、sprite 和 tile URL 都在允许 origin 内；
- 所有关键 zoom/bbox 有数据，不出现空白 canvas 或无界重试；
- 中文 glyph、symbol、行政边界和南海断续线按产品要求显示；
- MapLibre attribution 始终可见，许可证链接可访问；
- 响应 MIME、gzip、Range、ETag、cache-control 和 404 正确；
- 桌面和移动视口无溢出，地图交互、筛选、详情和返回流程正常；
- 断开上游网络后，自托管生产资源仍可加载；
- 回滚到前一版本不要求重新构建应用。

任何需要第三方运行时 token、未登记来源或无法原子回滚的方案，都不能作为生产默认值。
