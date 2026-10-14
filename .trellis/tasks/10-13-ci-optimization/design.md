# CI 优化设计

## Boundaries

执行职责由 scripts/testing/run-test-owner.mjs、CI workflows 和 Playwright 配置共同拥有。UI 分类先改变测试选择与断言，不改变产品页面。源码审计复用限于单次执行，避免跨运行缓存失效。编译预览复用 Hono FrontendStaticAssets 与 Web route metadata，不能用通用 index.html 回退掩盖路径错误。

## Test selection

普通核心套件保持主要 Chromium 项目完整的兼容业务覆盖；次级项目只执行有明确职责的场景。扩展 UI 用例可用显式 tag 或集中可审计清单选择，核心与扩展联合应等于保留清单，禁止用运行时 skip 隐藏丢失项。装饰断言删除或从混合功能场景中移除。全域单测仍使用既有完整域 coverage 与阈值。

## Build and delivery

Web target 与 App target 分别构建，记录 candidate SHA/tree、lockfile、target、origins、工具版本与文件摘要。浏览器及交付 owner 可以接收同一候选经校验的产物；默认本地 owner 仍自行准备前置构建。错误身份、缺失文件和摘要不符均拒绝。编译静态服务不启动数据库或放行未注册 API，浏览器 fixture 继续拥有严格 JSON API dispatch。

## Candidate validation

受信任 release push 固定 head SHA/tree，并行仓库、完整域 Web/API、Web/App build、核心浏览器及交付验证，由汇总节点检查全部必需结果。PR 使用 merge tree；二者共用逻辑时保持不同身份。Web browser/integration 只依赖 Web build，不等待独立完整域 validation；消费前检查同次 run/attempt 产物身份与文件摘要。CI 汇总成功后通过 workflow_call 调用 Preview，保留原 release push SHA/ref 的 OIDC provenance。自动调用验证全部核心 validation jobs，不等待自身 publication；手动重新部署检查当前 release head 的可信 CI push 和同样的全部 job，publication 失败不清除已成功的验证证据。共享资源与发布前确认 branch head；失败、取消、缺失、跳过、fork 或错误 SHA 的检查不得发布。保留 Docker 干净构建、immutable digest/provenance、远端部署锁与现有权限边界。

## Environment and rollback

先保持既有 hosted runner 和每机一个 worker，记录 reduced core 与 compiled preview 实测。官方 browser image 或 shard 仅在必要且可验证时采用；无法验证 digest 或系统兼容性时记录延期原因。pnpm frozen install 与 store cache 保持明确版本和锁文件键。各阶段可按 scoped diff 回退，避免影响主检出目录或既有数据库状态。
