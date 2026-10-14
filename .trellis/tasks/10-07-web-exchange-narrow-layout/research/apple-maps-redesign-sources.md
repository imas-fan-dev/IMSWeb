# Apple Maps 新一轮设计研究：来源与范围

## 用户要求

上一版宽度和样式不符合新的设计需求。本轮研究最新 Apple Maps，重新提出搜索、结果、选点与地图工具的布局。历史 346／360pt 规则不作为新方案约束；旧实现、原预览和验收记录保留。本记录是研究过程，不是已批准的设计或施工计划。

## 版本资料

- [Apple：About iOS 27 Updates](https://support.apple.com/en-us/149076)，页面标注 2026-09-29。官方说明 Liquid Glass 改善可读性，并增加从超清晰到完全着色的外观滑块。该页没有 Maps 搜索面板的几何规格，不能据此确定宽度、圆角或停靠高度。
- [Apple：iOS 页面](https://www.apple.com/os/ios/) 的 Maps 部分介绍 Enhanced Flyover。页面中的 Maps 图标和宣传描述不能代替搜索／结果状态截图。
- [9to5Mac：iOS 27 Maps 更新](https://9to5mac.com/2026/09/24/heres-everything-new-for-apple-maps-in-ios-27/) 是发布日期较新的辅助来源；提供 Flyover 与 Local Lists 图像，但没有搜索面板各状态的完整几何证据。
- [MacRumors：iOS 27 Maps](https://www.macrumors.com/guide/ios-27-maps/) 标注 2026-07-01，写作时为 beta。Trending Restaurants 与 Search 界面图只能作为该版本的辅助参考，不标为当前发布版实测。

## Apple 设计指导

[Maps HIG](https://developer.apple.com/design/human-interface-guidelines/maps) 的 [官方 DocC 数据](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/maps.json) 强调地图可缩放／平移、清楚区分选中内容，以及地图与自定义控件之间的对比度。Place cards 部分描述嵌入应用的 MapKit 组件，配图包含 iPhone 14 Pro；不将其当作 iOS 27 Apple Maps 应用本身的尺寸规范。

## 实际界面研究

使用自有 iOS 27 模拟器观察 Apple Maps 默认、搜索／键盘、结果及地点详情等状态。须记录实际 OS／应用版本、原始像素和逻辑点尺寸、各状态可见入口、宽度比例与边距，并区分直接层级几何、截图测量和设计推断。网络不可用时仍记录能够观察到的控件，不把空底图当作完整地理数据验证。

已观察默认界面，原始截图 `02-after-dismiss.png` 为 1206×2622px，逻辑视口 402×874pt。层级记录显示面板 bounds 为 `[8,488][394,866]`，宽 386pt，占视口 96.02%，左右各 8pt；搜索为 `[23,504][328,546]`、305×42pt，账户入口为 `[336,504][378,546]`、42×42pt。右侧地图模式／定位组合控件为 `[332,368][380,472]`、48×104pt。

这是带 Places、Home／Work／Add 和 Guides 的默认展开内容，不能把 378pt 面板高度当作最小收起高度，也不能把上述尺寸直接认定为我们的新版规范。父会话已打开检查实际截图。首次通知引导选择了 Not Now，没有开启通知或定位权限。

输入状态也已观察：搜索卡展开到顶部安全区域，头部 bounds 为 `[0,62][402,138]`，搜索框为 `[16,78][331,122]`、315×44pt，关闭入口为 `[342,78][386,122]`、44×44pt。输入 `Tokyo Station` 后显示区域自动补全；可读结果容器左右各约 20pt。原始 `03-search-editing.png` 仍包含首次键盘滑动输入说明，因此它证明展开结构和自动补全，不证明正常键盘或已提交结果。父会话已打开检查该图；键盘说明的 Continue 仅获准作为自有模拟器的引导关闭操作。

研究代理等待引导决策期间触发 1800000ms 总运行时限，未改产品代码。39 个已有原始研究文件及源码完整性记录已复制到工作树忽略目录 `data/design-research/apple-maps-redesign/`；同一代理协议随后完成剩余观察，超时记录保留。

最终观察环境为 iOS 27.0 `24A434`、Maps `1.0`／`2972.30.6.12.58`。中性查询的 Return 直接进入区域地点详情，未观察已提交结果列表或人工选点。实际拖动证明选点 Expanded 宽 402pt、最小态宽 346pt／高 66pt；关闭地点后再拖动，搜索最小态也为 346×66pt。键盘引导恢复后已消失，Continue 没有执行，不能推断消失原因。完整实测、限制与六张新图见 [新版提案](./apple-maps-redesign/README.md)。九张主要 raw PNG 已逐一核对 SHA-256 并保存原始尺寸。

研究启动时两台自有模拟器均为 Shutdown，旧 `/tmp` Maestro 工具目录已不存在。已从官方 release `cli-2.11.0` 恢复独立临时工具；314886578-byte 归档与 release API 的 SHA-256 `5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a` 一致。没有修改项目依赖、用户 profile、账号或权限。自有 iPhone 17 已恢复 Shutdown；ProMax 未启动。

## 提案需要解决的问题

- 收起搜索入口是否需要独立于结果面板，以及两者在各尺寸上的边距与宽度。
- 筛选、事务所、名片、刷新与更多如何分组，避免因工具数量缩短输入或占用过多地图高度。
- 本应用五标签导航与 Apple Maps 自身导航的差异；任何地图页导航显隐调整需要作为产品选择明确审阅。
- 展开、软键盘、选择地点、错误恢复、最大字号与横屏的布局；保留既有搜索和数据合同。

实际观察与绘制提案已经完成；状态宽度、样式选择和导航仍待用户审阅，不从发布说明或旧截图推导统一固定宽度。
