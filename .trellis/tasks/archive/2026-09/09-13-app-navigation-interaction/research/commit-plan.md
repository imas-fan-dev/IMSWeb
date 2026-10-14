# App 导航提交计划

状态：五栏源码、浏览器与两端实包验收已完成，新基线仓库检查全部通过。用户已回复 `ok` 批准以下单个提交批次，按清单执行。

## 提交批次

单个功能提交：

```text
feat(app): reorganize navigation and preserve reading progress
```

包含五栏与独立交换地图入口、目录归属、栏目续看和返回、身份失效边界、动态页进入位置、原生图标打包、回归测试及同一任务的规范和研究。下列 67 个路径加本计划自身，共 68 个文件。代码与配套测试、规范一起提交；归档和 journal 另按工作流处理。

```text
.trellis/spec/web/frontend/app-navigation.md
.trellis/spec/web/frontend/components-and-ux.md
.trellis/spec/web/frontend/index.md
.trellis/spec/web/frontend/testing.md
.trellis/tasks/09-13-app-navigation-interaction/check.jsonl
.trellis/tasks/09-13-app-navigation-interaction/design.md
.trellis/tasks/09-13-app-navigation-interaction/implement.jsonl
.trellis/tasks/09-13-app-navigation-interaction/implement.md
.trellis/tasks/09-13-app-navigation-interaction/prd.md
.trellis/tasks/09-13-app-navigation-interaction/research/browser/app-account-current.png
.trellis/tasks/09-13-app-navigation-interaction/research/browser/app-apps-current.png
.trellis/tasks/09-13-app-navigation-interaction/research/browser/app-cards-current.png
.trellis/tasks/09-13-app-navigation-interaction/research/browser/app-events-current.png
.trellis/tasks/09-13-app-navigation-interaction/research/browser/app-home-current.json
.trellis/tasks/09-13-app-navigation-interaction/research/browser/app-home-current.png
.trellis/tasks/09-13-app-navigation-interaction/research/browser/navigation-pages-current.json
.trellis/tasks/09-13-app-navigation-interaction/research/browser/tab-navigation-current.json
.trellis/tasks/09-13-app-navigation-interaction/research/debug-retrospective.md
.trellis/tasks/09-13-app-navigation-interaction/research/final-review.md
.trellis/tasks/09-13-app-navigation-interaction/research/identity-followup-review.md
.trellis/tasks/09-13-app-navigation-interaction/research/ios-linker.md
.trellis/tasks/09-13-app-navigation-interaction/research/map-entry-review.md
.trellis/tasks/09-13-app-navigation-interaction/research/navigation-current-state.md
.trellis/tasks/09-13-app-navigation-interaction/research/navigation-options.md
.trellis/tasks/09-13-app-navigation-interaction/research/planning-context.md
.trellis/tasks/09-13-app-navigation-interaction/research/scroll-followup-review.md
.trellis/tasks/09-13-app-navigation-interaction/task.json
.trellis/tasks/09-13-app-navigation-interaction/validation.md
apps/web/DESIGN.md
apps/web/README.md
apps/web/app/components/app/app-navigation-provider.tsx
apps/web/app/components/app/app-tab-bar.tsx
apps/web/app/components/app/app-tab-model.ts
apps/web/app/components/app/app-top-bar.tsx
apps/web/app/i18n/resources.ts
apps/web/app/layouts/app-layout.tsx
apps/web/app/lib/app-navigation-state.ts
apps/web/app/lib/app-shell-scroll.ts
apps/web/app/pages/account/me/account-me-page.tsx
apps/web/app/pages/apps/apps-directory-model.ts
apps/web/app/pages/apps/index.tsx
apps/web/app/pages/community/index.tsx
apps/web/app/pages/events/index.tsx
apps/web/src-tauri/build.rs
apps/web/src-tauri/plugins/native-glass/README.md
apps/web/src-tauri/plugins/native-glass/ios/README.md
apps/web/src-tauri/plugins/native-glass/ios/Sources/Resources/LUCIDE-NOTICE.md
apps/web/tests/e2e/app-account.spec.ts
apps/web/tests/e2e/app-events.spec.ts
apps/web/tests/e2e/app-interactive-pages.spec.ts
apps/web/tests/e2e/app-map.spec.ts
apps/web/tests/e2e/app-navigation.spec.ts
apps/web/tests/e2e/app-shell.spec.ts
apps/web/tests/e2e/fixtures/namecard-browsing.ts
apps/web/tests/unit/components/app/app-navigation-provider.test.tsx
apps/web/tests/unit/components/app/app-tab-bar.test.tsx
apps/web/tests/unit/components/app/app-tab-model.test.ts
apps/web/tests/unit/components/app/app-top-bar.test.tsx
apps/web/tests/unit/layouts/app-layout.test.tsx
apps/web/tests/unit/lib/app-navigation-state.test.ts
apps/web/tests/unit/lib/app-shell-scroll.test.ts
apps/web/tests/unit/pages/account/account-me-page.test.tsx
apps/web/tests/unit/pages/apps/apps-page.test.tsx
apps/web/tests/unit/pages/community/community-app-page.test.tsx
apps/web/tests/unit/pages/community/community-page.test.tsx
apps/web/tests/unit/pages/events/events-app-header.test.tsx
tests/tauri-build-configuration.test.js
```

## 排除项

- `apps/web/src-tauri/icons/android/` 中 26 个生成文件不提交。
- `data/qa/`、构建目录、`src-tauri/gen/`、`src-tauri/target/` 的设备包、截图、日志和运行器保留在本地，不纳入提交。
- 原目录的邮件 Worker、API、迁移、部署及其他并行改动全部排除。邮件 Worker 已提交内容随新基线同步；后续未提交改动不复制到本 worktree。

以下是本次核对时原目录保留的路径快照，均不纳入本批次；原目录仍在并行编辑，确认后会再次核对：

```text
apps/api/src/infra/db/repositories/platform-email-configuration-repository.ts
apps/api/src/infra/email/smtp/platform-email-service.ts
apps/api/src/ports/email-delivery.ts
apps/api/src/ports/email.ts
apps/api/tests/server/platform-email-delivery-service.test.ts
apps/api/tests/server/platform-email-settings-contract.test.ts
apps/api/tests/server/platform-email-settings.test.ts
apps/web/app/pages/admin/platform-email/index.tsx
apps/web/app/pages/admin/platform-email/platform-email-model.ts
apps/web/tests/unit/lib/api/endpoints/platform-admin-email.test.ts
apps/web/tests/unit/pages/admin/platform-email/admin-platform-email-page.test.tsx
packages/contracts/src/platform/admin-email.ts
scripts/deployment/render-preview-app-release-notes.sh
apps/api/src/infra/cache/platform-email-resend-policy.ts
apps/api/src/infra/cache/valkey/platform-email-resend-policy.ts
.trellis/tasks/09-13-app-navigation-interaction/
.vitest/
```

上列导航任务目录是原检出中的旧草稿；本批次使用 worktree 内的完整任务记录。

## 同分支工作区处理

两个工作区均检出 `release/v1.1`。拟提交基线为 `7f38ec6585153af958b25bfa2bcaed4fb5430012`，提交前重新核对分支、两处索引和路径差异。若共享分支前进，先确认上游改动与导航路径不冲突并同步基线。

提交后，核对并同步原目录中未修改的对应导航文件及索引，避免共享 HEAD 前进留下反向暂存差异。原目录已有的修改与旧任务草稿保留；遇到同路径的新改动先保存证据，不覆盖。不开新分支，不 amend，不 push。

验收结果见 [validation.md](../validation.md)。
