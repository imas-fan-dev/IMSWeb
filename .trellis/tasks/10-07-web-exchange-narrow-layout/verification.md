# 跨端搜索设计检查记录

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
