# 跨端地图搜索实施计划

## Entry gate

- [x] 用户已批准独立分支构建；当前任务为 `in_progress`。
- [x] 实施前复核工作树、源码锚点、Web／App specs 与原生插件合同；保留其他任务的暂存和未暂存工作。
- [ ] 产品范围或导航／键盘行为实质改变时先修订规划并重新审阅。

## Ordered work

1. [x] 从现有搜索组件提取共享搜索模型，保持显式提交、并发保护、错误、结果身份和署名；桌面组件使用相同模型但保持现有呈现。
2. [x] 实现页面私有卡片控制器和 DOM 卡片：折叠／编辑／结果／选点，拖动吸附与按钮替代，非模态地图交互，真实可见视口和短横屏约束。Web 使用 28px 面板、48px 胶囊搜索和 44px 圆形独立动作，保持浅边界、轻投影及完整焦点环。
3. [x] 接入 Web <1024px 与移动 App DOM 回退；移除地图标题和原顶部搜索／统计，接回筛选、两类名录、更多及主面板互斥。
4. [x] 用实际占用矩形协调定位、按需反馈和选点视野。保留计数、刷新名录、来源解析和关闭后的可见焦点。
5. [x] 在既有 native-glass 插件定义搜索面板专用 IPC、事件及能力握手，同步 TS/Rust/Swift 与插件命令注册／权限。保留既有按钮和菜单合同，旧插件缺命令走回退。
6. [x] 新增 iOS 26+ 原生停靠 host、输入、Liquid Glass 表面和结果列表；拖动及键盘在原生层处理，几何转换反馈给 Web。原生渲染文字与操作完整后才隐藏 DOM twin。
7. [x] 接入现有标签栏／控件抑制通道，覆盖折叠恢复、模态工具、切页、旋转、能力失败与 destroy；处理中日韩组合输入、焦点和过期事件。原生交互证据仍由下一项验收。
8. [x] 添加必要状态／桥接回归与浏览器几何测试；用现有 App DOM fixture 验证回退，不把 fixture 当原生验证。
9. [ ] 运行静态、单元与 Web/App E2E 门禁；通过 `app:*` wrapper 完成 iOS 本地构建和模拟器／设备验证，留存原生证据。
10. [x] 与实现同批更新 `components-and-ux.md` 的来源入口宽度合同及 `tauri-mobile-integration.md` 的搜索 IPC／能力边界；在 `apps/web/DESIGN.md` 的 Shapes 中记录地图搜索局部圆润形状例外，不修改全局圆角令牌。设计阶段不提前改写当前规范。

## Checks after implementation

以下是待执行命令，不是本轮通过证据；先按 `docs/development/ai-environment.md` 和测试技能准备环境。

```sh
pnpm run check:rules
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit tests/unit/pages/community/community-exchange-page.test.tsx tests/unit/pages/community/community-exchange-map-section.test.tsx tests/unit/pages/community/community-exchange-app-page.test.tsx tests/unit/pages/community/exchange
pnpm --filter @imsweb/web run test:unit tests/unit/lib/native-glass-panel.test.ts tests/unit/lib/native-glass-controls.test.tsx
node scripts/testing/run-test-owner.mjs delivery app
pnpm --filter @imsweb/web run test:e2e community-exchange-map.spec.ts community-exchange-map-attribution.spec.ts
pnpm --filter @imsweb/web run test:e2e:app app-map.spec.ts
pnpm --filter @imsweb/web run build
pnpm run app:doctor
pnpm run app devices
pnpm run app ios
```

采用仓库 App wrapper，不直接调用 Tauri CLI，不手改或提交 `src-tauri/gen/`。iOS wrapper 构建用于验证 Swift/UIKit；浏览器构建和宿主平台 Rust 检查不能证明 iOS 条件编译代码通过。Android DOM 回退需要对应浏览器 fixture 和目标平台验证；必要时用 `pnpm run app android`。发布与安装正式制品不属于任务范围。

全工作区格式化可能修改他人文件，执行前保存差异并检查结果，只交付本任务改动。测试通过后仅因新改动或未解决问题扩大验证。

## Geometry and behavior matrix

| 条件 | 必须验证 |
| --- | --- |
| 320×568、390×844 | 搜索／更多与三项工具可达，44px 目标，圆角与完整焦点环，长文案和选点摘要，无溢出 |
| 768×1024、900×1200、1023×768 | 常驻卡片连续覆盖，无旧顶部工具和成功统计 |
| 844×390、667×375 | 左侧停靠／安全高度、正文滚动、查找与取消命中、地图净空 |
| 767↔768、1023↔1024、旋转 | 入口及状态不丢失，过期 Portal／原生 host 清理，焦点恢复 |
| collapsed/editing/results/selected | 拖动与按钮替代、取消与清除区别、结果保留、地图可交互 |
| 输入／429／503／空结果／延迟响应 | 显式提交保护、恢复操作、组合文字、旧会话事件和结果隔离 |
| 1280×800 | 桌面搜索、侧栏、名录、区域详情和来源回归 |
| 地图各反馈状态与有／无 attribution | 数量含义、重试、名录逃生、来源条件与可见焦点 |
| App DOM、Android、旧 iOS、桥接失败 | 完整搜索回退，无透明原生层、无重复输入／焦点 |
| iOS 26+ 模拟器／设备 | 原生 Liquid Glass、原生输入／结果、键盘、拖动、选点、标签栏恢复、切页清理 |
| 明暗主题、系统字级、减少动效／透明度、VoiceOver | 可读、可访问，无玻璃内文本缺失或隐藏动作 |

浏览器同时检查 `getBoundingClientRect` 与 `elementFromPoint`；先验证未自动滚动时可达，再点击。设备证据记录系统版本和搜索 capability，覆盖键盘出现／消失、面板拖动／滚动、旋转、工具互斥及返回地图。真实软键盘与原生玻璃不能用桌面缩小视口代替。

## Risk and rollback

- 共享搜索状态的提取可能影响桌面；先用现有显式搜索测试保护请求与错误语义。
- 原生输入与异步模型同步必须保护 IME 组合文字；事件必须带当前呈现代次和有效结果身份。
- 搜索 host 与 map icon/menu host 分开确认能力，不能一次旧按钮同步成功就隐藏整个 DOM 搜索。选点／取消恢复到非编辑按钮，防止焦点恢复重开键盘。
- 自定义停靠 host 必须验证原生／Web 坐标、安全区、键盘和穿透区域，保持地图可操作。
- 全局导航抑制沿用已有通道，每条退出路径释放；能力失败先清原生层再恢复 DOM。
- 来源经更多进入 Dialog，结束搜索后恢复可见更多；不能依赖已经卸载的菜单项。
- Web 卡片与原生搜索可按阶段回退；共享模型保持兼容桌面，无 API/schema/data 切换。

## Planning evidence

规划阶段只验证任务记录、context 引用、规划链接与 SVG／预览。当前施工和门禁证据见 [execution.md](./execution.md) 与 [verification.md](./verification.md)。模拟器原生交互和真实键盘已有 Maestro 证据；第 9 项保持未完成，因为 VoiceOver、真实中文 IME 和跨平台设备证据仍待验证。
