# 制作人社区动态配置设计

## Behavior owner and boundary

当前差距位于 `apps/web/app/pages/community/index.tsx`：入口仍写在代码中，后台无法修改且页面无法为空。新增 community landing 内容域负责配置读写，Web 公共页消费配置，后台提供草稿编辑。复用 producer-map 的对象存储和版本保护思路，不修改其业务处理器。

## Configuration and wire contract

在 `packages/contracts/src/community-content.ts` 定义 version 1 配置与类型：title、introduction、entries、updatedAt。每个 entry 使用稳定 id、title、description、href、icon、imageUrl、enabled、audience（all/web/app）和显式 availability（always/exchange）表达功能依赖；不以硬编码入口注入替代配置。

后台读取返回 content 和 revision；更新请求为 content 草稿与 revision；公共读取返回只包含启用入口的配置。端过滤由公共页按 IS_APP_TARGET 完成。缺失对象返回空 entries 与默认页面文案，admin revision 为 null。保存 [] 是有效配置，不触发 seed 或默认卡片。

JSON 请求 schema 严格拒绝未知字段，响应 schema 精确并复用 common envelope/error。路径使用现有 `communityApiPath`、`adminApiPath` 和 `publicUploadsPath`；统一业务 suffix。新增 contracts 子路径、根 namespace 与 README 同步。

## API and persistence

建议路径：GET communityApiPath('/content')；GET/PUT adminApiPath('/community-content')；POST adminApiPath('/community-content/images')。

API 域放在 `apps/api/src/domains/content/community-content/`，含 routes、内容存储、明确命名的数据校验/响应与读写/上传 handlers。调用 RuntimeServices 的 storage/images/uploads/audit 端口，禁止引用具体 infra。配置 key 为 `community/landing/config.json`，使用既有 get/putIfUnchanged 实现首次写与并发更新保护。强制比较 revision；存储后端不支持原子写时拒绝保存，不能回退为无条件覆盖。

数据校验约束：最多 100 个入口；id 唯一 kebab-case；标题最长 80，说明最长 300，简介最长 300，链接最长 500；链接仅站内单斜线地址和无凭据 HTTP(S)，拒绝协议相对地址、反斜线、控制字符与危险协议。上传图片 URL 只接受本业务 uploads 路径，并在保存前确认对象存在。持久化解析使用本地域校验，拒绝未知字段、无效 UTF-8 和时间戳；坏配置作为基础设施失败返回，不在领域逻辑执行 contracts schema。

后台认证使用现有 backofficeAuth。新增本域命名权限策略，仅允许 op/editor，所有写入使用 backofficeCsrf；允许 editor 访问该页面及其菜单，不扩大其他后台功能权限。上传和保存记录审计。

## Images

沿用 producer-map 的 multipart image 字段、10 MB 限制、扩展名/MIME/实际解码校验和 WebP 规范化，生成不可预测文件名，存储在独立 community landing assets key。通过既有 media delivery 挂载独立上传前缀，使用公共图片 URL 解析器保证 App 的 API origin 正确。

图片替代默认 Lucide icon，容器保持 40 px，object-contain；后台使用已有 AdminImageUploadField 控件预览/清除。上传失败删除或补偿，不自动删除成功素材，因为整页草稿或其他编辑仍可能引用。

## Web behavior

API endpoints 放在 `app/lib/api/endpoints/community-content.ts`，通过 parsed schema、共享 CSRF 和导出 facade 使用。

公共页保持现有 PageShell 与卡片样式：loading 有状态提示，error 有 alert 与 retry，success [] 仅渲染空入口区域。取消 communitySections/exchangeSection/appActivitySection 注入；交换可用性仅过滤配置中的交换 entry，保留当前显式 feature-off 404 隐藏规则，探测错误时入口可进入重试。未知图标不能导致页面崩溃。

后台新页 `/admin/community` 复用表单、对话框、排序和上传控件。明确本地修改与保存状态；加载失败不能编辑覆盖，保存冲突不丢草稿。editor 可经既有工作台菜单进入本页；角色显示应反映内容编辑权限，原 Wiki/story 权限保留。

## Compatibility and rollback

发布后旧硬编码卡片不会自动出现，后台未配置时入口区为空。这是空内容要求的直接结果。上线运营需显式配置想展示的卡片，本次不写线上配置。

没有 SQL schema 迁移。回滚应用版本会恢复旧代码展示；配置和图片仍留在专属对象路径，可在未来版本重新读取。除本任务文件与必要的共享路径/导航/路由/媒体注册外，不修改其他未完成任务。
