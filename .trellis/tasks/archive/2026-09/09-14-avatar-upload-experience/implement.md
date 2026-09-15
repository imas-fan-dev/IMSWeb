# 统一头像上传组件实施计划

## 1. 并发工作安排

任务启动后，主会话先锁定本文中的组件接口和文件所有权，再同时派发三个 `trellis-implement` 子任务。所有并发修改使用 `terra` 模型和 `high` 推理等级。

- [x] 工作组 A 只修改核心实现：Web 依赖与锁文件、裁剪工具、头像编辑组件、`ProfileEditor` 集成、account ID 传递和 i18n resources。
- [x] 工作组 B 只修改 Vitest：新增裁剪工具与头像编辑组件测试，更新个人资料页组合测试。
- [x] 工作组 C 只修改 Playwright：更新普通 Web 与 App 头像流程、响应式几何和截图断言。
- [x] 主会话检查实际 diff，解决接口偏差，不覆盖用户或其他任务的未提交改动。

每个子任务提示必须以 `Active task: .trellis/tasks/09-14-avatar-upload-experience` 开头。

## 2. 核心实现

- [x] 在 `@imsweb/web` 增加 `react-easy-crop` 并更新 `pnpm-lock.yaml`。
- [x] 新增 `cropAvatarImage(file, cropPixels)`，输出不超过 1024x1024 的 WebP 文件，并在 WebKit 无法编码 WebP 时保留 Canvas PNG 回退；覆盖解码、Canvas 和 Blob 失败。
- [x] 新增对象 URL 生命周期辅助逻辑，确保源文件和待上传文件在替换、取消、成功和卸载时释放。
- [x] 新增响应式 `AvatarCropDialog`，固定 1:1、圆形取景区、拖动、方向键和缩放滑杆。
- [x] 新增 `AvatarUploadEditor`，显示当前头像或 fallback，并实现选择、裁剪、待上传、重选、取消、上传和只读状态。
- [x] 使用 `AlertDialog` 增加移除确认，取消时不得调用 API。
- [x] 让 `ProfileEditor` 保留 mutation、feedback 和 revision 逻辑，把头像呈现与本地文件状态交给新组件。
- [x] 从 `CommunityExchangeMePage` 向头像编辑器传递当前 account ID，复用 `usePlatformAvatarSource`。
- [x] 增加简体中文和英文 i18n 文案，保持 Web 与 App 术语一致。

## 3. 单元测试

- [x] 为裁剪工具覆盖正方形坐标、最大 1024 边长、小图不放大、WebP/PNG 输出和失败分支。
- [x] 为 `AvatarUploadEditor` 覆盖当前头像、fallback、只读、选择和裁剪状态。
- [x] 覆盖裁剪取消、重选、待上传取消及全部对象 URL 回收。
- [x] 覆盖上传成功清理、上传失败保留、busy 锁定和同一文件重试。
- [x] 覆盖移除确认、取消、成功与失败。
- [x] 更新个人资料页组合测试，使 Web 与 App 都经过裁剪确认后再上传，并继续断言 revision 和 session profile 传播。
- [x] 保持 `use-app-prepared-image` 与 `use-platform-avatar-source` 现有回归覆盖通过。

## 4. 浏览器测试与视觉验证

- [x] 更新 `community-exchange-me.spec.ts`，验证当前头像、裁剪对话框、缩放、明确保存和移除确认。
- [x] 在桌面项目验证文件拖放或选择，记录上传前后截图。
- [x] 在移动 Web 验证对话框不溢出、主要触控目标至少 44px、页面无横向滚动。
- [x] 更新 `app-account.spec.ts`，在 iPhone、Android 和 WebKit 项目验证相同流程、safe area、无重叠和 Bearer Blob 读取。
- [x] 检查页面错误、控制台错误、远程请求和 Platform token 隔离。
- [x] 使用截图和像素检查确认裁剪区、预览和结果均非空且构图一致。

## 5. 验证命令

- [x] `pnpm --filter @imsweb/web format`
- [x] `pnpm --filter @imsweb/web lint`
- [x] `pnpm --filter @imsweb/web typecheck`
- [x] 运行新增和受影响的 Vitest 文件。
- [x] 运行普通 Web 桌面与移动 Playwright 头像用例。
- [x] 运行 App iPhone、Android 和 WebKit Playwright 头像用例。
- [x] 运行现有 Platform 头像 API contract 测试。
- [x] `pnpm --filter @imsweb/web run check`
- [x] `pnpm run check:rules`
- [x] `pnpm run check:boundaries`
- [x] `pnpm run build`
- [x] `git diff --check`
- [x] 检查最终 diff，排除 `09-13-app-navigation-interaction`、`09-14-avatar-display-after-upload`、release notes 和 `.vitest/` 的用户改动。

耗时较长的测试和构建使用后台任务运行，等待自动完成通知，不轮询。

## 6. 质量复核

- [x] 派发 `trellis-check`，检查状态竞态、对象 URL 与原生临时文件泄漏、App 凭据隔离、键盘操作、触控尺寸、响应式布局和测试缺口。
- [x] 复查依赖是否只属于 `@imsweb/web`，没有引入通用上传框架或 API 变更。
- [x] 对复核发现的问题完成修正并重新运行受影响门禁。

## 7. 回滚点

本任务没有 schema 或数据迁移。核心组件、裁剪工具和依赖必须作为一个整体回滚。现有 Platform API、session profile 同步和受保护头像 Blob 加载保持不动。

## 8. 完成证据

- Web 全量检查：184 个测试文件、1158 个测试全部通过，lint、typecheck、生产构建与 Classic Wiki CSS 检查通过。
- 普通 Web 浏览器：Chromium 桌面、Chromium 移动、Firefox 桌面 3/3 通过。
- App 浏览器：iPhone、Android、WebKit 3/3 通过；保留待上传、上传成功和移除后 QA 截图于 `/tmp/imsweb-app-avatar-*` 与 `/tmp/imsweb-app-account-*`。
- Platform 头像 API contract：16/16 通过。
- 根级 `check:rules`、`check:boundaries`、生产构建、任务上下文验证与 `git diff --check` 全部通过。
- 独立 `trellis-check` 修正了旧组件实例在异步上传或移除完成后的本地状态写入竞态；相关回归测试及最终 Web/App 浏览器重验通过。
