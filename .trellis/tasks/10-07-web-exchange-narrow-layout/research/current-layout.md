# 交换地图当前布局源码审查

## Evidence boundaries

本记录依据用户截图和本地工作树源码。没有运行真实浏览器，也没有测量截图对应的 CSS 视口；截图尺寸不证明设备断点。以下锚点为规划时的源码位置，实施前需复核。

## Current structure

| 区域 | 当前行为 | 来源 |
| --- | --- | --- |
| Web 外壳 | `h-dvh` 固定视口、紧凑网站顶栏、地图页无页脚 | `apps/web/app/layouts/public-layout.tsx:20`、`:33`、`:43` |
| 桌面侧栏 | 从 `lg` 开始显示城市筛选、企划、名录等入口 | `apps/web/app/pages/community/exchange/components/exchange-discovery-rail.tsx:89` |
| 窄屏标题 | `lg:hidden`；标题旁有刷新，768–1023px 增加五类工具 | `apps/web/app/pages/community/exchange/community-exchange-page.tsx:789`、`:803`、`:818` |
| Web 底部导航 | `md:hidden`，五项或含来源的六项；地图、筛选、事务所、名片、来源、我的 | `apps/web/app/pages/community/exchange/components/exchange-mobile-navigation.tsx:293` |
| 地点查找 | 独立顶部按钮；展开非模态面板，选点后关闭并聚焦按钮 | `apps/web/app/pages/community/exchange/community-exchange-map-section.tsx:413`、`:439` |
| 地图状态 | 独立顶部浮层，显示区域点、更新、空结果和截断 | `apps/web/app/pages/community/exchange/community-exchange-map-section.tsx:486` |
| 地图错误 | 底部 Alert，保留旧结果、重试与查看名录 | `apps/web/app/pages/community/exchange/community-exchange-map-section.tsx:514` |
| 定位 | Web 定位按钮使用固定 `bottom-20` | `apps/web/app/pages/community/exchange/exchange-office-map.tsx:1016` |
| 名录 | 事务所/名片各打开同一 Sheet 的对应内容，1024px 以下从底部打开 | `apps/web/app/pages/community/exchange/community-exchange-page.tsx:629`、`:921` |
| 区域详情 | 1024px 以下为底部 Sheet，桌面为右侧 aside | `apps/web/app/pages/community/exchange/community-exchange-map-section.tsx:80`、`:550` |

768–1023px 存在集中效应：桌面侧栏隐藏，Web 底部导航也隐藏；操作被迁入顶部标题旁，而地图内部仍把状态与查找固定在其下。不能只修改一个按钮的 top 值解决整个区间。

## Semantics that constrain the design

- `DirectoryView` 为 `offices | cards`，不是地图模式，见 `community-exchange-page.tsx:79`、`:629`。
- 名录首次拉取事务所 limit 12、名片 limit 8，见 `community-exchange-page.tsx:524`。页首 `state.offices.length / state.cards.length` 只能解释为已加载项目数。
- 地图查询使用 limit 200，返回项按区域组展示；`groups.length` 是区域点数量，不是事务所或名片总数，见 `community-exchange-map-section.tsx:300`、`:506`。
- 当前刷新入口调用 `loadFirstPage()`；地图范围加载由 map-section 自己持有。移动刷新按钮不应擅自扩大为刷新地图。
- 地点搜索经同源代理显式提交，支持 429、503 与 OpenStreetMap 署名，见 `exchange-place-search.tsx:15`、`:51`、`:144`；不新增输入自动搜索。
- 地点搜索标记定位会 `easeTo`，并支持减少动效，见 `exchange-office-map.tsx:965`。
- 地图 attribution 从实际样式读取且仅存在时显示。已有宽度入口和焦点回退测试，见 `community-exchange-map-attribution.spec.ts:166`、`:214`、`:230`、`:243`。

## Reuse and target boundaries

- `app/components/ui/sheet.tsx` 为受控 Base UI Dialog，提供 Portal、遮罩和底部安全区。正文仍需页面自己的 `min-h-0` 滚动链。
- `app/components/ui/dialog.tsx` 有 pinned 布局；来源说明继续使用现有 Dialog。
- App 控件通过 native-glass DOM twin 与原生菜单绘制。最新范围包含 App 搜索呈现，能力边界与扩展计划见 [Apple Maps／原生搜索研究](./apple-maps-and-native-search.md)；现有 button/menu 不能直接承载输入和结果。
- 页面品牌沿用 `apps/web/DESIGN.md`：Geist/Noto Sans SC/PingFang SC、8px 基础圆角、六系列条、语义颜色；主题实现见 `app/styles/theme.css:122`。
- `design-taste-frontend` 的营销页面构图与生成图片要求不适用于此地图工具。本任务只采用其先审查再重排、保留品牌的规则；结构图是方案示意，不冒充运行截图。

## Existing verification owners

- `tests/unit/pages/community/community-exchange-page.test.tsx`：筛选 URL 与名录恢复入口。
- `tests/unit/pages/community/community-exchange-map-section.test.tsx`：区域查询、详情与窄屏 Sheet。
- `tests/unit/pages/community/exchange/exchange-place-search.test.tsx`：显式地点搜索与错误。
- `tests/unit/pages/community/exchange/components/exchange-mobile-navigation.test.tsx`：App 工具与 Web 导航。
- `tests/unit/pages/community/exchange/exchange-office-map.test.tsx`：定位和自定义 MapLibre 控件。
- `tests/e2e/community-exchange-map.spec.ts`：Web 地点查找、地图失败与名录。
- `tests/e2e/community-exchange-map-attribution.spec.ts`：Web 断点与来源焦点。
- `tests/e2e/app-map.spec.ts`：App 原生菜单 DOM 回退与焦点回归。

## Local preflight

规划初始工作树为 `release/v1.1`，有本任务之外的 staged、unstaged、untracked 修改，包括其他规划文档和 API 构建脚本删除。任务只修改自己的规划目录，不暂存、不回退这些工作。

已检查 Node `v24.18.0` 与 pnpm `11.10.0`。设计阶段未安装依赖、启动数据服务或执行业务请求；实现阶段按 `docs/development/ai-environment.md` 独立准备浏览器环境。
