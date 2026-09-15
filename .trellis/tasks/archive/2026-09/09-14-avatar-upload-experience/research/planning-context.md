# 头像上传体验规划证据

## 当前实现

- `apps/web/app/pages/community/exchange/me/profile-editor.tsx` 同时管理资料保存、头像选择、上传、移除和反馈。头像区域没有显示当前头像或本地图片预览。
- `apps/web/app/components/shared/file-upload-control.tsx` 已提供浏览器文件选择、桌面拖放、准备中、上传中和清除暂存文件的通用能力。
- `apps/web/app/lib/media/use-app-prepared-image.ts` 统一选择入口。iOS App 使用原生选择和预处理，其他目标使用浏览器文件输入。hook 负责原生临时文件释放。
- `apps/web/app/components/platform/use-platform-avatar-source.ts` 统一解析当前头像。普通 Web 与 OAuth 头像直接读取，跨源 Bearer App 中由 IMSWeb 管理的头像通过认证 Blob 请求读取。
- `apps/web/app/pages/community/exchange/me/profile-workspace-navigation.tsx` 在普通 Web 工作区显示当前头像。App 资料页隐藏此侧栏，因此编辑器必须独立显示当前值和结果。
- `apps/api/src/domains/identity/platform-profile/handlers/upload-avatar.ts` 保留 5 MiB 限制、乐观并发、私有对象写入和服务端 WebP 转换。`apps/api/src/utils/media/user-image.ts` 只重新编码，不裁剪或缩放。

## 已有测试

- `apps/web/tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx` 覆盖 Web 与 App 组合中的头像上传、移除、失败和资料版本传播。
- `apps/web/tests/unit/lib/media/use-app-prepared-image.test.tsx` 覆盖 App 图片准备与清理。
- `apps/web/tests/unit/components/platform/use-platform-avatar-source.test.tsx` 覆盖直接 URL、Bearer Blob、竞态、失败和对象 URL 回收。
- `apps/web/tests/e2e/community-exchange-me.spec.ts` 覆盖普通 Web 上传后各头像位置同步与视口溢出。
- `apps/web/tests/e2e/app-account.spec.ts` 覆盖 App 资料堆栈、Bearer 头像读取和窄屏溢出。
- `apps/api/tests/server/platform-profile.contract.test.ts` 覆盖头像上传、移除、读取和现有服务端边界。

## 体验缺口

- 用户选择图片前看不到当前头像，选择后也看不到将要提交的构图。
- iOS 有原生图片预处理，Android 与 Web 直接上传原文件；三端最终构图不可控。
- App 隐藏 Web 侧栏后，上传成功只能依靠文本反馈和“移除头像”按钮判断结果。
- “取消待上传图片”和“移除服务端头像”缺少清晰的视觉区分。
- 移除头像立即发起请求，没有确认步骤。

## 方案选择

采用 `react-easy-crop`：

- 支持触控、鼠标、滚轮、方向键、固定比例、圆形裁剪区域和受控缩放。
- `onCropComplete` 返回像素裁剪区域，适合交给 Canvas 生成最终上传文件。
- 组件本身不负责生成文件，项目仍需拥有解码、Canvas 输出、错误映射和对象 URL 生命周期。
- 裁剪器使用绝对定位，容器必须有稳定尺寸。
- 官方文档说明缩放式对话框开场动画会影响尺寸测量，因此裁剪对话框只使用淡入动画。

参考：

- <https://github.com/ValentinH/react-easy-crop>
- <https://github.com/ValentinH/react-easy-crop/blob/main/README.md>

对比过 `react-image-crop`。它体积小且明确支持键盘，但交互重点是移动或缩放裁剪框；本任务需要固定圆形取景区和缩放滑杆，`react-easy-crop` 更贴合目标流程。

## 边界

- `09-14-avatar-display-after-upload` 已处理上传后的会话同步、受保护头像读取和跨账户竞态。本任务复用这些能力。
- 不修改 Platform API、contracts、对象存储、认证或头像读取策略。
- 不扩展到名片、About、后台内容图片等其他上传场景。
