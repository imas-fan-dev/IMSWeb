# 名片移动浏览现状

## 研究范围与证据

本记录是实现前的研究快照，保留原始代码证据与当时的环境状态，不代表当前实施进度。用户已将移动展示方向修订并批准为双列错落、条目内正反面同时展示；当前需求以 `../prd.md` 为准，进度与验证见 `../implement.md`。下文来源为初始仓库只读研究及主会话对社区入口、名片条目、交换页、测试和名片契约的核读。

## 两个公开入口

- `apps/web/app/pages/community/index.tsx:16` 定义 `/community/cards` 的“制作人名片墙”。
- 同文件定义 `/community/exchange` 的“名片交换事务所”；其入口显示受公开读取可用性影响。
- `apps/web/app/routes.ts` 将页面同时用于 Web 与 App target。不能仅凭“名片浏览”推断用户指哪一个入口。

## 制作人名片墙

- 主页面为 `apps/web/app/pages/community/community-cards-page.tsx`；页面负责列表请求、URL 分页、预览选中状态、反应和历史名片认领。
- `NamecardItem` 在 `community-cards-page.tsx:205` 开始；图片区域固定两列并排显示正反面，每面使用 `aspect-3/2` 和 `object-cover`。手机下单面可用宽度较小，非标准比例图片会被裁切。
- 页面外层手机单列、桌面多列；分页使用 `page`、`size`，每页选项为 12、24、48。当前分页操作位于列表末尾。
- 大图为共享组件 `apps/web/app/components/shared/namecard-preview.tsx:46`，不是独立详情路由。组件输入只有 `card`、`side`、`onSideChange`、`onOpenChange`，没有相邻名片导航参数。
- 仓库研究显示预览支持正反面、缩放、拖动、复位、键盘和关闭后的焦点恢复；没有双指缩放识别。具体手势改动须在实现前读取完整组件并验证冲突。
- 公开数据由 `apps/web/app/lib/api/endpoints/community.ts` 获取；`packages/contracts/src/namecards.ts:26` 定义 Namecard。数据包含两面原图/缩略图、可选企划和担当、认领状态与提交时间，不应虚构昵称、标题或统计。

## 名片交换事务所

- 主页面 `apps/web/app/pages/community/exchange/community-exchange-page.tsx` 是全视口地图工作区，手机通过底部入口打开筛选和名录。
- 移动名片名录位于 Sheet 的独立滚动区，使用游标继续加载。
- `apps/web/app/pages/community/exchange/exchange-components.tsx` 的 ExchangeCard 展示制作人、标题、担当、交换状态、说明和互动；预览使用 CoverImagePreview，与旧名片墙的 NamecardPreview 不同。
- `apps/web/app/pages/community/exchange/community-office-page.tsx` 提供事务所墙面及列表视图。
- 交换模块有自己的公开读取开关、契约和互动流程，不应作为旧名片墙视觉调整的附带改动。

## 设计与兼容约束

- 设计权威文件实际位于 `apps/web/DESIGN.md`，根目录 `DESIGN.md` 不存在；`apps/web/.rules` 的根目录指向与实际文件位置不一致，本任务不顺带修文档。
- 使用已有中性色、品牌强调色、8px 圆角与 Lucide 图标；真实名片图像承担视觉表现，不能在长列表重复加入 backdrop-filter。
- Web 与 App 共享页面；壳层负责安全区和底栏避让，页面不另行猜测固定栏高度。
- 原有上传浮动入口分别由 `apps/web/app/layouts/public-layout.tsx` 与 `apps/web/app/layouts/app-layout.tsx` 挂载，新增底部操作需检查碰撞。
- 直接相关的历史名片移动重设计任务未找到。社区动态移动端任务 `.trellis/tasks/archive/2026-09/09-03-community-updates-mobile/` 可作壳层与触控验证参考，不能代替本次产品决定。

## 已定位的测试

- `apps/web/tests/unit/pages/community/community-cards-page.test.tsx`
- `apps/web/tests/unit/components/shared/namecard-preview.test.tsx`
- `apps/web/tests/e2e/namecard-pagination.spec.ts`
- `apps/web/tests/e2e/namecard-preview.spec.ts`
- `apps/web/tests/e2e/namecard-upload.spec.ts`
- 交换区模式参考：`apps/web/tests/e2e/community-exchange.spec.ts`

以上测试尚未运行。后续计划应覆盖手机浏览布局、连续阅读、返回位置、工具栏边界、上传入口避让、空/错/加载状态和桌面回归；不得将这些建议记为已通过验收。

## 补充核查

- `apps/web/app/lib/api/endpoints/community.ts:77` 的 `getNamecardPage(page, size)` 使用 `NO_CLIENT_CACHE`，经 `namecardPageSchema` 校验与规范化返回；跨页预览应复用该门面，不新建请求接口或假定已有页面缓存。
- 生产调用搜索确认 `NamecardPreview` 只有 `community-cards-page.tsx` 一个调用点。现有测试仍应验证未传导航参数的单卡场景。
- `apps/web/tests/unit/components/shared/namecard-preview.test.tsx` 明确约束未放大时方向键翻面、放大后方向键平移、静止空白点击关闭及安全区。新导航不能改写这些键盘语义。
- `apps/web/tests/e2e/namecard-pagination.spec.ts` 验证页大小和跳页，同时断言没有可见的名片编号；视觉重设计不应重新添加可见 ID。
- 当前缩略图处理器 `apps/api/src/infra/media/sharp/image-processor.ts:118` 使用 `fit: 'inside'` 和 `withoutEnlargement: true`。`apps/api/src/domains/community/fudaba/card-media-assets.ts:12` 将缩略图约束在 600 × 400 内，保持比例和完整内容，不补边、不放大小图，JPEG 质量为 80。
- 新上传和审批时修复共用上述处理；`apps/api/scripts/migration/namecard-thumbnail-backfill.ts:210` 使用同一缩放器。既有历史缩略图可能被跳过，因此无法从当前代码证明所有历史文件均未裁切。
- `apps/api/src/domains/community/fudaba/card-media-assets.ts:108` 在缩略图缺失或查找失败时以原图 URL 回退。浏览器图像加载失败仍须由页面处理。
- `apps/web/playwright.config.ts` 默认包含 Chromium 桌面、Pixel 7 和 Firefox 桌面。`apps/web/playwright.app.config.ts` 包含 320 × 568、390 × 844、Pixel 7、844 × 390 和 WebKit，适合验证共享页面与 App 安全区。
- 现有名片预览 E2E 图片是 1px 数据图，能够验证 URL 和交互，但不能证明真实名片显示完整或文字可读。

## 规划与环境状态

入口和方案 A 已确认；完整交互边界提交最终评审，任务仍处于 `planning`。

本机 Node v24.18.0、pnpm 11.10.0 满足要求。首次 `pnpm run dev:doctor` 返回 1：Web 5173 和 Valkey 6379 被占用；API 3000 可用，Docker Compose CLI 与本地 Podman 目标检查通过。后续通过现有端口参数和 `IMS_VALKEY_PORT` 选择空闲端口，不停止现有服务。本任务尚未运行产品测试或浏览器验证。
