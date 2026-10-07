# 制作人社区动态配置验收

2026-10-06：R1 至 R7、AC1 至 AC7 已完成。实现包含 contracts、Hono 内容域、公共社区页和后台编辑页；没有 SQL 迁移或线上配置写入。

## 逐项证据

| 验收项 | 实现与回归证据 | 结果 |
| --- | --- | --- |
| AC1 / R1 | `admin-community-page.test.tsx` 的创建、编辑、排序、隐藏、删除及版本化保存；`community-content-management.spec.ts` 的 op/editor 发布、重新读取和公共页核对 | 通过 |
| AC2 / R2、R7 | 后台 unit 的上传预览、失败保留草稿、清除恢复图标；API `community upload ownership and public GET/HEAD delivery`；浏览器断言图片为 40×40，无横向溢出 | 通过 |
| AC3 / R3 | API `community permission, CSRF, strict requests and safe links` 验证匿名/其他部门拒绝、op/editor 允许、Cookie CSRF 和成功保存审计；上传用例验证上传审计 | 通过 |
| AC4 / R4 | API 缺失配置及 `community explicitly saved empty configuration remains empty after reread`；Web 空列表、隐藏和端过滤；浏览器删除全部后公共页为空 | 通过 |
| AC5 / R5 | Web 显式功能关闭、其他 503/404、当前端过滤后不探测；交换浏览器 fixture 明确配置入口；无硬编码入口注入 | 通过 |
| AC6 / R6、R7 | Web 读取失败/重试、后台失败禁用保存、冲突保留草稿；API 旧版本及原子并发写竞争；存储损坏拒绝伪空成功 | 通过 |
| AC7 | contracts、API、Web、仓库规则/边界、路由门禁；桌面和 320×568 手机上的 op/editor、Axe、截图 | 通过 |

公共重试用例额外断言恢复成功后 alert 和重试按钮消失。复核期间提出的“成功重试后 error 标记未清理”不成立：按钮在发起新请求前清理 error；17 个相关最终 unit 回归通过。

## 使用行为

后台路径为 `/admin/community`，op 与 editor 的工作台、菜单均提供入口。保存后公共 `/community` 消费整页配置。标题和简介有缺省值，入口初始为空；不会把旧静态卡片作为默认内容。自定义图片替代图标，清除图片后使用所选 Lucide 图标。

## 限制与发布影响

- 本任务未推送、部署、安装原生 App 或写入生产配置。发布本版本后，尚未配置的社区入口区为空；需后台编辑显式添加内容。
- 审计复用既有 best-effort writer。审计插入失败不会回滚已经保存的配置。
- 图片成功上传后保留，避免影响其他草稿或并行编辑；素材自动清理不在本任务范围。
- 本地完整构建和路由门禁使用隔离验证树，原因和源码比对方式见 [verification.md](./verification.md)。
