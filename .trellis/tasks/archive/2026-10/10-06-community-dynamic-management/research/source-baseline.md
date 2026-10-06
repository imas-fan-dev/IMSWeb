# 源码依据

- 公共页：`apps/web/app/pages/community/index.tsx` 当前硬编码基本入口、App 活动入口以及交换入口；交换探测 404 且 payload 为 Not Found 时隐藏，其他错误允许进入。
- 配置存储模板：`apps/api/src/domains/content/producer-map/content-store.ts` 使用 storage get ETag、revision 比较、putIfUnchanged。RuntimeServices 暴露 storage、images、uploads。
- 图片模板：`apps/api/src/domains/content/producer-map/handlers/upload-producer-map-image.ts`、`request.ts`、`utils/media/image-upload.ts`、`normalize-uploaded-image.ts`。媒体配送与语义 key 由 `domains/delivery/media/routes.ts` 和 `utils/storage/business-object-keys.ts` 负责。
- 权限：`apps/api/src/middleware/hono-auth.ts` 的 opOnly 仅接纳 op，不满足显式 editor 账号；本域需要 op/editor 策略。`apps/web/app/layouts/admin-layout.tsx` 当前 editor 限 Wiki/story，需增加本页白名单与菜单。
- 导航：`apps/web/app/components/navigation/navigation-link.tsx` 已按目标解析 router/document/system 导航，自定义入口链接继续复用它。
- 初始空列表：不使用 CRUD 表/SQL seed 或任何额外硬编码 exchange 注入，否则删除全部入口不能得到空白。
- 图片生命周期：本次复用 producer-map 成功图片保留策略，上传失败补偿；不增加未经需求支持的素材垃圾回收。

这些依据于当前工作树只读检查；实施时须阅读实际文件并用测试验证，不把研究结论当作运行成功证据。
