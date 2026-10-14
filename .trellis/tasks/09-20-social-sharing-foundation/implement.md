# 社交分享基座与 Fudaba 名片分享：实施计划（待执行）

本计划以 `.trellis/tasks/09-20-social-sharing-foundation/prd.md` 为验收来源。当前只实施列表详情 Dialog 与移动端 emoji 折叠。用户已批准后续 Hono 动态 HTML 路线 A，但独立公开详情页、分享图、渠道动作和 App 原生分享不在本轮范围。

## 当前切片执行顺序

- [x] 0. 环境与边界复核：按 `docs/development/ai-environment.md` 运行 preflight；读取 Web `.rules`、Trellis Web spec 和相关单元/E2E 测试。保护工作区现有的认领改动，不还原、不格式化无关文件。本轮预计只改 Web 名片列表、详情/预览组件、导航/焦点 hook 和对应测试。
- [x] 1. 统一反应状态：从列表卡片内部抽出可由页面与详情共享的 reaction 状态和更新动作。移动端列表按数量降序显示最多 3 个只读摘要，桌面端显示全部已有反应；列表移除添加按钮和直接加反应行为。详情加载完整反应并承担添加、点击已有反应、会话单 emoji 10 次限制及错误提示。
- [x] 2. 新增名片详情 Dialog：使用列表已有 `Namecard` 数据展示正反面、提交时间、企划、担当偶像、认领状态/认领人和全部反应。移动端使用安全区内滚动布局，桌面端采用更宽布局。未登录用户不显示认领入口；可认领用户从详情打开现有 `NamecardClaimDialog`。认领提交后同步列表与当前详情状态。
- [x] 3. 调整详情和预览：列表正面、背面及 emoji 摘要统一打开选中名片的详情，不提供跨卡导航或位置指示。列表分页保持原有行为。详情图片打开全屏 `NamecardPreview`；预览只保留当前名片正反面、缩放、拖动和图片重试。焦点链为列表触发元素 → 详情 → 全屏预览 → 详情 → 原列表触发元素。
- [x] 4. 单元与 E2E 回归：覆盖移动端最多 3 个摘要、数量排序与同数稳定顺序、桌面端完整摘要、列表只读、详情完整互动、认领入口迁移、详情固定在选中名片、预览返回详情、详情返回列表位置、窄屏和桌面布局、图片及列表分页失败以及无障碍检查。更新原本直接从列表打开预览和列表反应 picker 的测试。
- [x] 5. 切片收尾：运行 Web format、lint、typecheck、相关 Vitest 和 Playwright；再运行受影响的规则与边界检查。若现有未提交改动导致无关失败，记录失败来源，不扩大修改范围。

## 验证命令与人工检查

- `pnpm --filter @imsweb/web format`
- `pnpm --filter @imsweb/web lint`
- `pnpm --filter @imsweb/web typecheck`
- 受影响的 `community-cards-page`、详情组件、预览组件与 reaction 组件 Vitest。
- `pnpm --filter @imsweb/web test:e2e -- namecard-mobile-browsing.spec.ts namecard-claim-workflow.spec.ts`，以实际 workspace 脚本支持的透传方式执行。
- `pnpm run check:rules && pnpm run check:boundaries`
- 人工检查 320×568、390×844 和桌面视口：列表摘要数量、详情滚动、嵌套预览、焦点返回、详情无跨卡控件或位置指示、列表分页、认领完成后的状态同步。

## 评审与停止门

- 此次按用户最新决定移除已实施切片的跨卡导航；其余分享阶段仍按各自审批边界实施。
- 本轮不改 contracts、API、Hono、公开路由、分享图或 Tauri 原生层。若详情所需内容不在现有列表投影中，留待公开单卡切片解决，不临时调用 owner-only 接口。
- 代码评审重点：列表和详情计数是否共用单一状态、移动端是否严格不超过 3 个摘要、嵌套 Dialog 焦点链、详情不读取相邻页且列表分页独立、认领状态同步，以及现有工作区改动是否被误覆盖。
- 回滚点是新增详情层与列表入口。现有全屏预览的缩放和双面功能应可独立保留。
