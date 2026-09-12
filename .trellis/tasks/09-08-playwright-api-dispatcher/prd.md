# 建立严格 Playwright API Dispatcher

## Goal

让普通 Web Playwright 的 API mock 在请求匹配和响应 contracts 上失败关闭，避免旧 endpoint、静默 401 和缺字段 fixture 再次进入浏览器。

## Requirements

- dispatcher 按 method、pathname 和必要 query 条件注册处理器。
- contracts-owned schema 在响应进入浏览器前验证 success、HTTP error 和 business error payload。
- 未注册同源 API 请求、重复/歧义注册和错误 method/path 必须产生清晰失败。
- 真实静态资源或外部服务 pass-through 必须显式命名并说明理由。
- 提供请求记录与 body/header 查询，支持现有行为断言。
- 先迁移共享认证和高重复领域 fixture，再覆盖其余普通 Web Playwright API mock。
- 不使用 `skipContractCheck`、宽松 schema 或默认 401 吞掉请求。

## Acceptance Criteria

- [x] dispatcher 对未注册请求、歧义匹配和 schema-invalid fixture 有负向测试。
- [x] 普通 Web Playwright 的同源 `/api` mock 经过 dispatcher，例外有审查记录。
- [x] 共享 Backoffice/Platform auth、Editorial、Homepage 和 Namecard fixture 已迁移。
- [x] 浏览器测试中无 `CONTRACT_VIOLATION`、模块错误或未解释的真实 API 请求。
- [x] Chromium、移动 Chromium、Firefox 的完整 CI 模式矩阵通过。
- [x] Web lint、typecheck、unit、build 和 routing contracts 通过。

## Out of Scope

- App Playwright 的独立 runtime fixture 重写，除非共享 dispatcher 可直接复用且不改变其语义。
- 产品 API client 或 contracts schema 变更。
- 把浏览器级真实资源验证替换成全 mock。
