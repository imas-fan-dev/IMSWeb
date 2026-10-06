# 正式产品验收

已在隔离分支实施列表和新增/编辑弹窗，保持整页保存与 revision。

| 条件 | 已验证证据 |
| --- | --- |
| AC1 | AdminPanel、Table 与 pinned Dialog；桌面两栏表单、窄屏单列；桌面和手机截图已实际打开检查。100 行组件回归证明入口列表不展开表单。 |
| AC2 | unit 覆盖取消新增、Escape 取消编辑及原 ID 定位；浏览器覆盖新增取消、编辑取消及改 ID 后返回可见编辑按钮。 |
| AC3 | unit 断言无改动确认保持保存禁用、页面还原后恢复干净、候选确认不调用 update；浏览器 fixture 严格限制配置 PUT 为页头保存。 |
| AC4 | 原有排序、隐藏、删除、重读、读取失败、普通保存失败和 409 回归保留；浏览器验证排序、删除为空、409 及重读失败保留内容并禁用修改和保存。 |
| AC5 | unit 覆盖上传失败重试、预览、清除、上传期间关闭/取消/确认禁用、Escape 阻止关闭及卸载后迟到响应不污染新编辑器；浏览器验证上传发布及公开图片尺寸为 40×40。 |
| AC6 | Chromium 桌面和 320×568 手机均通过；Axe 无 violations；确认改 ID 后焦点返回、菜单 Escape、菜单项至少 44px、正文滚动前后 footer/关闭按钮位置不变、页面 scrollTop 不变、弹窗在视口内及无横向溢出。 |
| AC7 | op/editor 各执行桌面与手机完整流程；公开端过滤、读取恢复及空列表回归通过，未改公共页。 |

浏览器命令 `pnpm --filter @imsweb/web run test:e2e tests/e2e/community-content-management.spec.ts --workers=1` 最终 6/6 通过，44.3s，零重试。
最终集中 unit（管理页、公开页、endpoint 与 E2E source-policy）4 文件、25 用例通过，3.34s。

图片使用浏览器 fixture，不证明真实服务器解码或原生设备软键盘。真实上传服务和原生 App 不在本次前端修改范围。

独立复核 AC1–AC7 完成，无剩余阻塞项。修复错误提示导致的桌面字段列位移，并以失败复现和最终 6/6 浏览器回归验证。最终 source 证据、复核命令、截图与限制见 [verification.md](verification.md) 的独立复核记录。
