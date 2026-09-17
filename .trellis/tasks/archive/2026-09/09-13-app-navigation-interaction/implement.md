# App 全局导航执行计划

状态：五栏实现与适用验收已完成，用户已回复 `ok` 批准本批次提交。实现目录为 `.worktrees/app-navigation-interaction`，按用户要求同样检出 `release/v1.1`，不另开分支。提交前核对共享分支指针与两份索引，保留原工作区改动。子代理使用 `sol` / `xhigh`。需求见 [prd.md](prd.md)，技术边界见 [design.md](design.md)，结果与限制见 [validation.md](validation.md)。

## 1. 实现前检查

- [x] 完整方案摘要已获后续用户消息批准；用户要求在当前分支创建 worktree 完成，并再次回复继续。
- [x] 通过当前会话 shell 的 `python3 ./.trellis/scripts/task.py current --source` 核对任务；来源为当前 Pi 会话。
- [x] 规划文件及上下文清单齐备，`task.py validate` 通过；implement/check 清单各 10 条。
- [x] 已读取根 `.rules`、`apps/web/.rules`、`apps/web/DESIGN.md`、前端规范和本任务研究，并确认文件所有者与行为缺口。
- [x] 已记录原工作区的并行改动。基于 `release/v1.1` 的 `8123bddcd80938b6ca39f5f19d17ef27d564f2ea` 创建独立 worktree，仅迁入本任务的规划资料，原工作区的其他差异保留。
- [x] 已执行依赖安装及 doctor 检查，端口占用和服务复用情况见 [validation.md](validation.md)。实际验证使用 App `http://localhost:1420/`、Web `http://127.0.0.1:5176/` 和 API `http://127.0.0.1:3101/`。

## 2. 五栏模型、目录和原生资源

用户在四栏验收后追加底栏名片交换地图入口。以下数量、地图归属和平台交互项按五栏重新验证，前序证据保留在 validation.md。

- [x] 修改 `app-tab-model.ts` 为 home/community/map/resources/account，并按技术方案映射所有现有 App 页面。个人工作区早于交换地图前缀，交换地图早于通用社区前缀。
- [x] 更新 App 专属翻译键及 Web fallback 图标；透镜宽度从实际标签数量派生。
- [x] 社区页仅在 App 分支增加动态入口，保留名片墙、交换地图和全国支部地图及既有可用性处理。
- [x] `/apps` 改为资料目录，复用已有链接请求和展示组件。按规范地址整理标准入口；保留带参数的预设、别名和未归组扩展链接，并测试加载、错误、重试、空目录与成功状态。
- [x] 我的页更新 App 页名及关于归属，保留匿名、受限、错误与登录工作区行为。
- [x] 将 `src-tauri/build.rs` 的原生图标复制清单改为 `house`、`users`、`map-pinned`、`book-open-text`、`circle-user`，使用已有源资源并通过构建生成平台工程。
- [x] 已同步插件 README、iOS README 和资源说明中的五栏图标清单。
- [x] `tests/tauri-build-configuration.test.js` 验证模型 ID、复制清单、PDF 和 JSON 源资源一致且有效，五项检查通过。

此阶段只改变入口归属，不临时引入第二套导航控制器。任何过渡代码都应在后续步骤合并完成后删除。

## 3. 栏目续看与统一点击动作

- [x] 实现纯导航状态辅助函数及 App 所有的协调组件，记录五栏的最近地址、窗口位置与路由提交标识。
- [x] 在栏目导航开始前保存来源快照；路由提交后更新最近地址，避免页面重置后的零位置覆盖来源快照。
- [x] Web 点击与 iOS route 事件共用激活动作：不同栏目恢复最近页，当前栏目子页回根页顶部，当前根页重选只回顶；地图根页保留视角与筛选，不执行窗口滚动。
- [x] 保留真实链接的 `href`、修饰键点击和辅助点击；原生事件只接受已定义的五个根目的地。
- [x] 移除底栏中旧的根页保存/恢复 effects。普通浏览历史仍由 Router 管理，显式栏目恢复通过 `preventScrollReset` 与 `ScrollRestoration` 配合。
- [x] 非零位置在首次定位成功后仍保留最长五秒观察，以修正后续内容增长和锚定偏移；零位置立即完成。用户操作、后续导航、卸载或期限到达时清理观察器与帧任务。
- [x] 保持 URL 参数和 hash，复用地图现有状态恢复，身份变化只清理个人路径的已保存或 pending 状态，保留公开 About。
- [x] 已覆盖首次进入、子页续看、根页重选、快速连续切换、身份变化、内容变短、错误页和用户主动滚动，无页面常驻缓存。

## 4. 返回、全屏与既有流程

- [x] 顶栏保留实际历史返回。无可用 App 内来源时以 replace 回归属根页；根页无返回按钮。
- [x] 已验证 "名片墙 → 我的 → 社区续看 → 顶栏返回" 回到我的，重选社区才回社区首页。
- [x] 地图根页用 `isNonScrollingAppRoute()` 隐藏顶栏并跳过窗口滚动；公开事务所详情仍显示顶栏并支持返回和阅读恢复。
- [x] 已核对地图全屏、安全区、Wiki 搜索、名片浮动控件及弹层抑制；浏览器与设备范围分别记录。
- [x] UIKit 实测已派发重选事件，无需修改 Swift 插件事件、外观、scene 生命周期、权限或 plist。

## 5. 检查与浏览器证据

先跑相关回归，确认行为后再跑完整质量检查。共享构建目录、类型生成、App/Web 构建与设备构建按顺序执行，不能并发争用。

已有导航单测入口：

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/components/app/app-tab-model.test.ts tests/unit/components/app/app-tab-bar.test.tsx tests/unit/components/app/app-top-bar.test.tsx tests/unit/lib/app-shell-scroll.test.ts tests/unit/layouts/app-layout.test.tsx tests/unit/components/navigation/navigation-link.test.tsx tests/unit/lib/native-glass.test.ts tests/unit/lib/native-tab-bar-suppression.test.ts
```

新增的状态、协调组件和目录测试一并加入聚焦运行。测试通过真实用户动作验证导航结果，原生分支的 mock 只能证明 JS 处理。

新增或扩展 `tests/e2e/app-navigation.spec.ts`，沿现有严格 API dispatcher 写 fixture，验证：

- 五栏顺序与选中状态；从底栏直接进入交换地图，从社区到动态、名片墙和地图，从资料到 Wiki 与剧情。
- 名片墙非第一页、已滚动 → 我的 → 社区：地址参数与原位置恢复。
- 资料子页 → 其他栏目 → 资料：恢复正确页面；重选资料回 `/apps`，再重选回顶且历史长度不变。
- 数据延迟到达、连续快速切换、用户在恢复期间主动滚动、数据变短与请求失败。
- 直接链接的归属和返回落点，正常历史返回，跨栏目后按实际历史返回。
- 地图切出再返回保留状态，地图根页重选保留筛选、视角和历史；公开事务所与社区阅读独立，个人工作区仍归我的；名片预览关闭后的定位和焦点；Wiki 转盘与搜索保留边界。

聚焦浏览器检查后运行完整 App 浏览器回归：

```sh
pnpm --filter @imsweb/web run test:e2e:app
```

覆盖 `app-small`、`app-iphone`、`app-android`、`app-landscape`、`app-webkit`。使用已运行的 App 预览时按配置提供 `E2E_APP_BASE_URL`。截图在启动遮罩透明或移除、数据和布局稳定后采集；不能仅凭底栏可点击判断遮罩消失。

常规质量检查：

```sh
pnpm --filter @imsweb/web run format
pnpm run check:rules
pnpm run check:boundaries
pnpm run check:web
pnpm run test:infra
pnpm --filter @imsweb/web run build:app
```

`check:web` 已包含 lint、typecheck、全部 Web 单测和普通 Web 构建，不无故重复。格式化后核对 diff，剔除本任务引起的无关格式变动，保留原有用户修改。

普通 Web 的社区页及共享导航解析器须有回归证据；必要时通过 `pnpm run test:web` 运行相应所有者套件。若实施触及路由清单、路由所有权或交付回退边界，另跑 `pnpm run test:web-routing`，不能用它替代 App 交互测试。

## 6. 原生验证

先检查可用环境与目标：

```sh
pnpm run app:doctor
pnpm run app devices
```

模拟器或模拟机验证均沿仓库 wrapper：

```sh
pnpm run app ios
pnpm run app android
```

目标不唯一时指定 wrapper 支持的 `--device`。不直接调用 Tauri CLI，不手改 `src-tauri/gen/`，不配置发布签名；本轮不需要真机 Release 分发。

- [x] iOS 27 自包含 Debug 包显示五栏 UIKit 控件及正确图标，资源清单与五个 ID 一致。
- [x] XCTest 实际点按验证续看、当前栏目回根、根页重选回顶，以及地图根页重选保留状态。
- [x] 嵌套弹层引用计数通过单测；iOS 实际预览验证原生栏隐藏、关闭后恢复，横屏预览也通过。
- [x] 地图成功态竖横屏布局及 Wiki 外层通过浏览器回归；两端实包验证地图未开放全屏状态、名片续看和预览，未把 API 404 写成原生在线地图成功。
- [x] Android Debug 包已验证五栏、系统安全区、硬件返回、动态页进入/退出及横屏边界；未新增系统返回处理器。
- [x] 设备、构建、操作、截图和结果已记录。默认 iOS 优化 Release 的上游链接问题仍保留，不影响本轮默认 Debug 验收。

## 7. 全范围复核与收尾

- [x] 四栏版本的 `sol` / `xhigh` 全范围静态复核已完成且无新发现，见 [最终复核](research/final-review.md)；五栏追加改动也已复核且无发现，见 [地图入口复核](research/map-entry-review.md)。
- [x] 已同步五栏、续看、身份变化、返回和滚动恢复约定，并更新 Web README/DESIGN；权威契约为 `.trellis/spec/web/frontend/app-navigation.md`。
- [x] 最终文档规则、边界和 infra 在同步后的 `7f38ec65` 基线上通过，导航源码未变，保留已通过的 1105 项单测、完整浏览器及两端实包证据。
- [x] 已逐项填入 PRD 验收结果，浏览器、JS 原生 mock、实包与本地地图数据限制见验证记录。
- [ ] 按仓库收尾规则只暂存并提交本任务文件。提交前核对 diff，保留发布说明脚本原有修改；有未解决验收项时不声称全部完成。
- [ ] 记录提交、证据、保留的运行服务和必要后续事项，再处理任务归档。

## 回滚点

模型、底栏与原生资源清单需要作为同一组回滚，避免数量或图标不一致。导航协调层可随调用点一起撤回，恢复原有路径跳转；目录使用原有 URL，无数据迁移需要回退。任何回滚只处理本任务产生的差异，不能恢复整个工作树。
