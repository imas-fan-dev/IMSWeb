# 专项测试与 Route Inventory：技术设计

## 依赖

`node-security.test.js`的36项测试共享一套数据库、listener和文件fixture。拆分必须等待`09-08-postgres-test-lifecycle`提供共享数据库生命周期，否则会复制setup或引入执行顺序依赖。

## Node测试职责

第一步只移动测试，不删除断言：

- compiled HTTP/static adapter owner保留敏感路径、raw dot segment、listener resilience、media range、streaming multipart和上传限流顺序；
- Chronicle/Event、News、Information、Fudaba和auth业务块移动到领域命名的Node integration owner，shared auth/JWT由auth owner负责；
- compiled entry/environment断言移动到`hono-app-contract`或专用compiled environment owner。

第二步逐项删除已证明重复的断言。接管owner必须覆盖相同status、raw body、headers、database和filesystem状态；不完全等价时保留两边。

## Platform测试归位

把`tests/wiki/wire-contract-conformance.test.ts`中的4个Platform profile测试原样移动到`tests/server/platform-profile-wire-contract-conformance.test.ts`。第一步可继续引用现有full-app fixture，fixture拆分另作后续重构。`test:wiki`保留3个Wiki测试，`test:server`自动发现4个Platform测试。

## Route inventory

当前机器JSON记录315 registrations、230 request-consuming routes、306 carriers和608 responses。第一批保留全部语义与诊断字段：

- freshness和`--write`只拥有`current-wire-contract-inventory.json`；
- Markdown由显式report选项或stdout按需生成，不再追踪；
- 增加CLI write/freshness和Markdown independence测试。

第二批让freshness基于稳定语义projection，去除whole-tree digest造成的无关API源码churn。route/carrier/policy/response变化仍必须使stale check失败；无关注释变化不得改变机器产物。

## 回滚

Platform移动、Node拆分、重复删除、Markdown解耦和semantic freshness分开提交。每一步可单独revert，inventory totals或route-level reconciliation变化时停止。
