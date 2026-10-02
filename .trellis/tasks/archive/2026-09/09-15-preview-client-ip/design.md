# Preview 真实客户端 IP 技术设计

## Current Behavior

Preview 的公网请求先到宿主机 Nginx。Nginx 已将 `$remote_addr` 写入 `X-Real-IP` 和 `X-Forwarded-For`，随后代理到宿主机回环端口。Compose 再把请求转入 API 容器。

Preview 部署脚本却要求 `IMS_CLIENT_ADDRESS_SOURCE=direct`，因此 API 忽略 Nginx 写入的地址，改用容器连接对端。限流、审计、投稿和平台会话最终得到共享的 `172.*` 地址。

## Desired Flow

```text
public client IP
  -> Nginx $remote_addr
  -> overwritten X-Forwarded-For and X-Real-IP
  -> API nginx source mode
  -> validated single IP
  -> rate limits, audit, submissions, sessions, security events
```

本次不改变 Nginx 的运行配置。仓库负责声明并验证两端契约：Nginx 覆盖转发头且 API 端口不可公网直连，Preview 运行环境明确选择 `nginx` 地址来源。

## Trust Boundary

- `direct` 模式只读取连接对端，忽略所有转发头。
- `nginx` 模式只适用于受控 Nginx。Nginx 必须覆盖客户端提交的 `X-Forwarded-For` 和 `X-Real-IP`。
- API 容器端口继续只发布到宿主机 `127.0.0.1`，防止公网绕过 Nginx 后伪造头部。
- `X-Forwarded-For` 是首选头，缺失时才使用 `X-Real-IP`。如果首选头存在但不合法，则返回 `unknown`，不掩盖入口配置错误。
- 只接受一个 IPv4 或 IPv6 字面量。逗号链、空值和其他文本均返回 `unknown`。
- `unknown` 会让异常请求共享限流身份。这是代理失配时的安全降级，优于信任未经验证的文本。

## API Design

客户端地址规则放在 API middleware 层，不进入业务域或 wire contracts。

新增一个可独立测试的纯解析函数，输入包括地址来源、连接对端、`X-Forwarded-For` 和 `X-Real-IP`，输出合法 IP 或 `unknown`。使用 Node 标准库校验 IPv4 与 IPv6，不增加依赖，也不改写合法地址的表示形式。

请求级适配器负责从 Hono context 读取连接信息和请求头，再调用纯解析函数。现有 `getClientAddress` 保持对业务消费者的接口不变，并从 `RuntimeServices.config` 选择模式。Wiki 审计改为调用同一请求级适配器，删除自己的转发头解析。

## Deployment Changes

`scripts/deployment/deploy-compose-preview.sh` 改为要求 `IMS_CLIENT_ADDRESS_SOURCE=nginx`。私有的 `$HOME/preview/config/preview.env` 必须在下一次部署前同步改为 `nginx`。脚本仍在任何 Compose 写操作前检查该值，因此旧配置会明确失败，不会产生部分部署。

`tests/test_github_deployment.py` 的 Preview fixture 同步使用 `nginx`，并新增一个把值改回 `direct` 的失败用例。运维文档明确记录 Preview 依赖不可绕过、会覆盖转发头的宿主机 Nginx。

`deploy/nginx/imsweb.conf.example` 已满足要求，不需要修改。

## Compatibility

- 本地开发和无代理部署继续默认使用 `direct`。
- 生产环境已经使用 `nginx`，本次只收紧非法或多值头的处理。
- HTTP 请求、响应、共享 contracts 和数据库 schema 均不改变。
- 历史记录保持不变，新请求开始写入正确地址。

## Verification

API 测试覆盖两种来源、IPv4、IPv6、头部优先级、缺失值、非法值、多值头以及 `direct` 模式忽略伪造转发头。Wiki 测试确认审计使用统一解析结果。

部署测试执行真实 shell 脚本 fixture，证明 `nginx` 可通过且 `direct` 在容器操作前失败。静态检查继续验证 shell 语法和文档规则。

部署后通过一次会写入审计或平台会话的公网操作确认记录为客户端公网 IP；再携带伪造的 `X-Forwarded-For` 请求，确认 Nginx 覆盖该值。

## Rollout And Rollback

1. 先把 Preview 主机私有 `preview.env` 的地址来源改为 `nginx`。
2. 部署包含本次代码和脚本变更的版本。
3. 完成公网真实 IP 与伪造头验证。

若部署前置检查失败，修正私有环境文件后重试，运行中的旧版本不会改变。若必须回滚到仍要求 `direct` 的旧部署脚本，需要先把私有环境文件恢复为 `direct`；Nginx 配置无需变化。
