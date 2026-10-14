# 设计验证

## 验证范围

本轮验证任务内的 HTML 交互预览，应用代码尚未实施。生成预览时只读取公共 Preview 配置；交互操作仅修改本页内存，没有配置写入请求。

## 浏览器结果

使用本地 Chromium 检查两个宽度：

| 检查 | 桌面 1440×960 | 手机 320×568 |
| --- | --- | --- |
| 初始入口 | 5 行 | 5 行 |
| 列表横向溢出 | 无 | 无 |
| 弹窗宽度 | 760px | 286px |
| 弹窗高度 | 677.5px | 536px |
| 正文可视高度 / 内容高度 | 520 / 520px | 365 / 1095px |
| 底部按钮在视口内 | 是 | 是 |
| 取消编辑保留原值 | 通过 | 通过 |
| 取消新增保留 5 行 | 通过 | 通过 |
| 确认新增并显示未保存 | 通过 | 通过 |
| 重新读取确认丢弃修改 | 通过 | 通过 |
| 无更改确认不产生未保存 | 通过 | 通过 |
| 确认后焦点返回编辑按钮 | 通过 | 通过 |
| 更多菜单内排序 | 桌面直接排序按钮 | 通过 |
| 页面脚本错误 | 0 | 0 |

人工查看了桌面列表、桌面弹窗、手机列表、手机弹窗截图。桌面入口与说明可扫描，编辑表单左右分组；手机元数据合并到入口下方，两个操作按钮保持可见。弹窗只滚动正文，标题及底部操作固定。

## 证据

以下本地证据留在仓库外：

- `/tmp/imsweb-community-admin-design-desktop-list.png`
- `/tmp/imsweb-community-admin-design-desktop-dialog.png`
- `/tmp/imsweb-community-admin-design-mobile-list.png`
- `/tmp/imsweb-community-admin-design-mobile-dialog.png`
- `/tmp/imsweb-community-admin-design-verification.json`

## 规划与工作区检查

- PRD 已完成收敛复核，保留 R1–R7、AC1–AC7 及源码依据，没有阻塞设计的待定问题。
- design.md、implement.md 和研究记录已齐全。
- implement.jsonl 的 6 条、check.jsonl 的 5 条均为存在的 spec/research 文件。
- 规划中的四个测试路径都存在，相对文档链接有效。
- 原有受保护文件的哈希、暂存二进制 patch 均未改变。
- 任务仍处于 planning，未执行 task.py start。

## 留给实施的验证

原型采用本地图片预览和示例图标，不覆盖完整图标选择器、服务器图片上传、过期上传响应、权限、CSRF、409 和正式页面 Axe。以上仍需按照 implement.md 执行。这里的通过记录不能替代 AC1–AC7 的产品验收。
