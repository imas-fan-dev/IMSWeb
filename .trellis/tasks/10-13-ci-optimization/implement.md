# 实施与验证顺序

所有写入在 .worktrees/ci-optimization 顺序执行，每个阶段交回主会话后再启动下一阶段。

1. 审计去重：assert 返回结果供 format 使用，保留接口兼容和非法输入诊断；运行 owning source-rule fixture、规则检查。
2. UI 分层：盘点保留、扩展和删除断言，实施 core/extended 选择，更新 owner/workflow/规范及相关治理回归；单独比较用例清单，保持全域单测 coverage。
3. 编译预览：复用静态策略支持 Web，验证 route metadata、prerender/SPA、资源和 API 归属；运行聚焦路由与配置回归后执行核心浏览器。
4. 候选链路：Web validation 与 web-build 分开，browser/integration 依赖 build；同次 run/attempt artifact 使用前由 build-artifact.mjs 校验身份和文件摘要。CI result 成功后通过 workflow_call 调用 Preview，保持原 push SHA/ref 的 OIDC provenance；manual redeploy 同样要求当前 release head 的全部核心 job 成功，由可信 workflow checkout 的 verified-candidate.mjs 校验。验证只检查必需 validation jobs，不等待当前 publication 自身完成；publication 失败不清除已成功的验证证据。保留干净 Docker 构建、digest/provenance 和部署锁。聚焦治理、owner、artifact identity/tamper、规则、边界与 delivery 验证通过后交回主会话。
5. 记录核心与扩展、Web/App 编译预览耗时；根据测量决定是否需要 browser image 或 shard，未经测量不默认增加。
6. 独立完整范围检查：pnpm run check:rules、check:boundaries、相关 governance/delivery owner、API/Web lint/typecheck、完整域单测及 coverage、核心 Web/App 浏览器。报告 commands、exit、duration、首次失败和未验证范围。
7. 同步 .trellis/spec 与 docs 权威说明，整理 scoped diff 和提交建议供用户审核。子代理不得提交、推送、合并或部署。

聚焦命令按 docs/development/testing.md 和 node scripts/testing/run-test-owner.mjs --list 核实，不增加无职责脚本。不能同时运行同一域多个 Vitest，也不能让两个 Playwright 进程共享 base URL。任何生成物、日志、数据库、依赖与 env 保持 ignored。

## 本地交付状态

步骤 1 至 7 的本地实现、检查、规范与提交建议已完成，证据见 [acceptance.md](acceptance.md)。完整独立评审为 PASS；原 P1 secrets 接口和 P2 changed-path 归属问题已修复并经复审确认。

任务保留 `in_progress`，因为本次范围不包含提交、推送、合入或部署。实际 hosted 发布与耗时仍待执行，不能由本地 PASS 推定。验收后的收尾仅修改任务文档及规范，保留原已评审源码身份与完整证据。

## 追加发布执行

用户随后明确授权合入 `release/v1.1` 并推送验证。上述本地截止记录保持原归属，本阶段按 PRD R9/A7 执行：保存主工作区工作文件与暂存 blob，在隔离分支提交已验收实现，整合当前 release 更新并检查变化输入，再快进主 release、普通推送及跟踪同一 SHA 的实际 CI/Preview。不得跳过失败门禁或 force-push。
