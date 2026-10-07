# 统一头像上传组件技术设计

## 1. 目标与边界

本次改造只调整 Platform 个人资料页的头像编辑体验。App、移动 Web 和桌面 Web 共用同一状态模型和操作语义，布局根据视口调整。现有 Platform API、contracts、认证、私有媒体读取、乐观并发和服务端 WebP 转换保持不变。

## 2. 组件边界

### `ProfileEditor`

继续拥有资料字段、API mutation、乐观并发错误、全局 feedback 和 session profile 回写。头像相关 UI 交给新的页面私有组件，并向它提供：

- 当前 `profile` 和 `accountId`
- 页面只读与全局 busy 状态
- `onUpload(file)`，成功返回 `true`，失败或过期返回 `false`
- `onRemove()`，成功返回 `true`，失败或过期返回 `false`

上传失败时不清除待上传文件，成功后由头像组件清除暂存状态。

### `AvatarUploadEditor`

放在 `apps/web/app/pages/community/exchange/me/components/`，负责：

- 使用 `usePlatformAvatarSource` 显示当前服务端头像和首字母 fallback
- 复用 `useAppPreparedImage` 接收 iOS 原生结果或浏览器文件
- 控制裁剪对话框、待上传文件和本地预览 URL
- 区分“取消更改”和“移除当前头像”
- 在移除前打开确认对话框
- 根据 `disabled`、`preparing`、`uploading`、`removing` 锁定冲突操作

### `AvatarCropDialog`

同目录的页面私有组件，使用 `react-easy-crop`：

- 固定 `aspect={1}` 和圆形取景区
- 支持拖动定位、方向键和缩放滑杆
- 只提供“取消”和“使用此头像”
- 移动 Web 与 App 使用接近全屏的安全区布局；桌面端使用有上限的居中对话框
- 关闭、取消或替换源文件时回收源对象 URL
- 禁用缩放式开场动画，只保留淡入，避免裁剪器测量到错误尺寸

### `cropAvatarImage`

放在 `apps/web/app/lib/media/crop-avatar-image.ts`，负责浏览器图片解码和 Canvas 导出：

- 接收原始 `File` 和 `react-easy-crop` 返回的像素区域
- 优先输出质量为 0.9 的正方形 `image/webp`；WebKit 无法编码 WebP 时保留 Canvas 返回的 `image/png`，继续由现有服务端统一转为 WebP
- 最长边不超过 1024 像素，小图不放大
- 输出后再次通过现有 `validateImage` 规则校验
- 解码、Canvas context 或 Blob 生成失败时抛出可映射的本地错误

此工具不持有 React 状态，也不发起网络请求。

## 3. 用户流程与状态

```text
当前头像
  -> 选择或拖入图片
  -> 准备图片
  -> 裁剪
  -> 待上传预览
  -> 明确点击“保存头像”
  -> 上传中
  -> 服务端头像
```

分支规则：

- 取消裁剪：释放原始选择，继续显示当前头像。
- 取消更改：释放待上传预览，不发请求，继续显示当前头像。
- 重新选择：释放旧的源文件和预览，再进入裁剪。
- 上传失败：保留待上传文件和预览，允许重试或取消。
- 上传成功：清除待上传状态，显示服务端返回的新头像。
- 移除头像：打开确认对话框；取消不发请求，确认后调用现有删除接口。
- mutation 过期：沿用 `isOperationCurrent`，不得清除新账户或新一代工作区的状态。

## 4. 响应式呈现

核心区域不是嵌套卡片。它由头像预览、状态文本、选择区和操作区组成：

- 桌面端：头像与说明并排，保留可拖放的 `FileUploadControl`，操作按钮靠近待上传状态。
- 移动 Web 与 App：纵向排列，头像居中，主要操作使用稳定宽度和至少 44px 的触控高度。
- 待上传时，圆形预览替换当前值并标记为“待上传”；当前服务端头像信息仍通过文字说明保留。
- 所有可见操作使用 Lucide 图标加清晰文本。纯图标关闭按钮保留可访问名称和 tooltip。
- loading、错误和成功状态不得改变外层布局宽度或造成横向滚动。

## 5. 生命周期与安全

- 当前服务端头像继续由 `usePlatformAvatarSource` 解析，Platform token 不进入 URL，也不发送给外部主机。
- 原始选择由 `useAppPreparedImage` 持有；确认或取消裁剪后调用 `clear()`，确保 iOS 原生临时文件被释放。
- 裁剪源和待上传文件各自只保留一个对象 URL，并在替换、取消、成功和卸载时调用 `URL.revokeObjectURL`。
- 上传仍由 `uploadPlatformAvatar` 发送 `expectedUpdatedAt`。删除仍由 `removePlatformAvatar` 使用同一版本栅栏。
- 前端裁剪不替代服务端 MIME、大小、内容和 WebP 校验。

## 6. 文案与无障碍

新增文案进入现有 i18n resources，至少覆盖：当前头像、待上传、选择、更换、裁剪、缩放、取消更改、保存头像、移除确认和本地处理失败。

- 对话框使用项目 Base UI Dialog 和 AlertDialog，保留焦点管理和 App 原生 tab bar 抑制。
- 缩放使用带标签的 Slider 或原生 range 控件，并提供当前值。
- 裁剪器支持方向键；主要操作可通过 Tab 和 Enter 完成。
- 尊重 `prefers-reduced-motion`。
- 图片替代文本描述当前或待上传头像，不使用文件名代替用途。

## 7. 依赖与兼容

在 `@imsweb/web` 中增加 `react-easy-crop`，锁文件由 pnpm 更新。该依赖只用于交互，不接触认证或网络。Tauri iOS 仍先经过原生预处理，随后与 Android 和普通 Web 进入同一 Web 裁剪界面。

若运行环境无法解码图片，或 Canvas 无法导出 WebP/PNG，组件显示本地错误并保留当前服务端头像，不发起上传。

## 8. 测试设计

单元测试覆盖：

- 当前头像、fallback 和只读状态
- 选择、裁剪确认、取消、重新选择和待上传预览
- 对象 URL 创建与回收
- 上传成功清理、上传失败保留和重复操作锁定
- 移除确认、取消和失败
- Canvas 输出尺寸、类型、文件名和失败分支
- Web 与 App 组合继续传播服务端 profile revision

Playwright 覆盖：

- 桌面 Web 拖放或文件选择、裁剪、缩放、保存和移除确认
- 移动 Web 的对话框边界、44px 触控目标、无横向溢出
- App iPhone、Android 和 WebKit 视口中的同一操作顺序、safe area 和 Bearer 头像读取
- 上传前后截图、页面错误和远程凭据隔离

API contract 不变，运行现有 Platform 头像测试作为回归门禁。

## 9. 回滚

没有数据迁移。回滚时一起移除头像编辑器、裁剪对话框、Canvas 工具和 `react-easy-crop` 依赖，并恢复 `ProfileEditor` 的原上传区域。Platform API、会话同步和受保护头像读取不需要回滚。
