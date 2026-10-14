# iOS Liquid Glass 本地原生验收

本轮独立原生验收结论为 `pass`，范围是来源 Dialog 收束、原生按钮动效与定位遮挡修复。它不代表整个跨平台任务已经完成，也不代表 GitHub CI 已增加原生 UI 验收。

## 设备与构建

验收使用 iOS 27 的 iPhone 17 与 review-owned iPhone 18 Pro 模拟器，两者都是 402×874 pt、@3x，原图为 1206×2622 px。同一份优化后的 Release 二进制安装在两台模拟器上。构建通过仓库 `app:*` wrapper；保留已有私有构建工具兼容性适配及其来源记录。

源码基于 `375820be0a1989ff5d356bc707434e5a58689661`，分支为 `codex/exchange-ios-polish`。审查时的 tracked diff SHA256 是 `6f776f5cadf3b4901432a7bab818179ee39183d5105ab7181a17f51af657d695`。父代理回读确认该 diff 未改变、暂存区为空，九项原始验收文件的 hash 均与审查记录一致。

完整审查记录见 [review.json](./review.json)。实际截图和未裁剪录屏保存于当前 worktree 的 ignored `data/native-glass-verification/20261008/`，与 `research/ios-device-preview/` 下的绘制设计图分别保存。原始完整证据保留在 `/tmp/imsweb-ios-liquid-glass-followup/`。

## 已通过的检查

- 首次进入地图时，定位按钮为 44×44 pt，位于底卡上方且保持 12 pt 间距；直接点击“更多”中心可以打开菜单。
- 刷新按钮在按下、请求挂起和请求完成后保持相同原生对象与 44×48 pt bounds。UIKit activity indicator 在真实刷新请求期间显示并运动，释放 fixture barrier 后恢复；重复激活不增加请求。
- 活跃刷新期间切换“减少动态效果”，原生加载动画停止，静态忙碌状态、禁用态与辅助功能文字保留；关闭该设置后动画恢复。
- 已载入地图样式、当前搜索结果与保留选中地点的来源在现有 Dialog 中完整呈现。独立 App/native 署名消失，无地图样式来源时仍能访问搜索授权信息。
- 关闭 Dialog 后原生控件恢复，实际 UIKit layout-change 通知指向“更多”，键盘不重新出现。此证据不等于 VoiceOver 语音或焦点遍历验收。
- 动态字号实时增大时底卡重新适配，选中状态与定位按钮间距保留。路由离开、再次进入及 Dialog teardown 均通过。

## 截图与录屏

保存目录内的主要文件：

| 文件 | 内容 |
| --- | --- |
| `occlusion-first-screen.png` | iPhone 17 首次进入地图 |
| `occlusion-18pro-first-screen.png` | iPhone 18 Pro 首次进入地图 |
| `occlusion-source-dialog-screen.png` | 已有授权 Dialog |
| `occlusion-selected-live-large-screen.png` | 选中状态下实时增大字号 |
| `occlusion-18pro-no-tile-dialog-screen.png` | 无地图样式来源时的搜索来源 Dialog |
| `occlusion-refresh-motion.mp4` | 按下、加载、减少动效切换及恢复的完整录屏 |
| `occlusion-source-motion.mp4` | 来源与选中状态流程录屏 |
| `preserved-artifacts.json` | 保存位置、源版本与文件 hash |

刷新录屏长约 8 分 46 秒，完整分辨率为 1206×2622。按下动作约在 21 秒，加载动画约在 50 秒，减少动效下的静态忙碌状态约在 385 秒，恢复后的待机状态约在 523 秒。数据为受控、经契约校验的 fixture；空白地图背景是验证样式，不能作为真实 provider 地理数据或生产服务证据。

## 验收边界

修复执行了四个文件的 16 项针对性测试及 lint、typecheck、rules 与格式检查。此前 86 项针对性测试、七项浏览器回归仅作为输入未改变部分的既有证据，未被称作本次重新执行的全量验收。

未覆盖真机、iOS 26、Pro Max、生产 provider、VoiceOver 语音与遍历、真实拼音组合输入，以及原生运行中的桥接失败注入。原始 geometry/capability IPC 时序没有被直接记录；回归测试与修复后的首次进入行为支持生命周期分析。

本轮没有手机安装、发布、合并、提交或推送。模拟器设置已恢复，验收服务与录屏进程已停止，新建的 iPhone 18 Pro 模拟器已关闭。此前手机上的 Preview 包及锁屏造成的启动待核验状态保持原样。
