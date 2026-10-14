# iPhone 17 / 18 系列尺寸版预览

本组图片展示 iOS Liquid Glass 部分的最新设计方向：沿用底部导航的色调与材质，刷新按钮具有加载状态，地图和地点卡片的来源信息统一进入现有「地图数据来源」Dialog。地图、搜索结果、状态栏及材质均为绘制的设计示意，图片不属于原生运行证据。

## 渲染基准

| 已核实的机型 | 逻辑视口 | 输出像素 |
| --- | --- | --- |
| iPhone 17 / 17 Pro / 18 Pro | 402×874 pt，@3x | 1206×2622 px |
| iPhone 17 Pro Max / 18 Pro Max | 440×956 pt，@3x | 1320×2868 px |

每个尺寸都有独立排版的地图待机、刷新加载、搜索展开和授权 Dialog 四张屏幕图。PNG 原图不包含外加机框，像素宽高逐张校验；总览附机框并缩小展示。文字使用统一点尺寸，不随机型画布整体放大。八张图的文字边界检查均无溢出。

尺寸来自 Apple 官方规格和本机 CoreSimulator 的 `ScreenDimensionsCapability`，缩放倍率为 3。原始设备参数见 [device-metrics.json](./device-metrics.json)，输出检查见 [manifest.json](./manifest.json)。本次未找到普通版 iPhone 18 的官方规格，图片明确标注为 18 Pro／Pro Max。

## 图片

- [iPhone 17 / 17 Pro / 18 Pro 总览](./iphone-17-18-pro-overview.png)
- [iPhone 17 / 18 Pro Max 总览](./iphone-17-18-pro-max-overview.png)
- [地图待机，1206×2622](./iphone-17-18-pro/01-map.png)
- [刷新加载，1206×2622](./iphone-17-18-pro/02-refresh.png)
- [搜索展开，1206×2622](./iphone-17-18-pro/03-search.png)
- [授权 Dialog，1206×2622](./iphone-17-18-pro/04-source-dialog.png)
- [地图待机，1320×2868](./iphone-17-18-pro-max/01-map.png)
- [刷新加载，1320×2868](./iphone-17-18-pro-max/02-refresh.png)
- [搜索展开，1320×2868](./iphone-17-18-pro-max/03-search.png)
- [授权 Dialog，1320×2868](./iphone-17-18-pro-max/04-source-dialog.png)

各目录附独立 SVG 原稿。`refresh-motion-design.svg` 是用于讨论旋转节奏的设计动画，未使用 UIKit，不能作为原生按钮动效实测证据。实际玻璃质感、按下反馈、加载状态切换、安全区、动态字号与减少动态效果仍由原生验收证明。

## 重渲染

安装了项目依赖的 Web workspace 可作为第二个参数：

```sh
node render.cjs /absolute/path/to/IMSWeb/apps/web
```

渲染使用该 workspace 已安装的 Playwright，输出文件写入脚本所在目录。

## 来源

- [Apple：iPhone 17](https://www.apple.com/iphone-17/specs/)
- [Apple Support：iPhone 17 Pro](https://support.apple.com/en-us/125090)
- [Apple Support：iPhone 17 Pro Max](https://support.apple.com/en-us/125091)
- [Apple：iPhone 18 Pro / Pro Max](https://www.apple.com/iphone-18-pro/specs/)
