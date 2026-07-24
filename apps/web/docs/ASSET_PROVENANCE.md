# 资产来源记录

本文件记录 `apps/web/public/` 中需要单独核对来源和许可的静态资产。源文件出现在内部或旧版
工程中，不等于已经取得复制、修改或公开分发许可。

## 当前状态

根据仓库维护者在 2026-07-24 的明确恢复要求，公开 Web workspace 当前包含站点 Logo、
六张首页背景系列标志和六张顶部系列墙图片。除下文逐项记录的文件外，不从私有 Legacy
工程迁入其他图片、字体或音视频。

## 站点 Logo

`public/brand/imsweb-logo.png` 从现代 Web 初始提交 `aadff77` 原样恢复；该文件与 Legacy
`public/assets/images/logo.png` 完全一致，尺寸为 545 x 188，SHA-256 为
`aa2ed68b5c1df4e8800a576dd09251c314b0da8f37b43e96247b64e993aeb483`。

## 首页背景系列标志

根据仓库维护者在 2026-07-24 的明确恢复要求，以下六张系列标志从本地 Legacy 历史快照
`imsweb-legacy-history-019f92ba` 原样恢复，仅用于首页背景漂浮动效：

| Web 路径                                   | Legacy 来源路径                                       | SHA-256                                                            |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `public/brand/series/765pro.png`           | `public/assets/images/Production/765PRO.png`          | `29733a8da4902052ea703863a3462c331d19a7299df7994753dbaaa6d46d4f0c` |
| `public/brand/series/cinderella-girls.png` | `public/assets/images/Production/CinderellaGirls.png` | `1f4ac098baf2fcf62b6d02d8bfc148dd0b455d174d23c2cdd0aee85c5fe5885f` |
| `public/brand/series/million-live.png`     | `public/assets/images/Production/Million.png`         | `179fe5d36440eb15d314781d463c6872b5518578ef6e8d8ea5b1a57cc007dcb5` |
| `public/brand/series/sidem.png`            | `public/assets/images/Production/SideM.png`           | `2a13de61aa1dab8f7226a7d0b8367c4d71587c94e81142cd12b28b15ccd41dde` |
| `public/brand/series/shiny-colors.png`     | `public/assets/images/Production/Shinycolors.png`     | `d43d0342b40a2796c5601282ce6b619e536644bec85f59e3dbb548d8b2179370` |
| `public/brand/series/gakuen.png`           | `public/assets/images/Production/Gakuen.png`          | `81e95e2b5199f44343762f16872fa76aadb047753958e85f68479ba1fb06e01c` |

文件未裁切、重绘或转换格式。相关标志及商标权归各自权利人，不因仓库代码采用 MIT 而
自动获得 MIT 许可；公开部署和再分发范围仍应由仓库维护者按实际授权确认。

## 首页顶部系列墙

以下六张人物图片从同一 Legacy 历史快照原样恢复，用于首页顶部系列墙：

| Web 路径                                        | Legacy 来源路径                                       | SHA-256                                                            |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `public/brand/series/wall/765pro.png`           | `public/assets/images/Production/765intro.png`        | `63da4813056133985026a0bdca7306fac3ec3a1623a954a573c55077a7976ef3` |
| `public/brand/series/wall/cinderella-girls.png` | `public/assets/images/Production/Cinderellaintro.png` | `a82350e4e94c043525769a003b4a15609cdb4db742701335d13d3f727bb807c8` |
| `public/brand/series/wall/million-live.png`     | `public/assets/images/Production/Millionintro.png`    | `a271dcd8a33ce71e21f4c957a813042c9c5f54dd33f73d73d888be4f5ab66272` |
| `public/brand/series/wall/sidem.png`            | `public/assets/images/Production/Sidemintro.png`      | `bded4f68a603c8f1d060b5cf2b35ef3f95fff4939df972d9f0cf1e688598cbec` |
| `public/brand/series/wall/shiny-colors.png`     | `public/assets/images/Production/Shinyintro.png`      | `19c28aba0714205de23238a59012288b503d388d0b4922d430919070247f4bb3` |
| `public/brand/series/wall/gakuen.png`           | `public/assets/images/Production/Gakuenintro.png`     | `0205ebb95118b234635b57d5d2a7b2043f5cecf52cb8720fe80976d12816d09d` |

六张文件均为 585 x 500 PNG，未裁切、重绘或转换格式。人物图像的著作权和相关标志权利
归各自权利人，许可边界与上节相同。

`public/favicon.ico` 随 Web 工程初始化进入仓库。若未来替换为定制图标，应在同一变更中记录
作者、原始来源、适用许可证或书面授权、允许的使用范围、修改情况和 SHA-256。

## 新增资产要求

新增静态资产必须满足以下条件：

- 权利人和原始来源可验证；
- 许可证或书面授权明确允许仓库公开分发及预期使用；
- 修改、裁切或格式转换已记录；
- 文件 SHA-256 与提交内容一致；
- 商标或人物素材不会因代码采用 MIT 而被错误标记为 MIT。

无法满足以上条件的文件不得进入公开仓库或发布产物。
