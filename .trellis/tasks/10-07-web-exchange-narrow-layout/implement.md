# 跨端地图搜索实施计划

## Current input-to-submit spacing correction (R8)

用户要求所有地图查找／搜索框与提交按钮的间距调整，授权在现有任务继续施工。
采用局部12px／pt基准，覆盖Web卡片、App DOM、UIKit编辑／结果及桌面同类输入行。
先检查真正布局所有者；UIKit当前外层stack为4pt，DOM表面／动作由CSS和组件一起拥有。

1. 保存当前dirty/source/index、R7图库及所有旧失败，使用新的`search-spacing-r8`证据目录。
2. 原实现所有者调整输入行至提交行的专用间距，以及必要的最低高度／正文剩余空间计算。
   保持持续input、IME、44px／pt目标、显式提交、五标签抑制／恢复、导航宽度及R6停靠。
   Web与App DOM用同一个页面私有间距规则，桌面只调整同类输入行的局部gap。
3. 运行相关静态／单元／真实浏览器几何检查，核对normal、loading、error、empty、results、
   320／390／768／短横屏／桌面及大字号，不能以缩字、隐藏按钮或自动滚动掩盖固定操作。
4. 独立检查者用新优化Release经原wrapper构建／安装自有模拟器，验证实际UIKit间距、
   真实键盘、正常和大字号、横屏及恢复。父会话继续拥有新fixture生命周期；恢复入场状态。
5. 新原图／层级／包绑定和自包含图库分别归档，更新局部规范及任务记录。旧R7不重标为R8；
   其他R7返工发现保留其原判定，本轮不推断全任务PASS，不提交、发布或安装物理设备。

## Current tool-to-navigation gap correction

用户要求缩小标注的工具组与底部导航空白并交付新截图，已授权继续现有任务。R5 的当前
原图／层级显示 402／440pt 间距约 47pt，375pt 约 13pt；先保留这些原始证据。

1. 复核折叠底部净空和原生导航公共 frame 的坐标，避免重复安全区；目标可见间距约 12pt。
2. 原实现 owner 只调整手机竖屏收起／选点停靠及必要的局部几何回归，保留 R4 宽度和 R5
   配置字体／持续对象；原生导航仍由系统拥有。若导航几何不可用，保留可用的旧回退。
3. 新上下文产品只读检查用一次 changed-source optimized Release，在 375／402／440pt
   复核实际可见间距、正常／实时放大字号、命中与右侧净空；补一个来源／旋转相邻回归。
4. 父会话仍拥有新 fixture 的启动／状态控制／停止；检查者恢复三个设备的确切入口状态。
5. 保存新的原始截图／层级和前后对照，更新验收记录；旧 R3／R4／R5 图库保持原字节。

## Current navigation-width correction

用户最新要求上方搜索／工具组与底部导航按机型适配，已授权继续施工。按
[宽度修订](./research/apple-maps-redesign/a-navigation-width.md) 顺序完成：

1. [ ] 保存 R3 产品源码、当前文档、空 index、原图和制品绑定；核实公开 UIKit 内容边距与 DOM 导航实际几何。
2. [ ] 调整 App 浏览／选点胶囊与工具组宽度，保留原生导航所有权、普通 Web、展开／短横屏布局、字体和命中合同。
3. [ ] 执行受影响的几何、状态与桥接门禁；在 320／375／390／402／414／440 CSS px 验证 DOM 回退。
4. [ ] 新上下文独立验证 402／440pt 与可用较小原生机型的可见导航边界、选点、来源返回、大字级、真实键盘和旋转；保存新原图及恢复回执。
5. [ ] 同批更新局部设计／原生规范与交付索引。R3 的 22 张原图和既有图库保持原字节，不重标为新布局证据。

## Entry gate

用户已明确批准全部按 A 施工。先按 [新版实施合同](./research/apple-maps-redesign/a-implementation.md) 顺序执行 Web DOM、UIKit、整合和独立验证。以下旧清单保留为历史，旧宽度与旧通过项不能代替本轮验收。

真实状态几何、原始捕获和六图已保存。R2／R3／R7／R10 现按 A 更新；平板、短横屏和大字级的施工适配见新版合同。沿用 `in_progress` 状态；保护基线保存在 `/tmp/imsweb-exchange-a-implementation/`，包括源码摘要、完整差异和空 index。实施通过后更新规范、保存新运行截图与验收记录，再进行任务范围内提交。

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

## Scoped iOS follow-up

1. Expose refresh directly in both renderers, retaining directory callback ownership and removing its More duplicate.
2. Resolve native map appearance and current primary tint; align optional TS/Rust/Swift palette payloads and preserve old-payload defaults.
3. Replace nested native glass tools with semantic plain controls, add capsule/magnifier and neutral grabber, and retain 44pt targets and Dynamic Type.
4. Assign map feedback to the upper map when collapsed and the card when expanded. Preserve search feedback and recovery actions.
5. Run real component/bridge behavior tests, policy, format, lint, typecheck and build checks. Record DOM artifacts separately from new UIKit proof. Final review owns native build/install; do not install on the phone in implementation.

## Native correction checks

Verify retained search attribution and selected attribution after newer results, failures, clear and collapse; source availability without tile metadata; complete safe Dialog text; App inline removal with Web unchanged; native source return intent and modal teardown. Refresh must retain `loadFirstPage()` ownership and request-driven busy state. Check native stable button/configuration updates against installed iOS 27 SDK declarations. Run focused units, format, lint, typecheck, rules and Web build. The native reviewer owns the new simulator Release build and animation/Reduce Motion evidence; this writer does not install on the phone. Reuse unchanged successful gates with explicit provenance. Preserve the prior immutable phone package and its external locked-device launch blocker.

## Occlusion repair checks

Keep native geometry across measurement subscription, readiness, host-position and detent changes. Scope bridge changes to preserving the current snapshot across generation cleanup and acknowledging DOM fallback after native removal. Clear the frame on modal/presentation teardown or actual unmount. Run the real-hook card regression with geometry before acknowledgment and no subsequent native frame, callback replacement, modal reopening and unsupported-removal acknowledgment, together with existing card, native-search and source-return tests. Recheck affected lint/typecheck/format and documentation rules. Preserve every failed receipt and the original reviewer overlap evidence. Writer readiness requires these checks; the original native reviewer must then rebuild optimized Release and prove first-entry More center hits and locate/card clearance before continuing the remaining native matrix. Existing 86-test/seven-browser receipts remain historical evidence for their prior source; do not describe them as a fresh native pass.

## iOS visual refinement execution amendment

1. Record the approved centered collapsed/selected width `min(360, viewport-56)`
   separately from the immutable original drawings (see design amendment).
2. Refine only native dock/sheet geometry, semantic capsule styling, tool glyphs
   and scaled reading hierarchy; extend complete-asset admission and add reading
   labels through the existing dictionary. Preserve old-payload defaults.
3. Preserve input/control identity, explicit submit/cancel, selection/provenance,
   refresh ownership, live accessibility refit and renderer-owned occlusion.
4. Run focused bridge/card/lifecycle and delivery regressions plus format, lint,
   typecheck, rules and client build. Retain failures and checkpoint artifacts.
5. Parent-owned optimized Release build and actual native comparison must follow:
   346pt dock at 402pt, 360pt cap at 440pt, narrow/rotated hosts, expanded results,
   held refresh, source return, live large text and accessibility materials. Keep
   blank functional fixture; a labeled synthetic backdrop is visual evidence only.
   No visual PASS until that independent runtime review is complete.

## Risk and rollback

### Recovered native review repair

The second scoped repair is native-only: bound the idle magnifier's rendered
extent to 21pt and use measured safe-area bounds plus the existing locate
height/clearance to limit collapsed dock height. Preserve geometry events and
scroll fitting. Independent Release review must measure actual image-view/ink
bounds and largest-type 320pt dock/locate frames and center hits; source arithmetic
does not establish visual acceptance.

Repair only the remaining pale-capsule and map source Dialog findings. Keep
the verified dock geometry, font sizes, icons, native input/control identities
and lifecycle logic. Extend the source Dialog's existing safe-licensing tests
to cover both normal and explicitly admitted iOS presentation. Run affected
lint/typecheck/format/rules and source/modal tests, then return source hashes for
independent optimized Release and matched native screenshot recheck. Preserve
the recovered build/capture/failure receipts and archived wrapper icon outputs.


- 共享搜索状态的提取可能影响桌面；先用现有显式搜索测试保护请求与错误语义。
- 原生输入与异步模型同步必须保护 IME 组合文字；事件必须带当前呈现代次和有效结果身份。
- 搜索 host 与 map icon/menu host 分开确认能力，不能一次旧按钮同步成功就隐藏整个 DOM 搜索。选点／取消恢复到非编辑按钮，防止焦点恢复重开键盘。
- 自定义停靠 host 必须验证原生／Web 坐标、安全区、键盘和穿透区域，保持地图可操作。
- 全局导航抑制沿用已有通道，每条退出路径释放；能力失败先清原生层再恢复 DOM。
- 来源经更多进入 Dialog，结束搜索后恢复可见更多；不能依赖已经卸载的菜单项。
- Web 卡片与原生搜索可按阶段回退；共享模型保持兼容桌面，无 API/schema/data 切换。

## Planning evidence

规划阶段只验证任务记录、context 引用、规划链接与 SVG／预览。当前施工和门禁证据见 [execution.md](./execution.md) 与 [verification.md](./verification.md)。模拟器原生交互和真实键盘已有 Maestro 证据；第 9 项保持未完成，因为 VoiceOver、真实中文 IME 和跨平台设备证据仍待验证。
