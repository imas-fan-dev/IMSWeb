# 全项目测试治理收敛：技术设计

## 1. 设计目标

本任务把测试体系中的重复实现和隐式行为改为有单一所有者、可失败关闭且可独立验证的边界。治理工作不得改变业务代码行为、HTTP wire contracts 或页面 UX。

## 2. 工作包边界

### 2.1 PostgreSQL 测试生命周期

共享核心负责：

- 解析和校验测试管理员连接 URL；
- 判断集成测试是否被显式启用或在受支持的 CI 环境中可用；
- 创建隔离数据库、应用迁移、派生额外连接并可靠清理；
- 提供可选的 canonical Fudaba agency seed，而不让通用生命周期依赖具体业务 fixture。

Node `TestContext` 自动清理和手动 `close()` 两种调用方式可保留薄适配器，但数据库命名、连接选项、安全校验、迁移和删除必须共享同一核心。回环地址限制继续失败关闭。

### 2.2 API 测试辅助层

只抽取已经由多个调用方共同依赖的稳定语义：

- HTTP 原始 JSON 读取与 contracts schema 验证；
- Backoffice/Platform 认证 cookie、CSRF 和会话组合；
- 迁移与 Fudaba canonical fixture。

业务专用断言留在所属测试。新 helper 不接受用于切换无关业务的模式参数，也不建立 catch-all `helpers.ts`。

### 2.3 Web Playwright HTTP dispatcher

建立一个测试专用 dispatcher，统一接管页面请求：

1. 测试注册 method、pathname、可选 query 约束和 contracts schema。
2. dispatcher 在返回响应前解析 fixture，并记录请求。
3. 未注册的同源 API 请求、method/path 不匹配或 schema-invalid payload 立即产生可诊断失败。
4. 明确声明的 pass-through 只用于字体、地图或真实静态资源等浏览器级验证，并必须有名称和理由。

现有领域 fixture 逐组迁移，不在一次机械替换中改写全部测试。

### 2.4 路由元数据和脚本 taxonomy

前端路由元数据以 `apps/web/app/routes.ts` 可解析的规范化描述为源，测试、预渲染和静态 fallback 清单从该源派生或通过同一校验器读取。不得再维护内容相同的手写数组。

脚本按以下职责归属：

- governance：源码、文档、workspace 和 CI 配置规则；
- contracts：wire ownership、entrypoints、非 JSON 边界和 mounted inventory；
- api：unit、integration、HTTP、migration、assets；
- web：unit、e2e；
- delivery：App、静态客户端和 frontend routing；
- root：薄编排器，只调度上述 owner。

根、API和Web package script已经达到治理上限，且规则明确禁止`test:all`。脚本改名或目录移动必须在同一变更中替换已有入口，或使用非package内部runner过渡；确认所有CI、文档和治理测试已切换后再删除旧入口。集成lane的独立构建在没有跨job artifact传递时继续保留。

### 2.5 专项测试与 inventory

`node-security` 只保留 Node 构建产物、listener 启动和共享 HTTP 适配器的安全边界。被 architecture、source rules 或 contracts compiler gate 覆盖的静态检查由各自 owner 执行。

Platform 测试移动后保持测试名称和断言，只改变所属目录、聚合入口和引用路径。

route inventory 保留一个语义化机器可读产物。Markdown 由生成命令按需输出，不参与 freshness 比较；审查和文档链接指向生成命令及机器产物。

### 2.6 R2 字体 CORS

生产字体由 `imsweb-media-public-prod` 和 `imas-assets.texasoct.tech` 直接交付。测试检查点使用 `imsweb-media-public-test` 和 `test.imas-assets.texasoct.tech`；同一个字体对象已存在。修复所有者是bucket CORS policy，不通过Web代理字体，也不修改生产字体常量指向测试域。

远端操作分两段。第一段只对测试桶执行读取、完整快照、候选策略、控制面readback、明确授权的精确URL purge和隔离浏览器验证。测试证据提交后停止。第二段必须获得新的生产授权，随后在生产桶重复相同步骤；只有生产URL成功后才能移除Playwright `fixme`。

## 3. 数据流与失败模式

### 3.1 PostgreSQL 测试

```text
env/CI policy -> URL safety validation -> admin connection -> isolated database
-> migrations -> optional domain seed -> test connection(s) -> forced cleanup
```

URL 不安全、PostgreSQL 不可用或迁移失败都必须给出明确结果。禁用时通过 Node test skip 表达，不允许在测试体内静默返回。

### 3.2 Playwright fixture

```text
page request -> dispatcher route match -> request contract/assertion
-> typed response builder -> response schema parse -> browser
```

dispatcher 保存请求记录供行为断言使用。响应 fixture 在进入浏览器前已经满足 contracts schema，因此页面中的 `CONTRACT_VIOLATION` 代表生产调用或测试注册错误，而不是被吞掉的 mock 漂移。

### 3.3 R2 字体

```text
test bucket snapshot -> candidate CORS -> control-plane readback
-> test custom-domain HTTP -> isolated browser font load -> stop for review
-> separate production approval -> production snapshot and CORS
-> production HTTP -> product browser font load -> remove fixme
```

每个检查点同时检查HTTP header和`document.fonts.load()`，避免只修改配置但命中旧缓存。测试桶成功不能替代生产验收。

## 4. 兼容与迁移策略

- 每个工作包先添加新 owner 和负向回归，再迁移调用方，最后删除重复实现。
- 目录和脚本移动保留短期兼容入口，最终集成前移除不再需要的别名。
- 断言删除必须在提交说明中指向接管该不变量的测试或静态门禁。
- generated inventory 迁移以语义内容完全一致为前提；无法对账时不删除旧产物。
- 当前R2授权只覆盖测试桶。候选策略先在测试桶收紧并验证；生产桶写入需要后续单独批准，不扩大对象写权限。

## 5. 回滚

- 测试基础设施按工作包独立提交，可逐个 revert。
- PostgreSQL 生命周期迁移在删除旧实现前保留调用兼容层。
- Playwright dispatcher 可按领域逐批回退，不影响未迁移测试。
- 路由和脚本治理先添加新入口，最后单独提交删除旧入口。
- 测试桶和生产桶分别保存CORS快照；回滚只恢复当前检查点的完整原配置，并只清理当前检查点明确授权的精确URL后重新验证响应。

## 6. 验证层级

1. helper 或生成器负向测试。
2. 工作包涉及的聚合测试。
3. API/Web workspace check 与 test。
4. 普通 Web Playwright CI 模式完整矩阵。
5. root `pnpm run check` 和 `pnpm run test`。
6. 真实 R2 header、缓存和浏览器字体加载验证。
