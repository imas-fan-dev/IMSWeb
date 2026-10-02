# 完善 Preview 环境真实客户端 IP 解析

## Goal

让 Preview 环境中的 API 在经过宿主机 Nginx 和容器网络后，仍能取得真实客户端 IP，并确保该地址不能由公网请求随意伪造。

## Requirements

- Preview 环境必须使用宿主机 Nginx 提供的可信客户端地址，而不是容器网络中的 `172.*` 对端地址。
- 公网入口必须覆盖客户端自行提交的转发头，API 只信任由受控入口写入的地址。
- API 必须为限流、审计日志、访客投稿、平台会话和安全事件提供一致的客户端地址。
- `direct` 模式继续适用于没有反向代理的本地或独立部署，并忽略客户端提交的转发头。
- 无法取得合法 IP 时必须返回现有的安全降级值，不得把任意头部文本写入审计或持久化字段。
- Preview 的部署检查和自动化测试必须覆盖客户端地址来源配置，防止后续部署重新退回容器地址。
- 不改变现有 HTTP JSON wire format，也不迁移或改写历史 IP 数据。

## Acceptance Criteria

- [x] 通过 Preview 公网入口访问时，IP 限流、审计和会话记录使用客户端公网 IP，不再使用共享的 `172.*` 容器地址。
- [x] 公网请求自行设置 `X-Forwarded-For` 或 `X-Real-IP` 时，不能覆盖可信入口识别到的客户端地址。
- [x] API 不能通过 Preview 的公网网络绕过 Nginx 直接访问；容器发布端口继续只绑定宿主机回环地址。
- [x] `direct` 与可信 Nginx 两种地址来源均有自动化测试，并覆盖 IPv4、IPv6、缺失值、无效值和多值转发头。
- [x] Preview 部署配置与检查明确要求可信 Nginx 地址来源，配置错误时部署应尽早失败。
- [x] 现有限流、审计、投稿和平台会话消费者继续通过统一入口取得地址，无需各自解析代理头。
- [x] 相关 API 测试、部署脚本测试、静态检查和构建通过。

## Confirmed Context

- `https://preview.idol-master.top` 当前响应头显示公网入口为 Nginx，DNS 直接解析到单个 IPv4 地址，没有可见的 Cloudflare CDN 入口。
- Preview Compose 将 API 容器端口发布到宿主机 `127.0.0.1`，公网请求必须先经过宿主机上的其他服务。
- Preview 部署脚本当前强制 `IMS_CLIENT_ADDRESS_SOURCE=direct`，API 因而读取容器连接对端地址并忽略代理头。
- API 已有统一的 `getClientAddress` 入口；返回值被全局及专项限流、审计日志、访客投稿、平台会话和安全事件使用。
- Preview 实际 Nginx 将请求代理到 `127.0.0.1:13000`，并使用 `$remote_addr` 覆盖 `X-Real-IP` 与 `X-Forwarded-For`。正式站点采用相同的头部策略。
- 仓库中的 Nginx 配置示例与 Preview 的头部策略一致，但 Preview 主机的站点文件由服务器侧单独维护。
- Wiki 审计当前绕过统一入口并自行读取代理头，需要在本次修复中收敛。

## Decisions

- 保持服务器侧 Preview Nginx 配置不变，不把证书、日志和站点文件纳入仓库部署。
- 仓库以现有 Nginx 模板和运维文档声明可信入口契约，Preview 部署脚本要求 `IMS_CLIENT_ADDRESS_SOURCE=nginx`。
- 可信 Nginx 模式只接受单个合法 IP；多值、缺失或非法地址统一降级为 `unknown`。
- 不增加 `Forwarded` 或 CDN 专有头支持。

## Out of Scope

- 修改历史数据库中的 IP 值。
- 引入 IP 地理位置、设备指纹或新的风控策略。
- 支持当前部署链路中不存在的 CDN 专有客户端地址头。
