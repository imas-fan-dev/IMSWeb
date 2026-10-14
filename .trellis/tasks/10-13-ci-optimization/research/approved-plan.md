# 已确认计划与恢复依据

用户在完成 CI 审计后要求将高维护 UI 检查缩减放到第一阶段，随后明确要求独立 worktree/分支开始开发，并于本轮要求继续。原 /tmp 计划和原始大日志已不存在；本文件按会话记录恢复已确认范围，不能把历史测量冒充当前工作树实测。

历史成功 db2b4f12：CI 37624457986，Preview 37624446523。CI 总24m43s；Web job24m17s、E2E17.4m（140 passed/11 skipped）、单测241.69s（225文件1586用例）；repository10m37s，其中 root270s、治理约280s；App5m21s、浏览器208s；API2m35s；integration1m25s。Preview32m16s，其中 check600s、test931s、Docker82s、deploy60s。目标 CI≤15m、Preview≤18m 尚未验证。

assertWireContractAudit 和 formatWireContractAudit 先后调用均 collectWireContractAudit，重复构建 TypeScript Program。单次结果复用须保持所有诊断和规则。当前 smoke 已通过 required-success response 等待修复，保留该基线。

UI 候选包括 home-layout-geometry 的 motif 数量和动画几何，public-feed-layout 的跨页精确几何相等，story-cover-assets 的精确封面比例，glass-material、stylesheet-layers 及普通 Tailwind class-list 断言。文件中功能、点击可达、溢出、键盘与 focus 场景要逐项判断，不能整文件排除。

机器敏感边界按页面 required response 与可见状态、mounted reaction busy 完成、认证/list后图片decode、有限动画完成、点击新状态、fixture停止新工作并等待已接管工作、server/pool/allocator所有权顺序处理。不得重试、固定等待、扩大次数或统一 timeout。

Web 原使用 Vite dev，App 已使用编译 build-app/client 静态策略。Web 编译 preview 要复用 Hono FrontendStaticAssets 和 route metadata，区分 prerender、SPA 与 server-owned none。127.0.0.1:65534 是故意不可用后端陷阱，不代表基础设施故障。

Preview 曾与 CI 独立运行并重复 check/test，不能保证浏览器验收。PR merge tree 与 release head 不能互换。互斥锁不保证版本新鲜度，保留锁并在共享构建和发布前检查 branch head。镜像 digest/provenance 及数据库隔离不得降低。首轮 Docker 干净构建保留。
