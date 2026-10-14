# CI 优化本地验收记录

结论：本地实现与验证完成，完整独立评审 PASS。原 P1、P2 均 resolved，没有新增必须修复的 P0/P1/P2。本记录覆盖已评审源码和实际检查凭据；GitHub 发布、native 行为及 hosted 提速目标未执行。

## 源码与报告归属

- 工作目录：`/Users/texas/Workspace/IMSWeb/.worktrees/ci-optimization`。
- 分支：`codex/ci-optimization`；验收基线 HEAD：`447f2323a6ef28931b80e73750336b710ea21e49`。
- committed tree：`c4b1f865c32cffaed6ba46f83a57fe487fd65ef5`。
- 独立评审时的脏源码身份：`af9e91a7262461c7e1edc73d8a77128c3d69ea973b9e4e0497a71cd276c5c109`，2,590 个内容项，删除项编码为 null；现存项权限掩码已核对，暂存区为空。
- 最终 reviewer producing run：`1cf25790-641e-4014-86d9-2e54eb672fad`，runtime acceptance 为 attested，正式源码评审结论 PASS。
- 修复 producing run：`140ed658-b62f-4709-a8ab-769bb1776e5f`；报告恢复 run：`11255e19-ba50-4ca6-ac68-5baff651a784`，runtime acceptance 为 checked。
- 集成 checker 恢复 run：`4445d916-9e7a-4346-9c64-c69d4a424112`，runtime acceptance 为 checked。

完整保全目录位于 checkout 之外：`/Users/texas/.pi/agent/projects-memory/IMSWeb/evidence/ci-optimization/accepted-af9e91a7-1cf25790`。其中 `final-independent-review.md`、`integrated-check.md`、`recovered-repair-report.md`、`reviewed-source/`、`retention-manifest.json` 和 `retention-provenance.json` 保留报告、实际 producing-run 元数据、已评审源码、原始失败及检查凭据。收尾文档修改不重写上述身份。

## 逐项验收

| 条目 | 证据 |
| --- | --- |
| A1 | Web core 167、extended 10，互不相交且并集为 retained 177；447f baseline 179，仅两个装饰 motif 项目实例删除，六个身份变化为功能保留后的重命名。App 101 个身份与 baseline 相同。关键地图、搜索、焦点、点击可达和响应次数保留。 |
| A2 | 审计结果在单次执行中复用；合法/非法 fixture 的诊断、计数和退出行为通过 owning source-rule 与治理回归。 |
| A3 | Web/App 使用独立编译目标和 origins；核心浏览器、routing 11 tests 和显式 App HTTP 1 test 通过，覆盖文档字节、MIME、HEAD、深链接、缺失资源及服务端路径归属。 |
| A4 | 候选 SHA/tree、lockfile、target、origins、版本、run/attempt、文件缺失/增加/篡改和 symlink 拒绝回归通过；实际 dirty checkout 的生产 artifact recording 被拒绝。 |
| A5 | 完整候选验证、实际 aggregator shell、失败/取消/缺失/重复/跳过等拒绝回归通过；复审确认当前 head、digest/provenance、权限、新鲜度与锁保留。实际 GitHub publication/deploy 未执行。 |
| A6 | 根检查、治理、contracts/delivery、API/Web 全域类型/单测/coverage、Web core、App 及 Firefox 恢复检查有完整退出凭据；原始失败、继承跳过与清理范围逐项记录。 |

## 检查结果与本地耗时

各行是独立执行记录，聚焦回归与完整治理存在测试重叠，不能相加成唯一测试总数。本地机器及执行调度与历史 hosted 基线不同，以下耗时不证明 CI 或 Preview 的目标已实现。

| Gate | 结果 | Wall time |
| --- | --- | ---: |
| API 全域 owner，隔离 PostgreSQL、coverage enabled | 887 passed，1 个继承的可选 RustFS skip | 118.075s |
| Web validation，全域 coverage | lint/typecheck 与 1,628 tests passed，233 files | 167.978s |
| 编译 Web core owner | 156 passed，11 inherited skips | 243.552s |
| 编译 App browser | 83 passed，18 inherited project skips | 167.196s |
| 最终 Web routing integration | 11 tests passed | 16.522s |
| 显式 App HTTP contract | 1 test passed | 0.703s |
| P1/P2 focused candidate/detector/owner | 56 tests passed | 3.320s |
| 修复后 root | passed | 64.401s |
| 修复后完整 governance | 87 Node/Vitest + 128 Python passed | 97.988s |
| 修复后 Python workflow/boundary/operations/docs | 69 tests passed | 18.475s |
| 修复后 actionlint 1.7.12 | passed；shellcheck integration disabled | 0.008s |

| Domain | Statements | Branches | Functions | Lines | 原阈值 S/B/F/L |
| --- | ---: | ---: | ---: | ---: | --- |
| API，完整 `src/**` 分母 | 76.96% | 66.73% | 84.31% | 80.03% | 76 / 66 / 84 / 79 |
| Web，完整 `app/**` 分母 | 71.63% | 68.85% | 68.57% | 74.50% | 70 / 67 / 67 / 73 |

原 API/Web/browser 检查归属集成 checker。六文件 CI 修复没有改变 application、contracts、coverage、test-owner、harness 或 build 输入，2584 个内容项保持不变，因此这些完整检查由源绑定复用；新的 CI 输入执行了上表所列修复门禁。完整 commands、exits、times、logs 与 identities 保留在报告引用的 raw ledger 和外部保全目录。

## 评审问题处置

- P1：callee 声明恰好两个 required SSH secrets，caller 同名显式传递；值仍由 callee 的 `preview` Environment 提供，保留非空检查和环境保护。当前官方文档、静态合同及旧 YAML 负对照支持修复，实际 hosted secret resolution 未执行。
- P2：共享 launcher 归属 app+web+integration；共享 fixture 归属 app+api+web+integration；静态 HTTP 合同归属真实 integration owner。真实 Git A/D/双向 rename 覆盖 main push 与 PR merge-base；实际 aggregator shell 拒绝选中 lane 的不成功结果。

## 原始失败、清理与未验证范围

- 原 API 第一次执行在工具 60 秒期限中断，没有完整终态；后续完整 owner 成功。中断遗留测试库仅在该任务自有容器内清理；最终 `ims_test_%` 查询为零行，该准确容器已移除。
- 原 extended 在默认 macOS 环境为 3 Chromium passed、5 Firefox startup failed、1 interrupted、1 not run，耗时 1,032.967s。诊断后仅通过进程级 `CFFIXED_USER_HOME` 恢复，原 7 Firefox 用例均 passed，耗时 10.291s。默认启动问题仍存在，未修改产品预算、HOME、系统权限或共享浏览器资料。
- API/Web/App 的继承跳过、baseline App collection fixture 错误及纠正、证据采集错误均保留。App HTTP branch 为显式本地执行，CI integration 默认执行 Web branch。
- 自有 runner 退出及 4173/1420 无 listener 有原凭据；OS 保护的任务私有 Firefox app-data 目录留存，清理未扩大到共享资源。
- HTTP/2 和验收报告协议失败分别保留；报告恢复未重跑已完成产品检查，修复门禁和最终独立 PASS 没有覆盖或改写原失败记录。
- hosted artifact transfer、OIDC issuance、registry publication/attestation、Environment 实际配置/保护、自动/手动 Preview 与 native Tauri system-browser/deep-link 未执行；hosted gh 实际版本未核验。
- CI ≤15m、Preview ≤18m 仍为未验证目标；shard/browser container 改动继续延后。

## 提交建议与任务状态

建议提交标题：`feat(ci): verify candidates and streamline core validation`。范围为完整四阶段实现、P1/P2 六文件修复、对应回归及规范/任务文档；日志、数据库、node_modules、生成物、私有 app-data 和外部保全目录均不纳入提交。

本次没有提交、推送、合入、部署、workflow dispatch 或 GitHub 设置变更。任务保留 `in_progress`，未归档；本地实现与独立验收完成，后续 Git 与 hosted 操作不由本记录推定为已授权。

以上为本地验收截止记录。用户随后追加授权“合并到release/v1.1里，然后推送验证”，执行范围见 PRD R9/A7 与 implement.md；本地 PASS 的身份、原始失败及未执行项继续保持原归属，实际发布结果以新阶段的同 SHA 凭据为准。
