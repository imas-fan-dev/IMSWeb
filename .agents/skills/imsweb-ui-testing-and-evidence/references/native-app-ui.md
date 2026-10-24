# 原生 App UI 验收

先按 [设备交付技能](../../imsweb-app-device-delivery/SKILL.md) 与当前 `docs/development/app-device-delivery.md` 准备目标。通用边界适用于 iOS/Android；具体流程与工具由对应平台 owner 决定。

## 设备与执行所有权

- 运行 `pnpm run app:doctor`、`pnpm run app devices`；复用已经确定的任务自有 simulator/emulator/设备。记录真实标识、系统版本、profile 和来源，不写死某次 UDID、PID、二进制 hash 或工具安装路径。
- 通过 `pnpm run app ios` / `pnpm run app android` 及其文档参数构建/安装/启动。生成目录不手改、不入库。已授权本地验证不扩大成签名修改、发布、卸载/清数据或新的物理安装。
- 一个操作者控制一个模拟器。开始前记录 appearance、content size、可访问性设置、方向和已有服务；结束后恢复实际保存值，只停止本轮自有进程。
- 交换地图已有 fixture/顺序化 Maestro flows 和生产几何 runner 位于 `apps/web/tests/native/README.md`。按当前任务合同和当前源码选择流程，先满足每段初始状态；历史 native 文档或通过记录不覆盖当前改动。

## 可观察检查

- 绑定源码、构建 executable 和实际安装 executable；安装成功与启动成功分别记录。
- 输入、真实软键盘、显式提交、取消、选点、清除、Dialog/来源返回、切页/重入、横屏和 fallback 分开检查。有意滚动前先检查初始可达性。
- 实际 PNG 检查文字完整、背景/伪元素遮挡、固定按钮、44pt 目标与可见轮廓。AX 内容不证明文字实际绘制；透明 host、safe area 和整个导航 strip 不作为可见主体高度。
- 透明间隔/圆角的投递用实际点击/拖动加请求计数、map bbox/camera 或相应业务副作用证明；纯几何谓词不能代替事件投递。合成背景图不证明真实图块画面对照。
- 动画保留原始录像与连续时间点/原始分辨率帧，检查内容是否过早卸载、重入是否被旧 completion 折叠、键盘和导航是否恢复。终态截图不证明连续性。

## Reduce Motion 诊断

设置页开关与 App 读取到的公开状态是两份证据。在已有调试权限、任务自有 iOS App 进程中，可用只读 LLDB 导入 UIKit 后读取 `(BOOL)UIAccessibilityIsReduceMotionEnabled()`，立即 detach；保留设置切换前后、同一进程是否重启以及真实值。

不要把 `UIViewPropertyAnimator(duration: 0)` 当作立即完成：已观察到 iOS 27 的实际 `.duration` 为 0.2 秒，即使公开 Reduce Motion flag 为 YES。此类修复应在 `UIView.performWithoutAnimation` 内复用受状态/完成位置保护的收尾路径，并保留普通动效与中断逻辑。用新安装包的公开 flag 和实际帧复验；区分 App 面板与系统导航/键盘动效。

## 失败与范围

构建超时、安装失败、错误初始状态、断言失败和宿主环境阻塞分别保留。已有成功重试不覆盖原失败；没有终态退出码就保留 null。模拟器离线/HVF/mprotect 或浏览器下载问题先报基础设施原因，不能改产品代码或系统权限来伪造通过。

原生 IME、VoiceOver、真实 XCTest、物理设备、旧系统、真实供应方及中途打断矩阵只按实际执行声明。拉丁注入、SDK typecheck、AX 和串行重入不自动补齐这些项。
