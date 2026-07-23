# 资产来源记录

本文件记录从 legacy IMSWeb 工程迁入新前端的静态资产。文件出现在旧仓库中不等于已经取得复制、修改或公开分发许可；生产发布前必须补齐权利人与许可证据。

## 已迁入的内部验证资产

### `public/brand/imsweb-logo.png`

- Legacy 工程根目录：`/Users/texas/Desktop/IMSWebver3.0`
- Legacy 来源路径：`apps/legacy/public/assets/images/logo.png`
- 新前端目标路径：`apps/web/public/brand/imsweb-logo.png`
- 迁移方式：原文件复制，不重绘、不裁切、不移除潜在署名信息
- 文件格式与尺寸：PNG，545 x 188，RGBA
- Legacy 源文件 SHA-256：`aa2ed68b5c1df4e8800a576dd09251c314b0da8f37b43e96247b64e993aeb483`
- 当前用途：新前端内部迁移验证中的站点标识与视觉 fallback
- 当前权利/许可状态：待确认。仓库内未发现足以证明作者、权利人、许可条款或可再分发范围的来源记录
- 当前使用范围：仅限内部开发、迁移验证和验收环境；在权利与许可确认前，不得据此公开发布、对外分发、再授权或用于商业宣传

生产启用前，至少需要记录权利人、原始发布来源、适用许可或书面授权、允许的使用范围、是否允许修改，以及任何署名要求。确认后应更新本文件并重新核对发布产物中的文件哈希。

## 未迁移候选

除上述 `logo.png` 外，本轮不迁移其他 legacy 图片。明确排除的候选包括：

- `apps/legacy/public/assets/images/news/news1.png`
- `apps/legacy/public/assets/images/Production/765intro.png`
- `apps/legacy/public/assets/images/Production/Cinderellaintro.png`
- `apps/legacy/public/assets/images/Production/Millionintro.png`
- `apps/legacy/public/assets/images/Production/Sidemintro.png`
- `apps/legacy/public/assets/images/Production/Shinyintro.png`
- `apps/legacy/public/assets/images/Production/Gakuenintro.png`
- `apps/legacy/public/assets/images/hiro2026/xzg2026.png`
- `apps/legacy/public/assets/images/Information/guangzhou2026.png`
- `apps/legacy/public/assets/images/default.jpg`

这些路径仅用于说明本轮筛选边界，不构成授权、推荐或未来迁移承诺。若后续确需使用，必须逐项完成来源和许可核验，并以独立变更补充 provenance 记录。
