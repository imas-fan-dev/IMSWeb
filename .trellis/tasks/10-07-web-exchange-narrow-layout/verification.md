# 跨端搜索设计检查记录

## 当前交付的用户验收

用户确认：“验收通过，没有问题”。当前交付的用户验收通过，详见
[R8验收记录](./research/apple-maps-redesign/spacing-r8-review.md#用户验收)。已有独立检查、
历史失败和未运行项保持原记录；本次只补充用户结论。

## R8 输入与提交间距，2026-10-12

局部12px／pt修订完成已记录状态的独立检查。Web初始47／50、App DOM45／45通过；
三个桌面大字号过渡采样失败保留，稳定布局定向复核3／3通过，间距15px。44份已到达
展开状态的UIKit测量全部12pt，固定输入／提交／取消露出且至少44pt。三个模拟器使用
同一新优化Release，实际键盘、普通／大字号、短横屏、503／429／空结果与取消导航取证。

[R8记录](./research/apple-maps-redesign/spacing-r8-review.md) 区分508张库存、原失败和新
成功、375键盘教学页、正文阅读滚动及未证明的阅读空间预算。原图库保留，新内嵌入口为
`data/native-glass-verification/exchange-search-spacing-r8-20261012/matrix-embedded.html`。
入场应用及12份偏好逐字节恢复，三模拟器Shutdown；本轮服务真实exit0且端口释放。
旧R7返工与未运行项不变。此注记在冻结检查之后添加，任务仍`in_progress`，无提交或发布。

父会话新呈现验证exit0／5.717s：508张图在无文件基址环境逐张解码，574份文档及实际
原图／报告／层级下载哈希一致，320／390／1280px无横向溢出，外部请求和页面错误为零。
首条并发解码失败原样保留。context／差异检查exit0，规则在600s预算内125.017s完成，exit0；
回执在新归档`parent-checks-final/`。结果注记在检查之后添加，产品与捕获输入不变。

## 图库预览修复

旧图库的相对图片路径在嵌入预览中失效，file URL验证未覆盖该问题。当前入口为
`data/native-glass-verification/exchange-matrix-r7-20261012/matrix-embedded.html`。
313张内嵌PNG在无文件基址、仅允许内嵌资源的实际Chromium中全部解码；逐组破图为零，
无外部请求或页面错误。筛选、放大、390px布局及实际原图／报告下载哈希通过。三条新
命令均exit0，回执保留于`presentation-repair-20261012/`。只修复交付呈现，原图、旧失败
和产品REWORK／UNRUN不变，详见[R7记录](./research/apple-maps-redesign/matrix-r7-review.md)。

## 最新 R7 完整截图矩阵，2026-10-12

100/100 核心状态已重新采集，独立视觉结论为 REWORK。Web 40、App DOM 36、UIKit 24
正常核心布局通过；七处原生初始 footer 裁切与之后有意正文滚动的通过证明分开保留。
309 张库存原图及四张 A 方案参照已复制到新的忽略图库；135 个精选补充条目的独立判定
为 111 PASS / 17 REWORK / 7 UNRUN，不把条目或诊断图片计成新增核心覆盖。

[R7 验收记录](./research/apple-maps-redesign/matrix-r7-review.md) 保存六项发现：320px
长名称侧控件两项、原生旋转标记、深色 DOM 刷新图标，以及来源菜单和许可链接的44pt
命中面积缺证。原生间距 11.5/11.6667pt、横向误差最大1pt、独立搜索署名与关闭恢复有
当前证据。pending3→0 为源码／请求／控制推导，实时计数 UNRUN；系统深色 Dialog 与
固定浅色原生地图分开描述。VoiceOver、中文IME、其他平台和未运行行为逐项保留。

独立审计11,425项退出0，无不匹配。两个fixture已各单SIGTERM停止，账本73/77条保留；
三个模拟器的入场包、12份偏好和Shutdown已恢复。冻结2,596源文件、82个旧R6图库文件、
index和历史不变；本注记在冻结之后修改。图库为
`data/native-glass-verification/exchange-matrix-r7-20261012/index.html`，含全部报告、原图、
运行绑定、滚动及失败证据。未改产品、勾新验收、提交、发布或关闭任务。

收尾上下文和差异检查均exit0；规则在原600s预算内128.340s完成，exit0。新图库的
Chromium实际交互验证筛选、原图缩放、四张方案参照及390px无水平溢出，页面错误为零。
这些是图库验证，不重放产品测试。独立收尾回执位于图库`parent-checks/`，哈希清单为
`closing-checks-manifest.json`；本结果注记在检查之后写入，产品输入不变。

## Latest navigation-gap review, 2026-10-12

R6 scoped native PASS covers the requested smaller gap and new real screenshots. At
375/402/440pt, original pixels measure 11.50/11.67/11.67pt. Fourteen portrait comparisons
stay within 1pt horizontal error, with complete normal/live-font tools and 44pt targets.
The 440pt Source, rotation and real keyboard neighbors pass. Twenty current screenshot/
hierarchy pairs and all three current-package bindings verify.

The parent opened affected originals and copied the evidence into the new ignored gallery
`data/native-glass-verification/exchange-a-gap-r6-20261012/`. Exact scope and bindings are in
[gap review](./research/apple-maps-redesign/a-navigation-gap-review.md). Three entry package
states, twelve preference snapshots and Shutdown are restored; the exact parent fixture
is stopped with its 61-record ledger preserved. The 375 install interruption and approved
launch-only completion remain recorded. XCTest typecheck and broader unrun acceptance are
qualified separately. Task remains `in_progress`, with no commit or publication.

## Navigation-width and native-text review, 2026-10-12

The App portrait search/selection capsule and tool row now follow the visible navigation
borders. Fresh R5 optimized-Release evidence on 375/402/440pt passes 16 original-pixel
comparisons with maximum error 1pt, inside the 2pt requirement. On every model the existing
selected host displays complete 筛选/事务所/名片 through large → extra-large → large → extra-large
before Source or recreation. The 440pt real keyboard, intentionally scrolled full 44pt 更多,
Source teardown/return and portrait navigation neighbor pass.

The parent read the complete reports, opened the affected raw images and verified all 22
current image/hierarchy pairs, 2,594 runtime-source hashes and 10 fresh package files.
The [navigation review](./research/apple-maps-redesign/a-navigation-review.md) records exact
source/binary bindings and the ignored gallery with 78 originals. R4's width PASS and text
REWORK remain separate, with old failures and the R5 evidence-script failure retained.

All three simulators are restored and Shutdown; six preference snapshots and entry package
states match. The parent fixture was stopped once under verified ownership and its final
61-record ledger is saved. R5 source-target typecheck/rules and unchanged R4 DOM/static gates
retain their original provenance; no completed gates were replayed. The XCTest was not executed.
Wider VoiceOver, IME, platform and composite acceptance remain open. Task stays `in_progress`;
these later task notes do not alter the runtime product binding. No staging, commit or publication.

## Historical A review, 2026-10-11

The approved A implementation has a focused independent R3 PASS on the current optimized
iOS 27 Release. Current findings, exact scope and retained limits are recorded in
[A final review](./research/apple-maps-redesign/a-final-review.md). Earlier sections below
remain historical; their pending-native statements do not supersede this newer evidence.

Web/App DOM four-state evidence retains its source bindings. Fresh UIKit captures cover
browse, edit, results and selected states on both 402pt and 440pt devices, plus affected
keyboard/landscape/live-type cases. The parent checked 22 native capture bindings, 16 DOM
images, 2,588 source hashes, 13 artifacts and 30 Release/installed package files, with no
mismatches. Actual images and copied reports are in the ignored local directory
`data/native-glass-verification/exchange-a-r3-20261011/`; `index.html` opens the gallery.

The exact formerly clipped `更多` renders both characters. Default/re-expansion, 402pt
ordinary and one 440pt long-metadata neighbor pass; measured 44pt targets and source-return
navigation pass. Original failures and corrected preconditions are retained. Both owned
simulators are restored and Shutdown; owned jobs and fixture listeners have stopped.

The new XCTest file is typechecked only. Actual VoiceOver and broader platform/native
acceptance remain open. Historical real Pinyin UI composition exists in R1; it is not
internal marked-text instrumentation or a fresh R3 claim. Task stays `in_progress` without
new acceptance ticks, staging, commit or publication.

## iOS appearance follow-up source verification

Current follow-up: `codex/exchange-ios-polish`, base `375820be0a1989ff5d356bc707434e5a58689661`, isolated worktree `/Users/texas/Workspace/IMSWeb/.worktrees/exchange-ios-polish`. This section records the new source and DOM checks; earlier native receipts below describe the base implementation.

- 188 focused unit/policy tests passed across 23 files. Coverage includes real-card first-paint refresh in pending/empty map states, one refresh outside More, unchanged directory limits, independent busy state, feedback ownership across detents, palette contrast and bridge updates without replacing the presentation.
- Web lint/typecheck, format, Web and App client builds, root rules, workspace boundaries and App delivery-owner checks passed. The canonical `app:doctor` passed. Receipts are in `/tmp/imsweb-ios-exchange-polish/checks.json`, `final-checks-v2.json` and `closing-checks.json`.
- With `CI=1`, one worker and zero retries, Web map/attribution suites passed 29 cases, including desktop and seven narrow/short widths. App DOM suites passed 17 cases with four existing project skips; the new refresh case runs on 320px, iPhone, Android, landscape and WebKit projects.
- A further five browser cases passed atomic locate rectangle/hit checks after light, dark-document and custom-palette changes. Reviewed screenshots are `/tmp/imsweb-ios-exchange-polish/dom-app-iphone-dark-document.png` and the corresponding `dom-<project>-light.png` / `-custom-palette.png` files. These are DOM evidence, including the existing DOM tab fallback; they do not depict UIKit Liquid Glass.

Native Swift compilation and new simulator/device appearance, large-text, reduced-transparency, VoiceOver, keyboard and drag evidence remain pending final check. No phone or simulator package was installed during implementation. The prior optimized Release phone package, signing state, compatibility receipts and earlier failures remain untouched. No acceptance checkbox was changed in this follow-up.

Retained failures: an unsupported test locator option, a test assumption about CSS-hidden desktop twins, an incomplete multiline palette edit caught by format/typecheck, and an App-only API origin accidentally inherited by the first Web runner. Intermediate Web screenshots/traces are preserved under `web-origin-failure-artifacts` and `web-intermediate-failure-artifacts`. Fresh runs used corrected source and origins without sleeps, retries or timeout increases.

Recovery confirmed all 23 preserved files matched the parent SHA-256 manifest. Final locate checks passed on all five App DOM projects after each light, dark-document and custom-palette change; the reviewed iPhone screenshot shows the entire locate control above the card. The 15 `dom-app-<project>-<appearance>.png` artifacts are from that passing run. Closing lint/typecheck/policy/rules receipts also passed. No owned runner or 1420/4173 listener remained, so no process termination was needed. No unchanged gate was rerun during recovery.

## Implementation evidence supersedes planning status below

Worktree: `/Users/texas/Workspace/IMSWeb/.worktrees/exchange-map-search`; branch `codex/exchange-map-search`; base `2e546377ff3bf132828f387c75d893080b82a752`. Construction was explicitly approved; task is in progress. Earlier planning-only notes are historical evidence.

| Acceptance | Current evidence | Remaining evidence |
| --- | --- | --- |
| AC1 | Seven required Chromium widths pass rectangle/hit/overflow tests; App fallback matrix passes 14 tests with 5 declared project skips | Physical App targets remain unverified |
| AC2 | Explicit search, recenter, result preservation and clear regressions pass; pointer drag, Escape, retained draft and 1023/1024 focus transition pass | Native interactions |
| AC3 | Long-label geometry, preserved results through 429/503, empty response and map failure/directory recovery pass in browser tests | Native long-copy geometry |
| AC4 | 844×390 and 667×375 geometry passes; expanded App landscape result now fits without automatic scrolling; dark short-layout actions are hit-tested | Real soft keyboard |
| AC5 | Latest dedicated UIKit renderer compiles in wrapper build, then installs and launches on owned iOS 27 simulator, exit 0 | Native search capability/UI, keyboard, drag, selection, navigation and VoiceOver interactions unverified |
| AC6 | Bridge tests cover acknowledgment, generation/result rejection, ordered modal reopening, transient removal retry, persistent removal failure without premature DOM exposure and later recovery; Android/WebKit browser fallbacks pass | Actual Android/old-iOS targets and native runtime teardown |
| AC7 | Source focus recovery and modal hiding pass; draft survives desktop transition; native presentation generation renews after modal and UIKit tab selection removes search host | Rotation with an open modal and native teardown interaction |
| AC8 | Safe attribution parser, long names, dark theme, reduced motion, keyboard focus, target dimensions/hits and desktop workflows pass | Native VoiceOver, Dynamic Type and reduced transparency |
| AC9 | Computed 28px card, 48px/24px search and 44px round More geometry pass; CSS layers preserve focus styling; portrait, short landscape and selected-card DOM screenshots manually reviewed | Native visual review |

No acceptance checkbox is checked solely because code exists. Native compilation and App DOM browser fixtures are separate evidence. Exact commands, logs, exit results, recoverable failures and owned services are maintained in [execution.md](./execution.md).

## Historical planning artifacts

- `prd.md` 覆盖 Web 窄屏、移动 App、原生 iOS Liquid Glass 与 DOM 回退，包含 R1 至 R10 和可观察 AC1 至 AC9；Web 圆润视觉单列为 R10／AC9。
- `design.md` 记录底部伸缩卡片、显式搜索、结果与选点、短横屏、键盘、非编辑焦点恢复、原生能力与抑制所有权。
- `implement.md` 记录共享模型、Web 回退、原生 IPC／UI 的有序实施，以及浏览器和 iOS 设备验收。
- [当前布局](./research/current-layout.md)、[Apple Maps／原生搜索](./research/apple-maps-and-native-search.md) 与 [原生规范索引](./research/native-controls-context.md) 分别记录源码、官方资料和注入边界。
- [layout-wireframe.svg](./layout-wireframe.svg) 和 [layout-preview.png](./layout-preview.png) 展示 Web 折叠、iOS 结果展开及 iOS 选点后折叠。玻璃表面仅为示意，不能证明原生渲染。
- 规划检查时任务尚未启动；当前 `task.json` 已为 `in_progress`。

## Historical planning checks

| 检查 | 结果 |
| --- | --- |
| task context validate | 最终复检通过，exit 0；implement/check 各八条真实引用，无截断警告 |
| context 文件及 Markdown 相对链接 | 最终复检通过；原生规范索引相对链接已校正 |
| SVG XML／PNG | XML 解析通过，1460×1260 最终预览已重新生成；三个状态视图已人工回读 |
| `pnpm run check:rules` | 跨端方案上一轮独立运行通过，exit 0；日志 `/tmp/imsweb-map-search-plan-rules-independent.log`，退出回执同名 `.exit`；圆润修订仅检查任务文件，不重复全仓库规则检查 |

首次同步规则检查在 50000ms 超时，未记为通过。随后独立检查获得明确 exit 0；日志显示 JSON wire violations 为零，文档检查通过。任务目录的链接和上下文另行验证。

## Web rounded revision

本轮按用户意见更新 Web 示意：28px 面板、48px 胶囊搜索、44px 圆形定位／更多、圆润文字工具按钮，去掉竖向硬分隔并减淡边界。搜索交互与 App 原生方案沿用已规划行为，公共样式令牌未修改。最终预览已重新生成并人工回读；SVG XML、圆角规格、相对链接和两份八条 context manifests 均复检通过，task validate exit 0。

## Historical deferred evidence

本轮只修改此任务的规划文件和结构图。没有产品源码变更、业务请求、服务启动、Web 单元/E2E、原生构建、真实键盘／Liquid Glass／VoiceOver 验证、提交或部署。其余二十二条工作树状态仍存在，未操作其他任务的暂存和未暂存内容。

## Final implementation checks

Latest scoped lint and typecheck passed. Unit result: 25 files, 206 tests. Web Chromium result: 15 tests. Final App browser result: 14 tests, 5 declared project skips, including DOM navigation suppression/restoration. Web production build and delivery owner (2 files, 21 tests) passed. Final iOS wrapper, doctor, task manifest validation and repository rules returned exit 0. Command text, logs, cleanup and recoverable failures are recorded in execution.md.

The original Simulator screenshot shows the home screen/native tab bar. It is not evidence of native search. Simulator GUI is absent, and available simctl commands cannot inject touches/text. AC5 remains open. AC4/AC6/AC7/AC8 also retain the native or real-device evidence listed above; no complete cross-platform acceptance is claimed.

## Independent check result: BLOCKED

The check agent repaired source-dialog focus across the 1023/1024 breakpoint and
the local UIKit submit-button enablement update. A new source-focus browser test
failed before the repair and passed afterward in both directions. Stale native,
attribution and browser-evidence guidance was synchronized with the current UI.

Independent results: 25 focused unit files / 205 tests, 3 final unit files / 14
tests, 16 Web Chromium tests, 14 App browser tests with 5 declared skips, delivery
owner 2 files / 21 tests, lint, typecheck, production build, rules, boundaries,
scoped formatting and task manifest validation all passed. Commands, log paths,
exit codes and service cleanup are recorded in execution.md. The final iOS wrapper
built, installed and launched the current package on the owned iOS 27 simulator.

AC7 now has explicit browser evidence for closing the source Dialog after
1023→1024 and 1024→1023. AC1/AC2/AC3/AC9 browser evidence remains passing, and
the 320px and short-landscape screenshots were manually read. AC4's real keyboard,
AC5's native interactions and the native/physical portions of AC6/AC7/AC8 remain
open. `app:doctor` passed, but `open -a Simulator` still failed because Simulator
GUI is unavailable. The UIKit enablement fix has source/build evidence only.

No task acceptance checkbox was checked. No staged files, commits, deployment,
production requests or parent-worktree edits were made. Task stays `in_progress`.
Authoritative check report: `/tmp/imsweb-exchange-search-check-repaired.md`.

## Native interaction follow-up

Headless Maestro 2.11.0 with command-local JDK21 now provides actual UIKit evidence on
the owned iOS27 simulator. The earlier missing Simulator GUI is no longer an interaction
blocker. Native Latin editing, minimum length, explicit submit, medium/large results,
table scrolling, handle drag collapse, selection, clearing, filter/directory/source
teardown, route teardown and landscape keyboard/portrait restoration passed.
Accessibility hierarchy checks confirm one native host without the DOM card, 12pt
keyboard clearance, native navigation suppression/restoration and minimum search/action
sizes. Local synthetic responses are contract validated; no provider request was made.

Two product defects were repaired: retained attribution compressed collapsed controls
to 40pt, and programmatic native filter opening focused the DOM city field, bringing
up a keyboard over the sheet. Measured native content height and explicit App filter
title focus resolve the reproduced failures. The large action now says 缩小结果.
The mandatory keyboard-absence assertions passed after the focus repair, without
fixed waits or weaker assertions. Focused units: 10 passed; lint/typecheck passed;
both repair builds returned 0. Full evidence: `/tmp/imsweb-exchange-search-native-check.md`.

AC4/AC5/AC7 now have substantial native interaction evidence, but complete acceptance
remains open: Chinese markedText IME, VoiceOver, Dynamic Type, reduced transparency,
physical devices, Android/old iOS and native area-detail interaction were not verified.
No acceptance checkbox changed; task remains `in_progress`.

## Final gate follow-up

AC5 is now checked: actual iOS27 UIKit input, Liquid Glass, keyboard, drag, result
selection, navigation restoration and native/DOM exclusivity have passing native
evidence. Simulator GUI absence does not block this criterion. Other composite
criteria remain unchecked, including actual Android/older iOS, VoiceOver, Pinyin
markedText, reduced transparency and native area detail. The local native map fixture
contains no offices, so it provides no selectable region point for area-detail evidence.

With system appearance dark, increased contrast enabled and accessibility-large text,
native editing/results passed and the correctly initialized rotation flow passed.
Screenshots show wrapping action labels and readable native results; collapsed hierarchy
has panel [12,492][390,744], search 48pt, More 44×48pt and tool row 91pt. These
measurements cover the owned 402pt-wide simulator, not native 320pt hardware.
Settings restored to light, contrast disabled, content size large. A first rotation
attempt started with results expanded and therefore no tabs; its failure is retained.
The retry restored the documented route prerequisite without weakening assertions.

Reusable native owner instructions: `apps/web/tests/native/README.md`. Final gate
receipts and limits are recorded in `/tmp/imsweb-exchange-search-final-gate.md`.

### Firefox targeted diagnostic outcome

The private application.ini identity experiment also failed before product assertions:
smoke exit1 and the single @firefox fallback regression exit1. Same installed binary,
unchanged sandbox, real repository config/test/server owner. Logs and trace:
`/tmp/imsweb-firefox-private-gate/`. Original full-owner exit1 remains unchanged.
This reporter workaround is not a production requirement or a shipped fix. Stop at
the documented external browser environment limitation; source is ready for user
commit review. AC5 remains evidenced; VoiceOver, Pinyin markedText, reduced
transparency, physical devices, old iOS/Android and native area detail remain open.
Authoritative follow-up report: `/tmp/imsweb-exchange-search-firefox-gate.md`.

## Live Dynamic Type repair verification

Final optimized iOS simulator Release wrapper build exits 0, using the existing owned iOS 27 simulator and isolated compatibility cache. Final affected source gates pass: 38 tests across native-control scheduling, exchange-map geometry and native-search lifecycle suites; scoped format check, lint and typecheck. The App delivery owner also passes 22 tests. Prior 188-test/browser evidence is retained and was not rerun.

Six Maestro flows pass without host remount between live content-size changes: folded large → accessibility-large → large, then active native field at large → accessibility-large, cancel and direct refresh. Two additional large-text flows pass drag, collapsed restoration, native control suppression, outside-card map pan and query retention. `Shanghai` remains in the existing input; the keyboard stays visible during the live edit transition. OpenStreetMap attribution remains readable.

Measured folded search/tool/attribution heights change from 48/44/15pt to about 59/52/32pt, then return to their original sizes. At accessibility-large the card top is 533pt and native locate is `[346,477][390,521]`: its full 44×44pt bounds have 12pt clearance. Reverse transition restores card top 569pt and locate `[346,513][390,557]`, also 12pt clear. All visible locate frames across eight captures pass these bounds checks; locate is absent during editing and expanded presentation. Final screenshots were manually reviewed for clipped text and overlap.

Evidence under `/tmp/imsweb-ios-exchange-polish`: `repair4-native-build.log`, `repair4-native-terminal.json`, `repair4-native-checks.json`, `repair5-native-checks.json`, `repair-runtime-metrics.json`, eight `repair4-*`/`repair5-*` screenshots and matching hierarchies, and `repair2-affected-checks.json`. Keep the failed first-refit screenshot, overlapping intermediate locate screenshot, initial unit log, original review receipts and root-check timeout artifact. Archived untracked icon cleanup is proven by `repair-android-icons-cleanup.json`.

This repairs the verified live typography/occlusion defect. Physical phone installation/launch belongs to final review; VoiceOver, real Pinyin marked text, reduced transparency/motion, other content-size categories and platforms are not newly attested here. Current simulator preferences are restored to light, large and disabled contrast. Authoritative repair report: `/tmp/imsweb-ios-exchange-polish/repair-recovered.json`.

## Native source and motion correction: writer checks

`/tmp/imsweb-ios-liquid-glass-followup/final-checks.json` records 86 passing focused unit/source-policy tests, lint, typecheck, rules, three Web source tests and four App source-selection/refresh tests. Browser runs use one worker and zero retries. They prove Dialog consolidation, safe complete licensing, source availability without tile metadata, retained selection provenance, acknowledged native return intent, DOM modal exclusivity, and real browser focus restoration. They do not prove UIKit animation or VoiceOver. Web build passed in `writer-checks.json`; Web production sources did not change afterward.

The first focused run passed 71 tests and failed two new expectations (accessible source button name and complete error text). Subsequent small runs preserved the existing Dialog's English close name and supplied jsdom's missing layout for the visible More trigger. Original logs and `focused-unit-repair1-failure.json` / `focused-unit-repair2-failure.json` retain those failures. Final source assertions and exact return-focus checks pass with unchanged Vitest configuration and defaults.

`source-manifest.json`, `incremental-source.diff` and `current-source.diff` identify this correction against the preserved initial worktree and base `375820be`. The authored preview's footer removal was checked against its original SVG; only that removal and a trailing newline differ. Search and overview PNGs were regenerated and manually inspected, with no standalone notice. They remain research artwork.

Native compile, material/press/loading transitions, live Reduce Motion, VoiceOver More return, Dynamic Type/refit and native hit testing remain for the native reviewer on the owned simulator. The writer did not run native builds, change simulator settings, touch private native fixtures/tooling, or install on the phone. Previous immutable package/source receipts and the external locked-device launch blocker remain separate and unchanged. Wider task accessibility/platform acceptance remains open.
