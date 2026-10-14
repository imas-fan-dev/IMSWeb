# Preview 真实客户端 IP 实施计划

## Scope

- API 客户端地址解析与 Wiki 审计收敛。
- Preview 部署环境约束和回归测试。
- Preview 运维文档。
- 不修改 wire contracts、数据库 schema 或服务器侧 Nginx 文件。

## Steps

- [x] 在 `apps/api/tests/server/` 增加客户端地址解析回归测试，先覆盖 `direct`、`nginx`、IPv4、IPv6、缺失值、非法值、多值头、头部优先级和伪造头隔离。
- [x] 在 API middleware 层提取纯解析函数和请求级适配器，使用 Node IP 校验，并保持现有 `getClientAddress` 业务接口稳定。
- [x] 将 Wiki `writeWikiAudit` 的独立代理头解析替换为统一请求级适配器，并补充 Wiki 审计回归测试。
- [x] 把 `scripts/deployment/deploy-compose-preview.sh` 的地址来源要求从 `direct` 改为 `nginx`。
- [x] 更新 `tests/test_github_deployment.py` 的 Preview fixture，并新增 `direct` 配置在容器操作前失败的测试。
- [x] 更新 `docs/operations/github-actions-deployment.md` 和 `deploy/README.md`，记录 Preview Nginx 信任边界、覆盖头策略、回环绑定和私有环境值。
- [x] 检查变更范围，确认不修改 contracts、持久化 schema 或无关部署行为。

## Validation

- [x] `pnpm --filter @imsweb/api run test:server`
- [x] `pnpm --filter @imsweb/api run test:wiki`
- [x] `python3 -m unittest tests/test_github_deployment.py`
- [x] `bash -n scripts/deployment/deploy-compose-preview.sh`
- [x] `pnpm --filter @imsweb/api run typecheck`
- [x] `pnpm --filter @imsweb/api run check:architecture`
- [x] `pnpm run check:rules`
- [x] `pnpm run check:root`
- [x] 按 `docs/development/ai-environment.md` 完成前置检查后运行 `pnpm --filter @imsweb/api run test`。

## Review Gates

- [x] 解析器在 `nginx` 模式下只接受单个合法 IP，且 `direct` 模式不读取代理头。
- [x] 所有审计路径不再自行解析 `X-Forwarded-For` 或 `X-Real-IP`。
- [x] Preview 错误配置在任何 Compose 写操作前失败。
- [x] 文档明确指出部署前必须更新私有 `preview.env`。

## Validation Evidence

- API Node tests: 74 passed.
- API server tests: 536 passed.
- API Wiki tests: 60 passed.
- API migration tests: 114 passed.
- Preview deployment tests: 27 passed.
- API build, typecheck, Hono architecture, root rules, workspace boundaries,
  contracts build, documentation checks, and shell syntax all passed.
- `pnpm run dev:doctor` confirmed the required toolchain and local container
  target. It returned nonzero because local port `6379` was already occupied;
  the existing service was left untouched, and the complete API test owner
  still passed.
- Preview remote API is `healthy`, loads `IMS_CLIENT_ADDRESS_SOURCE=nginx`,
  and returns HTTP `200` through the public HTTPS origin.

## Rollback Points

- API 解析变更可独立回退，不涉及数据迁移。
- Preview 脚本回退到旧版本前，将私有 `preview.env` 恢复为旧脚本要求的 `direct`。
- Nginx 配置和 Compose 回环端口在实施与回滚期间保持不变。
