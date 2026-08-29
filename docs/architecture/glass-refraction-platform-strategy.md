# 玻璃折射的平台策略

> 文档类型：架构
> 状态：Decision
> 权威来源：`apps/web/app/app.css` 的玻璃工具类、`apps/web/playwright.config.ts` 和 MDN `backdrop-filter` 兼容表

本决策记录液态玻璃中「折射」这一层的实现路线，以及由此产生的跨平台观感差异。
实施步骤见 [液态玻璃升级与 App 外壳实施计划](../development/liquid-glass-app-shell-plan.md)。

## 背景

液态玻璃与传统毛玻璃的区别在于折射：玻璃应当扭曲背后的内容，而不只是把它模糊掉。
IMSWeb 需要同一套视觉语言同时覆盖 Web 浏览器和 Tauri 打包的 Android 与 iOS 应用。

Web 上实现真折射的唯一可行路径是 `backdrop-filter: url(#svg-filter)` 配合 `feDisplacementMap`。
调查发现该路径在三大引擎上的行为并不一致，且失败模式不同。

## 平台矩阵

| 运行环境 | 渲染引擎 | `backdrop-filter: url()` 行为 |
| --- | --- | --- |
| Web Chrome / Edge | Chromium | 正常渲染 |
| Web Safari | WebKit | 静默丢弃，无软件回退 |
| Web Firefox | Gecko | 元素不渲染 |
| App Android | Chromium WebView | 正常渲染 |
| App iOS | WKWebView | 静默丢弃，无软件回退 |

WebKit 的丢弃发生在 `RenderLayerBacking::updateBackdropFilters()`，它在 `hasReferenceFilter()` 处短路。
与 `filter: url()` 不同，这条路径没有软件回退。

Firefox 的表现是正确性事故而非保真度问题：应用了引用滤镜的元素会整个消失。

结果是一个反直觉的局面：液态玻璃源自 Apple 的设计语言，但真折射恰恰在 Apple 的引擎上做不出来。

## 决策

采用地板加封顶的两层结构。

**地板：伪折射，全平台生效。** 用边缘渐变带、内阴影和高光模拟透镜边缘，产生厚度与折射的观感，
不扭曲背后的真实内容。所有引擎都能看到，包括 iOS 应用与 Safari。

**封顶：真折射，仅 Chromium。** 在支持的引擎上叠加 `backdrop-filter: url(#displacement)`，
让背景内容真正发生位移。

**折射只挂在装饰层上。** 真折射施加于 `.glass-refract::before`，一个不承载任何
内容的伪元素。这把引擎层面的不确定性转化为有界损失：即使某个引擎拒绝渲染它，
代价也只是少一圈镜边，而不是整个表面消失。该结构选择取代了原先设想的引擎崅探式
关闭开关，理由见下方实测。

两层叠加时需要保证边缘处理不重复，避免出现双重轮廓。

## 实测结果

上述引擎行为来自公开追踪记录，不能直接当作本项目的结论。因此对实际要发布的
标记做了一次三引擎探测：先连拍两张关闭状态的截图建立噪声基线，再对比开启后的截图。

| 引擎 | 表头高度 | 基线像素稳定 | 开启后变化 | 结论 |
| --- | --- | --- | --- | --- |
| Chromium | 64px | 是 | 是 | 真折射确实生效 |
| Firefox | 64px | 否 | 否 | 保真度无法判定，但未破坏渲染 |
| WebKit | 64px | 否 | — | 保真度无法判定，但未破坏渲染 |

关键结论有两条。一是 Chromium 上效果可测得到。二是**三个引擎都没有丢失表头**，
说明装饰层隔离的兵形确实拦住了 Firefox 那条元素不渲染的风险。基于此，真折射在
根元素上默认开启，不再需要按引擎关闭。

Firefox 与 WebKit 的基线不稳定，推测与系列图标背景的持续动画有关。这意味着
「它们到底有没有渲染折射」尚未定论，需要一个能冻结背景动画的用例才能回答。
该项列为待办，不阻塞发布，因为它只影响观感而不影响正确性。

## 被否决的方案

**全平台统一伪折射。** 实现最简单、观感最一致，也不存在 Firefox 风险。
否决原因是它主动放弃了 Chromium 上本可获得的效果上限，而 Android 应用与多数桌面用户都在 Chromium 上。

**只做真折射，不支持就退回模糊。** 实现量最小。
否决原因是 iOS 应用与 Safari 用户会拿到整套设计里最素的版本，而项目的日常验收大概率发生在 iOS 设备上，
容易造成验收错位与反复调参。

**WebGL 或 Skia 着色器。** 该路线在 Web 上不成立。
浏览器不提供廉价采样「玻璃背后真实 DOM 内容」的能力，Skia 的 Web 后端也未把运行时着色器实现为图像滤镜。
已知的复刻案例都是在着色器内部程序化生成一个假背景，那并不是折射真实页面内容。

**等待标准化。** CSSWG 中相关讨论仍处于开放阶段，没有可移植的标准实现，不能作为交付依赖。

## 后果

- iOS 应用与 Android 应用会有可见的观感差异。两者都有伪折射地板，只有 Android 拿到真折射封顶。
  该差异必须写入验收标准并标注为预期行为，否则会被反复当作缺陷提交。
- 折射需要维护两套实现，各自调参。
- Firefox 的关闭属于正确性措施，需要有自动化守护。
  现有 `playwright.config.ts` 只有 `chromium-desktop` 与 `chromium-mobile` 两个 project，
  全部基于 Chromium，因此必须新增 Firefox project，否则元素消失事故在持续集成中必然漏网。
- 真折射的开销集中在移动端。已有公开实践只在有能力的桌面浏览器上开启该滤镜，手机与低端设备一律关闭。
  低端 Android WebView 上的帧率尚无实测数据，需要先取基线再决定是否收窄启用条件。
- 若未来 WebKit 支持引用式 `backdrop-filter`，iOS 可以直接复用封顶层，无需改动地板。

## 证据

- MDN `backdrop-filter` 属性页与浏览器兼容表。
- WebKit Pull Request 68614，说明引用式 backdrop filter 被静默丢弃且无软件回退。
- WebKit Bug 245510，`backdrop-filter: url()` 与 `feDisplacementMap` 不工作。
- Firefox Bug 1787623，`backdrop-filter: url()` 导致元素不渲染。
- W3C CSSWG drafts Issue 12316，关于用 CSS 复刻该效果的开放讨论。
