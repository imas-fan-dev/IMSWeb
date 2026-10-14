# 优化 CI 核心测试与候选发布验证

## Goal

缩短 PR 和 Preview 的验证耗时，降低机器速度、环境更新和频繁 UI 调整引起的维护成本。用户已批准既有方案，并要求在独立 worktree 与分支开始开发。

## Requirements

- R1：核心业务、登录与权限、写入与发布、API 契约、上传、关键导航、打包路由和资源交付保持每次 PR/Preview 必需验证。
- R2：保留精选关键可用性检查，包括遮挡、Dialog 操作可达、焦点与键盘、代表性可访问性。广泛断点、次要布局和额外浏览器组合纳入手动/每周扩展 UI；纯装饰数量、精确外观几何、动画实现和普通 class/CSS 字符串断言可以删除。混合场景按断言或用例拆分。
- R3：单次源码规则执行只计算一次契约审计，保留合法和非法输入的诊断、计数与退出行为。
- R4：Web CI 浏览器验证使用编译客户端，正确处理 prerender、SPA 深链接、资源 MIME、缺失资源和服务端路径归属；App 保持独立 target。
- R5：构建、完整域单测与浏览器检查按真实依赖调度；复用构建产物前校验候选 SHA/tree、lockfile、target、origins、工具版本和文件摘要。
- R6：Preview 发布依赖受信任 release head 的核心验证，减少重复整套检查。PR merge tree 的通过不能替代 release head。发布前检查新鲜度，保留部署锁、镜像 digest 和来源证明。
- R7：每机浏览器 workers=1、retries=0。不得通过固定 sleep、扩大请求次数、统一增加 timeout 或降低 coverage 阈值提速。数据库分配与清理隔离保持有效。
- R8：先测减少 UI 范围和编译预览的收益；仅在证据表明仍有必要时增加分片。环境固定和缓存采用明确版本与身份，不能猜测 image digest。
- R9：用户追加授权“合并到release/v1.1里，然后推送验证”。将已验收实现与最新已提交 release 更新整合，保留主工作区其他任务的暂存与工作文件，普通推送并核验同一 SHA 的核心 CI、Preview 发布与部署结果。

## Acceptance Criteria

以下勾选代表代码、回归、本地适用检查及独立评审已通过；实际 GitHub 发布、native 行为和 hosted 耗时仍未验证。逐项证据与限制见 [acceptance.md](acceptance.md)。

- [x] A1：核心与扩展用例清单有明确归属；核心功能和可用性场景保留，删除项说明对应装饰细节，扩展支持手动与每周运行并单独报告。
- [x] A2：审计只构建一次 TypeScript 审计结果，合法/非法 fixture 行为与诊断不退化。
- [x] A3：编译 Web 与 App 的首页、prerender、深链接、客户端导航、静态资源和服务端路径合同通过；严格 API dispatcher 保留。
- [x] A4：构建复用校验覆盖错误 SHA/tree、lockfile、target、origin/version 和篡改文件的拒绝行为；未校验产物不会绕过必需构建。
- [x] A5：CI 汇总拒绝失败、取消和缺失的必需候选检查，Preview 只从同一候选的成功验证继续，并保留新鲜度与部署完整性保护。
- [x] A6：相关治理、规则、边界、API 和 Web 类型/单测/coverage、核心 Web/App 浏览器与交付验证通过，报告实测耗时、原始失败与未验证范围。
- [ ] A7：release 合入与远端 SHA 一致，实际核心 CI、候选产物消费、Preview 镜像来源/新鲜度/部署及只读公开探测完成；记录实际耗时、原失败与剩余范围。

## Baseline and scope

- 开发起点：release/v1.1 的 375820be0a1989ff5d356bc707434e5a58689661；工作目录 .worktrees/ci-optimization，分支 codex/ci-optimization。
- 首次完整本地验收基线：已快进同步 release/v1.1 的 447f2323a6ef28931b80e73750336b710ea21e49，保留其新增交换地图与 App 检查；同步记录见 research/baseline-integration.md。
- 发布整合来源：release/v1.1 的 3e71087f629e2fab323ad54863895267a6faf4da，保留 native tab effect 等待修复、规范与该任务的原 CI 研究记录；发布验证绑定整合后的实际提交。
- 既有成功基线 db2b4f12：CI 24m43s，Web E2E 17.4m，Preview 32m16s；目标 CI 15m、Preview 18m 为待测目标，不作为已实现收益。
- 本任务不修改产品 UI 或业务契约，不操作 GitHub 仓库设置，不恢复或删除主检出目录中其他任务的修改。最初实施阶段不推送或部署；R9 追加授权允许本任务提交、合入 release、普通推送与 Preview 验证，不包含 production Tag、分支删除或仓库设置变更。
