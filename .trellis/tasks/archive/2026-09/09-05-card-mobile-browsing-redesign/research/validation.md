# 最终验证记录

## 当前交付

当前实现包含自然双列、整体 Card、两行分页、悬浮区避让及本地统一反应图形。R7 将移动反应区缩为 16px 图形、12px 计数、每行最多 4 项（含加号），保留 44px 触点；R8 将时间改为北京时间 `MM-DD HH:mm`，保留完整年份/秒数与 ISO 数据。任务未全部收尾：原生旋转组合用例仍未通过。用户已授权将本任务待提交改动合为一个工作提交，未授权把该问题记为解决；任务保持 `in_progress`，暂不归档。

两端局域网 Release 安装另见 [设备交付](device-delivery.md)，不能用下面的浏览器结果代替真机安装结果。

## R7/R8 最新检查

| 检查 | 结果 |
| --- | --- |
| `pnpm run check:web` | 168 文件、982 项单测，ESLint/typecheck 与 client/SSR 构建通过 |
| 相关 Web E2E | Chromium desktop/mobile、Firefox 共 54 项通过 |
| App E2E | 五视口共 10 项通过，包含分钟时间语义、边界、反应密度与分页命中 |
| iOS 模拟器竖屏 | `run-15` 的 `testNativeGalleryAndPagination` 通过：分钟时间、46 项选择器、键盘跳至第 3 页、预览切面/切卡/返回、4+2 反应排布、24 张选择及上传恢复 |
| 包一致性 | 模拟器构建前后源码哈希一致，见设备交付记录；本轮未操作真机 |

日志位于 `data/qa/namecard-mobile-results/`：`check-web-r8.log`、`r8-web-final.log`、`r8-app-final.log`、`r8-ios-simulator-build.log`。原生结果为 `data/qa/namecard-simulator-tests/run-15.xcresult`，只选择了竖屏用例，不代表全部原生测试通过。

已打开检查 `r8-ios-native-compact-reactions.png`、`r8-ios-native-keyboard.png` 和 `r8-ios-native-size-24.png`：时间例如 `08-22 01:48`，首行 4 项，键盘不挡跳转，24 张切换后回到首页。浏览器检查覆盖 320px、大计数、日期与图像/反应区分离、午夜和跨年语义。

### 未解决的原生旋转组合

键盘跳页后打开预览，再横屏、竖屏、关闭的组合仍有失败。R7 `run-14` 中，首图框正常为 181x121，但日期框从初始 y420 变为 y359 且不可命中；截图曾显示日期被图像遮住。结束测试后直接 `simctl` 截图又显示正常布局。原因未确认，不能仅归为测试误报，也不能宣称已修复。

尝试的 Card `height:max-content` 与测量前撤除旧轨道均未解决，已撤回。保留独立 `testRotationAfterKeyboardJump` 继续追踪；R8 的通过记录仅为未旋转的竖屏流程。原生插件和签名策略没有修改。此前输入框失败另由等待第二页数据和控件存在修正，不能与旋转问题混为一谈。

## R6 历史检查

| 检查 | 结果 |
| --- | --- |
| `pnpm run check:web` | ESLint、typecheck、168 文件共 979 项单测及 Web client/SSR 生产构建通过 |
| 聚焦单测 | 9 文件共 148 项通过；包含可见性生命周期、时区跨日、完整日期语义、资产允许列表/文件/哈希和错误占位 |
| Web 相关 E2E | 51 项通过，覆盖 Chromium desktop/mobile 和 Firefox |
| App 相关 E2E | 五视口共 10 项通过，包含启用控件九点命中、分页进入/退出与 46 张本地图形加载 |
| 静态检查 | 受影响源代码/测试 Prettier、零警告 ESLint、4 个生产文件 LSP 及 session error 检查通过 |
| 规则 | 4 个规则范围、812 个生产文件、24 篇治理文档通过 |
| 真机交付 | iOS/Android 当前 Release 均安装；Android 启动并验签/核对手机 APK，iPhone 因锁屏未自动启动 |

日志为忽略目录中的 `check-web-r6.log`、`r6-unit.log`、`r6-web-final.log`、`r6-app-final.log`、`r6-rules.log`。这不是完整 `test:web` 浏览器套件重跑，文末限制仍然成立。

修复前在 App 390x844 实测：每页数量控件中心命中返回顶部，下一页中心命中上传按钮。修复后，分页进入视口时悬浮区隐藏，退出或卸载后恢复；测试只对启用控件执行命中断言，避免把禁用按钮的 pointer-events 行为误判为遮挡。两次初始图片断言失败来自 DOMRect 的小数舍入，实际 20px 图形可测为 `20.000015258789062`；尺寸断言采用小于 0.1 CSS px 的容差。

已打开检查 `r6-live-gallery.png` 与 `r6-pagination-320.png`：真实数据列表显示短日期和统一图形，窄屏分页没有悬浮区覆盖。320px/390px 的日期边界实测均在 Card 内。Android 截图确认前台首页与原图读取，完整真机分页交互未独立验收；iOS 原生画面等待解锁确认。

AC6、AC8 和 AC11-AC13 已按以上证据验收。自动实现进程超时后，父会话审阅了磁盘改动并独立完成这里记录的验证。

## 上轮检查

| 检查 | 结果 |
| --- | --- |
| `pnpm run check:web` | 通过：ESLint、typecheck、166 文件共 903 项单测、Web client/SSR 生产构建 |
| Web 相关 E2E | Chromium desktop/mobile、Firefox 共 51 项通过 |
| App 相关 E2E | small、iPhone、Android、landscape、WebKit 共 5 项通过 |
| 分页交互单测 | 页面 21 项通过，含 Enter、Escape、原页禁用、非法输入和 URL 同步 |
| 独立分页浏览器检查 | 三浏览器各两项，共 6 项通过；新页起始名片进入视口 |
| Card / 自然排列阶段单测 | 6 个聚焦文件共 69 项通过，后续新增分页用例纳入全量 903 项 |
| 格式化 | 受影响源文件和测试经 Prettier 格式化；未保留无关格式化改动 |
| LSP / session diagnostics | 22 个已诊断文件无错误，包含本任务源文件和测试 |
| 规则与上下文 | check:rules 通过：4 个规则范围、810 个源文件、24 篇文档；Trellis 的 7 项 implement / 6 项 check 清单有效，git diff --check 通过 |

最新日志位于忽略目录 `data/qa/namecard-mobile-results/`：`web-pagination-final.log`、`app-pagination-final.log`、`check-web-pagination.log`、`pagination-unit.log`、`pagination-interactions.log`。前序 `web-framed-final.log`、`web-natural-final.log` 等保留为迭代记录，不与最新计数混用。

```sh
E2E_BASE_URL=http://127.0.0.1:5181 pnpm --filter @imsweb/web run test:e2e namecard-pagination.spec.ts namecard-preview.spec.ts namecard-upload.spec.ts namecard-mobile-browsing.spec.ts activity-cover-preview.spec.ts namecard-claim-workflow.spec.ts --grep 'namecard-mobile-browsing|namecard-pagination|namecard-preview|namecard-upload|namecard images|registered user submits a legacy-card claim' --workers=2
pnpm --filter @imsweb/web run test:e2e:app app-namecard-browsing.spec.ts
pnpm run check:web
```

## 验收证据

| 验收项 | 证据 |
| --- | --- |
| AC1 | 320/390/Pixel 7 下双列同顶，每列按实际高度累计且保持 12px 间距；等高、异步 emoji、宽度变化及 48 张高内容压力检查通过 |
| AC2 | 5 项缩略图单测覆盖一次原图回退和终态错误；横竖 PNG 带四色边角，验证 contain 和点击背面打开背面原图 |
| AC3、AC4 | 导航 hook 17 项及跨页、重试、关闭后晚到响应、重开预览浏览器回归 |
| AC5 | 返回 hook 8 项及 Web/App 真实滚动、URL、触发控件焦点恢复 |
| AC6 | 保留 12/24/48、跳页、URL 和其他参数；移动分页约两行、5 个实际控件均至少 44px，Enter 提交、Escape 取消、新页起始内容可见 |
| AC7 | 完整 46 项反应选择、计数、公开墙认领及上传回归；大量计数和状态不被裁切 |
| AC8 | 320x568、390x844、Pixel 7、844x390 和 WebKit；安全区、控件间距、两行分页及无横向溢出 |
| AC9 | 单 Dialog、原有方向键/缩放平移/关闭、无障碍标题及 axe 回归 |
| AC10 | 真实图片的移动亮暗色与桌面截图；每个对象的背景、8px 外角及容器边界通过浏览器检查 |

截图包括 `mobile-card-framed.png`、`mobile-card-framed-dark.png`、`desktop-card-framed.png`；分页最终截图为 `pagination-final-320.png` 与 `pagination-final-390.png`；已实际打开检查，两种宽度均为 109px 高、两行分组且无控件重叠。App 各视口附件也保存在 QA 目录。普通首屏下两列可等高，不能把自然对齐误判为未实现独立排布。

## 问题与防回归

### 浏览器网格容量

根因属于隐含假设与测试缺口：1px 隐式行把整页像素高度转换成轨道数量。Firefox 在 320px、48 张名片、每张 11 种六位数计数时，末尾 22 个同列间隙重叠，最小间隙约 -766px；此前 12 张首屏检查未覆盖该上限。

现按名片顶底边界生成显式轨道，轨道数不超过 `2 * 名片数 - 1`。单测验证高内容的轨道上界，三个浏览器验证 48 张名片无重叠和末项/分页分离；规范记录在 `components-and-ux.md`。没有增加库或重排 DOM。

### 分页可访问名称

真实浏览器会在拆分的标签文本之间插入空格，和单测 DOM 的名称计算不同。每页数量控件显式保留 `aria-label="每页显示"`，浏览器回归验证真实名称；几何检查排除 Base UI 1px 离屏表单镜像，避免将其误当触控目标。

### 预览与弹层

反应弹层的 Firefox 碰撞定位问题仍由本地取消动画处理，并检查最终 opacity=1 和 44px 尺寸。大图标题通过 sr-only ID 保留旧无障碍名称，可见标题不显示数据库 ID。

## 全量 E2E 限制

早先完整 `pnpm run test:web` 浏览器结果为 204 通过、24 跳过、45 失败，发生在预览兼容修正之前。此后重跑的是本任务相关用例，最新 54 项全通过；没有再次运行整个浏览器套件，不宣称全量 E2E 全绿。

未修改的 `0ba9639d` 临时工作树曾复现部分活动页标题和交换区空信封失败，但该环境另有资源 403，使结果达到 130 通过、24 跳过、104 失败，不能作严格等价对照，也不能据此判定所有失败均为同一原因。临时基线服务和工作树已经删除；未越界修改首页、后台或交换业务。

## 环境

用户要求的当前观察地址为 `http://127.0.0.1:5173/community/cards`，页面和 API 已确认返回 HTTP 200；5181 已关闭，上面的历史测试命令保留当时实际端口。另有 LAN Web `http://192.168.31.169:5183/community/cards` 供真机公开链接使用。复用现有 API 3000 和媒体 9000，不重建或修改数据库、缓存、对象存储服务。构建和 Web/App 浏览器矩阵串行运行，以避免开发服务器元数据热更新干扰。
