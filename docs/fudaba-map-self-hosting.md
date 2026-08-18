# Fudaba 区域地图底图同源托管

## 为什么必须做

`docs/migrations/fudaba-platform-migration.md` §7.3 已经写死：

> 样式、tile、glyph 和 sprite 均由部署方在同源托管，代码不得硬编码第三方 provider 或密钥

当前实现不满足该条：`apps/web/public/maps/exchange-style.json` 的 tile / sprite / glyph 全部指向
`tiles.openfreemap.org`，且 `apps/web/app/pages/community/exchange/exchange-map-model.ts` 在
资源白名单里硬编码了该主机。**同源化是补齐既有合同欠账，不是可选优化。**

顺带解决大陆访问慢的问题。实测（2026-02，本机→OpenFreeMap 公共实例）：

| 观测项 | 实测值 |
| --- | --- |
| TileJSON 首次请求 | 1274 ms（含 DNS + TLS + TTFB） |
| z4 / z5 / z6 瓦片 | 438 / 726 / 324 ms，196–545 KB 每片 |
| 边缘 | `server: cloudflare`，`cf-ray: …-SJC` |
| 源站 | Hetzner（德国）专用服务器 |

Cloudflare 标准网络不含中国大陆 PoP，大陆用户必然跨境取图。生产机在 HK/SG，到大陆是一跳短
距跨境，明显优于 Cloudflare 把大陆流量甩到 SJC/LAX 的不确定路由；同源还省掉一次到第三方主机
的 DNS + TLS 握手。

## 数据源与体积（实测，非估算）

OpenFreeMap 官方每周发布全球 planet，**除 Btrfs / MBTiles 外已直接提供 PMTiles**（README 尚未
更新到这一点）：

```text
https://btrfs.openfreemap.com/areas/planet/<version>/tiles.pmtiles
```

对 `20260816_080001_pt` 用 HTTP Range 读取 PMTiles v3 header 实测：

| 项 | 值 |
| --- | --- |
| `tiles.pmtiles` | 86,147,957,909 B = **80.23 GiB** |
| `tiles.mbtiles` | 102,068,146,176 B = 95.06 GiB |
| tile_type / compression | MVT / **gzip** |
| minzoom / maxzoom | 0 / 14 |
| `clustered` | **1**（`pmtiles extract` 的前提，满足） |

遍历全部相关 leaf directory、按唯一 blob 去重求和：

```text
z0-11 唯一瓦片字节 = 8,499,595,382 B = 7.92 GiB（占整星球 9.88%）
```

配合本次把 `maxZoom` 收到 11，**全球 z0–11 仅 7.92 GiB**，可直接放在应用服务器磁盘上，不需要
CDN，也不需要跨网络的 range request。

> 目标用户以大陆为主但有海外用户，因此取**全球** z0–11，不要按中国 bbox 裁剪，否则海外用户
> 看不到本地底图。

## 裁剪

`pmtiles extract` 支持直接从远程 URL 裁剪，无需先下载 80 GiB：

```sh
# https://github.com/protomaps/go-pmtiles/releases
pmtiles extract \
  https://btrfs.openfreemap.com/areas/planet/20260816_080001_pt/tiles.pmtiles \
  ofm-z11.pmtiles \
  --maxzoom=11 \
  --download-threads=4
```

## 三类资源都要镜像，别只做瓦片

样式里引用了四处外部地址，同源化必须全部覆盖，遗漏任何一处地图都会退化：

| 资源 | 当前地址 | 处理 |
| --- | --- | --- |
| 矢量瓦片 | `tiles.openfreemap.org/planet` | 上面的 PMTiles |
| sprite | `tiles.openfreemap.org/sprites/ofm_f384/ofm` | 镜像 `.json` + `.png`（含 @2x） |
| glyph | `tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` | 见下 |
| Natural Earth 栅格 | `tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png` | maxzoom 6，体积很小，整体镜像 |

### glyph 的中文特殊处理

样式用到 `Noto Sans Regular` / `Bold` / `Italic` 三套字体。若整体镜像，每套 256 个 range，CJK
段尤其大。**给 MapLibre 加 `localIdeographFontFamily` 可让浏览器本地渲染 CJK 字形，不再下载
中日韩 glyph**，对中文用户既省流量又更快：

```ts
new MapLibreMap({
  // …
  localIdeographFontFamily: "'PingFang SC','Microsoft YaHei',sans-serif",
})
```

加上该项后，只需镜像非 CJK 的 range（通常 0-255、0x2000 段等少数几个）。

## 服务端提供方式

两种，二选一：

### A. 服务端解包为 `/{z}/{x}/{y}.pbf` 静态路径（前端零改动，推荐）

样式里的 `openmaptiles` source 改成同源 TileJSON 即可，`exchange-office-map.tsx` 不用动。

⚠️ 两个必须处理的细节，否则 MapLibre 解析失败：

- PMTiles 内瓦片是 **gzip** 的，静态响应必须带 `Content-Encoding: gzip` 与
  `Content-Type: application/x-protobuf`；
- 若改从 MBTiles 导出，MBTiles 用 TMS，y 轴需翻转为 XYZ：`y = 2^z - 1 - y_tms`。

### B. 前端注册 pmtiles protocol

```sh
pnpm --filter @imsweb/web add pmtiles
```

```ts
import { Protocol } from "pmtiles"
maplibregl.addProtocol("pmtiles", new Protocol().tile)
// source url: "pmtiles:///maps/ofm-z11.pmtiles"
```

代价是 `exchange-map-model.ts` 的资源白名单要放行 `pmtiles://` 协议，与 §7.3「只允许同源
绝对路径」的收敛方向相反，因此优先选 A。

## 必须同批落地的代码改动

同源化本身会让下列现有断言失效，**必须与部署同批提交**，否则线上地图直接白屏：

1. `apps/web/public/maps/exchange-style.json` — 四处外部地址改为同源绝对路径。
   改后 `apps/web/docs/ASSET_PROVENANCE.md:72` 记录的 SHA-256 失效，需同步更新，并把「稳定
   副本」的描述改为「已按同源部署改写」。
2. `apps/web/app/pages/community/exchange/exchange-map-model.ts:18-42` — 删除
   `openFreeMapOrigin` 与 `isOpenFreeMap` 分支，只保留当前 origin。
3. `apps/web/tests/unit/pages/community/exchange-style-asset.test.ts` — 该测试目前**锁定了违反
   §7.3 的现状**（断言 source/sprite/glyphs 指向 `tiles.openfreemap.org`），需反向改为断言同源。
4. `apps/web/tests/unit/pages/community/exchange-map-model.test.ts` — 白名单相关用例同步调整。

## 署名不能去掉

OpenFreeMap planet TileJSON 提供常驻署名：OpenFreeMap、OpenMapTiles、`Data from OpenStreetMap`。
数据为 **ODbL**，自建镜像同样须保留署名。当前 `exchange-office-map.tsx` 用非 compact 的
`AttributionControl` 在左下角展示，同源化后需确认同源 TileJSON 仍带 `attribution` 字段，或在
控件中显式补上。

## 更新节奏

OpenFreeMap planet 每周三生成、周六 set-latest。建议每月拉取一次新版本重跑 extract，用版本化
目录名切换，保留上一版以便回滚。
