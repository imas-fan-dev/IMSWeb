---
version: alpha
name: IMSWeb Producer Portal
description: Chinese-first Idolmaster community portal and content operations system
colors:
  primary: "oklch(0.54 0.2 351)"
  on-primary: "oklch(0.99 0 0)"
  background: "oklch(0.995 0.002 90)"
  foreground: "oklch(0.17 0.008 270)"
  surface: "oklch(1 0 0)"
  muted: "oklch(0.96 0.005 260)"
  muted-foreground: "oklch(0.48 0.02 260)"
  border: "oklch(0.9 0.008 260)"
  accent: "oklch(0.95 0.025 348)"
  on-accent: "oklch(0.4 0.15 351)"
  admin-ink: "oklch(0.17 0.012 270)"
  on-admin-ink: "oklch(0.97 0.004 260)"
  admin-ink-muted: "oklch(0.25 0.015 270)"
  admin-ink-subtle: "oklch(0.72 0.018 260)"
  success: "oklch(0.65 0.15 150)"
  on-success: "oklch(0.25 0.08 150)"
  warning: "oklch(0.8 0.15 82)"
  on-warning: "oklch(0.34 0.08 65)"
  destructive: "oklch(0.58 0.22 27)"
  on-destructive: "oklch(0.99 0 0)"
  info: "oklch(0.62 0.13 225)"
  on-info: "oklch(0.27 0.08 230)"
  pending: "oklch(0.68 0.12 300)"
  on-pending: "oklch(0.3 0.1 300)"
  series-765: "#f34e6c"
  series-cg: "#2581c7"
  series-ml: "#ffc20b"
  series-sidem: "#11be93"
  series-sc: "#8dbaff"
  series-gk: "#f39800"
  dark-background: "oklch(0.16 0.008 270)"
  dark-foreground: "oklch(0.96 0.004 260)"
  dark-surface: "oklch(0.2 0.01 270)"
typography:
  display:
    fontFamily: Geist Variable, Noto Sans SC, PingFang SC, sans-serif
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0px
  page-title:
    fontFamily: Geist Variable, Noto Sans SC, PingFang SC, sans-serif
    fontSize: 1.75rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0px
  section-title:
    fontFamily: Geist Variable, Noto Sans SC, PingFang SC, sans-serif
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: 0px
  body:
    fontFamily: Geist Variable, Noto Sans SC, PingFang SC, sans-serif
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  label:
    fontFamily: Geist Variable, Noto Sans SC, PingFang SC, sans-serif
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0px
  data:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
rounded:
  xs: 4px
  sm: 4.8px
  md: 6.4px
  lg: 8px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  page-gutter-mobile: 16px
  page-gutter-tablet: 24px
  page-gutter-desktop: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: 32px
    padding: 10px
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: 40px
    padding: 12px
  muted-copy:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body}"
  separator:
    backgroundColor: "{colors.border}"
    height: 1px
  accent-label:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  glass-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
  glass-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  glass-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
  glass-lens:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
  glass-lens-skin:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.full}"
  glass-tab:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
  admin-navigation:
    backgroundColor: "{colors.admin-ink}"
    textColor: "{colors.on-admin-ink}"
  admin-navigation-item:
    backgroundColor: "{colors.admin-ink-muted}"
    textColor: "{colors.admin-ink-subtle}"
    rounded: "{rounded.lg}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    rounded: "{rounded.full}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.full}"
  status-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.on-destructive}"
    rounded: "{rounded.full}"
  status-info:
    backgroundColor: "{colors.info}"
    rounded: "{rounded.full}"
  status-info-copy:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-info}"
    typography: "{typography.body}"
  status-pending:
    backgroundColor: "{colors.pending}"
    textColor: "{colors.on-pending}"
    rounded: "{rounded.full}"
  series-765-swatch:
    backgroundColor: "{colors.series-765}"
  series-cg-swatch:
    backgroundColor: "{colors.series-cg}"
  series-ml-swatch:
    backgroundColor: "{colors.series-ml}"
  series-sidem-swatch:
    backgroundColor: "{colors.series-sidem}"
  series-sc-swatch:
    backgroundColor: "{colors.series-sc}"
  series-gk-swatch:
    backgroundColor: "{colors.series-gk}"
  dark-page:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-foreground}"
  dark-panel:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-foreground}"
---

# IMSWeb Design System

## Overview

IMSWeb 是面向中文偶像大师制作人社区的资料入口、活动中心与内容运营系统。界面应同时体现
系列文化的鲜明识别度和长期维护资料所需的可靠感：公开站点可以让真实品牌图片和六系列色承担
情绪表达，管理后台则保持安静、紧凑、可扫描。产品不是通用 SaaS 仪表盘，也不是营销落地页。

设计的标志性元素是六系列并列形成的色带、可聚焦的真实图像舞台墙和轻量 icon 漂浮墙。普通公开路由共享
固定于视口的低对比自由漂浮背景，并由半透明中性色内容层保证可读性；经典 Wiki、经典剧情和管理后台
保留各自独立的背景系统。色带与真实图像墙仍只用于品牌建立、导航定位或系列归属确实有意义
的位置，其余界面保持克制，让内容和操作优先。

YAML 令牌是设计意图的规范值，当前实现位于 `apps/web/app/app.css`。修改视觉令牌时应同步
更新两处；组件实现优先复用 `apps/web/app/components/ui/` 中的 shadcn Base UI 原语。

## Colors

- **品牌主色：** 洋红色 `primary` 只用于主要操作、当前状态和键盘焦点，不能铺满整个页面。
- **基础层级：** 近白 `background` 承载页面，纯白 `surface` 承载独立内容，墨色
  `foreground` 保证中文正文和数据的清晰度。
- **运营后台：** `admin-ink` 仅用于导航和工作区定位；内容区继续使用基础中性色。
- **六系列色：** 765、CG、ML、SideM、SC、学园六色表达真实系列归属。不要把任意业务模块
  强行染成系列色，也不要用这些颜色虚构数据分类。
- **语义色：** 成功、警告、错误、信息和待处理颜色只表达状态。颜色不能是唯一线索，必须搭配
  文本或熟悉的图标。
- **暗色模式：** 保持同一语义关系，提高亮色元素的可读性；不新增另一套品牌风格。

## Typography

界面统一使用 Geist Variable，并以 Noto Sans SC、PingFang SC 和系统无衬线字体作为中文
回退。标题通过字号、字重和留白建立层级，不使用装饰性字体或负字距。正文以 14px 为主要工作
字号；紧凑面板中的标题应克制，只有首页品牌主场景可以使用 `display` 尺寸。

代码、路径、ID 和原始数据可使用 `data` 等宽样式。正文字距保持 `0`。

英文大写眉题（`.eyebrow`，12px / uppercase / 字距 0.08em）是稀少的定位标签，只用于页面与
卡片开头，不得用来解释功能、堆砌气氛或替代清晰的中文标题。**眉题只能是拉丁文**：大写转换
对中文无效，正字距会拆散汉字词组。偶像大师各系列本就有官方英文副标题，直接用它们；确需
中文小标签时改用 `.eyebrow-cjk`（不转大写，字距 0.1em）。

章节标题使用 `SectionHeading`，在 `h2` 旁边携带一个等宽编号。这个编号是**档案序号**：它让
长中文页面有一根可扫描的脊柱，并强化“资料库”而非“营销页”的气质。编号对辅助技术隐藏，
不得成为标题可访问名称的一部分。

## Layout

公开页面使用最大宽度容器和清晰的纵向内容带；首页的六系列图像舞台墙可以全宽，六个系列必须
同时保持可发现，并用聚焦状态、编号和系列入口建立导航。首屏高度需让后续内容在边缘露出。后台
在桌面端使用固定导航栏加弹性内容区，在窄屏转为可横向滚动的紧凑导航，业务
数据和主要操作不得被装饰挤出首屏。

公开页面不自行声明宽度与边距，而是从 `PageShell` 的**三档阅读节奏**中选一，依据是内容怎么被
读，不是页面恰好有多少内容：

```
read     max-w-3xl   长文档、声明、单篇资料
default  max-w-5xl   常规页面与卡片栏目
wide     max-w-7xl   需要横向密度的索引页，与顶栏、页脚对齐
```

三档共用同一套边距 `px-4 sm:px-6 lg:px-8` 和纵向节奏 `py-12 sm:py-16`，因此跨路由切换时
标题不会左右跳动。`PageShell` 同时拥有 `id="main-content"`，页面不得重复声明。

间距基于 4px 单元，以 8px、16px、24px、32px 构成主要节奏。移动、平板和桌面页面边距
分别为 16px、24px、32px。固定格式的表格、工具栏、图标按钮和媒体区域应使用稳定尺寸与
响应式约束，避免加载、悬停或长中文文本引发布局跳动。

页面 section 保持无框、全宽或受约束布局。Card 只用于独立重复项、表单工具和需要明确边界的
内容单元；不要在 Card 内再嵌套 Card，也不要把每个 section 都做成漂浮卡片。

## Elevation & Depth

层级主要由背景色、1px 边界、留白和 sticky 表面建立。普通 Card 使用细环线或细边框，默认
不使用大面积阴影。Popover、Dialog、Sheet 等临时覆盖层才可使用清晰但克制的投影，并必须
保留正确的定位、遮罩、层级和键盘焦点行为。

## Materials

界面只有两种材质：**不透明的内容层**和**液态玻璃的悬浮系统层**。判断依据不是“好不好看”，
而是“它是否浮在内容之上、且背后确实有内容穿行”。

液态玻璃的完整配方是四件套，缺一不可：模糊、饱和度提升、内描边白高光、悬浮投影。只加
`blur()` 而不加 `saturate()` 会让底色发灰，那是廉价玻璃和高级玻璃的分界线；内描边高光才是
“玻璃厚度”的来源。

```
glass-blur:        16px
glass-saturate:    180%
glass-alpha-bar:   0.62 (light) / 0.58 (dark)
glass-alpha-panel: 0.78 (light) / 0.74 (dark)
glass-alpha-rest:  0.50 (light) / 0.46 (dark)
glass-highlight:   inset 0 1px 0 0 rgb(255 255 255 / 80%)   暗色降到 14%
glass-edge:        inset 0 0 0 1px rgb(255 255 255 / 55%)   暗色降到 10%
glass-accent:      当前系列色，大表面 4%、面板与控件 7%
```

可以用玻璃的表面：sticky 顶栏、页脚、Dialog、AlertDialog、Sheet、Popover、Toast、悬浮圆
形按钮与舌片导航。**不能用玻璃的表面**：表格行、长列表项、虚拟滚动网格、后台密集面板。
`backdrop-filter` 在长列表上会为每一行创建合成层，滚动时大面积重绘。内容需要玻璃质感时
使用不带模糊的变体（`Card variant="glass"`）：相同的边缘语言，零 GPU 成本。

层级用**不透明度阶梯**表达，不用描边颜色：常态 → 悬停 → 激活。玻璃的色相由当前系列决定，
在任意祖先节点设置 `data-glass-accent` 即可；首页聚焦某个系列时，全页玻璃随之换色。这是系列
归属唯一允许的环境色表达，强度必须低到不影响正文对比度。

玻璃必须降级：`prefers-reduced-transparency: reduce` 时回退为不透明表面，
`forced-colors: active` 时改用系统边框，不支持 `backdrop-filter` 的浏览器保留半透明底色与
内描边。任何情况下文字对比度都不得低于无障碍要求。

舌片导航使用**单枚透镜**：一枚药丸在条目之间滑动，而不是每个条目各画一块背景。透镜拆成两层，
`glass-lens` 负责位置，只过渡 `translate`；`glass-lens-skin` 负责材质，在每次切换时重放形变关键帧。
条目本身是 `glass-tab`，按下时缩放到 `--glass-tab-press`。App 底栏与网站顶栏共用这三个类，
因此两处是同一个控件的两种尺寸，不是两套实现。

仍然禁止：渐变光球、散景、多色霓虹背景、渐变文字，以及没有信息作用的插画。

## Motion

亮色与暗色模式只在用户主动切换时使用 500ms 的圆形扩散动画，新主题从切换按钮中心向视口最远角
展开；不支持 View Transition 的浏览器降级为 300ms 全局颜色过渡。首屏初始化和系统主题同步保持
即时，避免加载闪烁。主题图标可以同步使用轻量旋转和淡入淡出；系统启用减少动态效果时，主题切换
不得添加动画或延迟。

首页内容带进入视口时可以使用一次性的淡入与 32px 以内纵向位移，时长控制在 720ms 内；不因离开
视口而反复播放。六系列舞台的聚焦、图片缩放和控制状态不得改变布局尺寸。`prefers-reduced-motion`
启用时，首页内容与舞台信息必须立即处于最终状态，不能依赖动画结束才可见。

缓动曲线只有四条，不得写临时的 `cubic-bezier`：

```
--ease-emphasized:  cubic-bezier(0.16, 1, 0.3, 1)    入场、揭示、转场
--ease-interactive: cubic-bezier(0.22, 1, 0.36, 1)   hover、focus、按下
--ease-ui:          cubic-bezier(0.4, 0, 0.2, 1)     尺寸与展收
--ease-card:        cubic-bezier(0.2, 0.8, 0.2, 1)   卡片与媒体
--duration-fast:    140ms    --duration-ui:     240ms
--duration-reveal:  560ms    --duration-hero:   720ms
```

交互反馈统一使用 `--duration-fast`；后台列表不使用逐项 stagger 入场，避免翻页后等待数据浮现。

导航透镜的形变遵循**行程越长、拉伸越大**：切换时把跨越的格数写进 `--glass-lens-travel`，
形变幅度由 `clamp(0, 0.07 * 格数, 0.22)` 得出，相邻切换约拉伸 7%，横跨整条约 22%。形变只用
`transform` 的 `scaleX`/`scaleY`，绝不动 `width`、`height` 或 `backdrop-filter` 的模糊半径——
每帧重新模糊半透明表面是低端 WebView 掉帧最可靠的来源。首屏没有上一个格位，行程为 0，
关键帧退化为恒等变换，因此加载时不会自己弹一下。

`prefers-reduced-motion` 启用时，透镜的位移过渡、形变动画、图标回弹与按下缩放全部取消，
切换变成一次即时状态改变。

## Shapes

基础圆角为 8px，较小控件可使用 4px 至 6.4px。Badge、状态点和进度轨道可以使用完全圆角。
不要把普通导航项、命令按钮或信息块做成过度圆润的胶囊；熟悉的工具操作优先使用 Lucide 图标
按钮并提供可访问名称或 tooltip。

图片保持正确比例并展示真实内容，不使用会妨碍检查主体的重度模糊、暗化或无意义裁切。品牌
标识和系列素材只能使用已登记来源的 `apps/web/public/brand/` 资产。

## Components

- **按钮：** 主按钮只承载当前页面最重要的明确命令；次要操作使用 outline、secondary 或
  ghost。保存、发布、删除等按钮文案必须与完成后的反馈一致。
- **导航：** 公共导航以文字和底部主色指示当前页；后台深色导航可用一条对应系列色标记业务
  区域，但不能把整项染成高饱和色。
- **表单：** 使用 Label、Field、Input、Select、Textarea 和明确的行内错误。二元设置使用
  Checkbox 或 Switch，模式选择使用 Tabs 或 ToggleGroup，选项集合使用 Select 或菜单。
- **数据与状态：** 表格用于需要横向比较的数据；窄屏提供可读的降级方式。Badge 只表达短
  状态或元数据。加载、错误、空状态和成功反馈都是完整流程的一部分。
- **Dialog 与 Sheet：** 只用于需要暂时脱离页面上下文的编辑或确认。危险操作使用
  AlertDialog，并明确说明影响范围。
- **媒体：** 封面与立绘可使用 `.media-frame` 的四角取景刻痕，让图像读作“已归档的藏品”而非
  “被装饰的盒子”。悬停使用 `.media-hover` 的双层错速：外框上浮 2px，内部
  `[data-media-zoom]` 图像缓慢放大至 1.04。两层都只动 `transform`，不影响布局。
- **图标：** 使用 Lucide，尺寸通常为 16px。图标不替代不熟悉概念的文字，纯图标按钮必须
  有可访问名称和 hover tooltip。

## Do's and Don'ts

**Do**

- 优先中文界面，同时保持现有 i18n 键和语言切换能力。
- 使用真实业务内容、真实路由和真实 API 状态；先验证数据来源再设计统计或摘要。
- 复用 shadcn Base UI、语义令牌、六系列品牌资产和现有共享后台组件。
- 覆盖桌面和移动布局、键盘焦点、reduced motion、loading、error、empty 和 success 状态。
- 保持运营工具紧凑、安静、易扫描；让主要动作在重复工作流中容易找到。

**Don't**

- 不引入与偶像大师系列无关的通用 SaaS 主题、虚构指标、营销式 hero 或装饰性卡片墙。
- 不让单一洋红、紫蓝、深蓝或暖棕色系支配整个界面；六系列色必须保持平衡且有业务依据。
- 不使用渐变背景、渐变文字、光球、bokeh 或没有信息作用的插画。
- 不把液态玻璃用在表格行、长列表项或后台密集面板上；内容层用不带模糊的玻璃变体。
- 不在 Card 中嵌套 Card，不让标题、工具栏、长中文文本或浮层相互遮挡。
- 不复制外部站点、私有 Legacy 仓库或未登记来源的标识、角色图、截图和媒体资产。
