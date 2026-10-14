# 修复 R2 字体 CORS

## Goal

先在 R2 测试桶验证可回滚的字体 CORS 候选策略，再经单独授权把同一策略部署到生产公开 URL，并恢复当前标记为 `fixme` 的浏览器验证。

## Requirements

- 已确认测试目标是 `imsweb-media-public-test` 和 `test.imas-assets.texasoct.tech`；相同字体对象存在并返回 `200 font/ttf`。
- 测试桶当前允许任意 origin，并支持 `GET`、`HEAD`、Range相关header；应用候选策略前必须保存完整快照，以便发现其他测试资产回归时恢复。
- 第一检查点只允许当前 OAuth 身份尝试更新测试桶。应用已审查的生产候选策略，验证精确允许的origin、`GET`、MIME和浏览器字体加载。
- 测试通过后停止并报告。没有新的明确授权，不得写入 `imsweb-media-public-prod`、移动custom domain、修改DNS或执行全zone cache purge。
- 生产获批后再保存生产CORS快照、应用同一候选策略并完成生产URL验证。
- 仓库存在 IaC 或配置 owner 时同步更新；不存在时记录可重复的受控操作与回滚。
- 不提交 Cloudflare token、账户 ID、bucket 凭据、回滚快照或生产数据。
- 生产 HTTP header 与 `document.fonts.load()` 均成功后才能移除 `fixme`。

## Acceptance Criteria

- [ ] 测试桶身份、domain和字体对象经过读取验证，原CORS配置有可恢复快照。
- [ ] 测试桶候选策略readback准确；允许origin成功、未知origin被拒绝，字体返回正确MIME并通过隔离浏览器加载。
- [ ] 测试桶验证后没有未经授权的生产桶、DNS、domain或全zone cache变更。
- [ ] 生产另行获批后，生产字体URL返回适用的`Access-Control-Allow-Origin`，并通过Chromium、移动Chromium和Firefox字体加载验证。
- [ ] 对应Playwright `fixme`只在生产验证成功后移除并稳定通过。
- [ ] 仓库内配置/测试、测试文档和远端操作证据一致；任何缓存清理都有明确范围且不依赖旧响应。

## Out of Scope

- 测试桶检查点之外的其他 R2 bucket、对象或 custom domain 调整。
- 在获得后续单独授权前写入生产桶。
- Web 代理字体、修改生产字体常量指向测试域，或把字体复制到仓库作为规避方案。
- 与字体交付无关的页面视觉变更。

## Confirmed Decisions

- 用户已授权当前 Wrangler OAuth 身份更新测试桶 CORS，并仅清理测试域的字体和已知 PNG 两个精确 URL；该授权不覆盖生产桶、整域、整 zone 或 purge everything。
- 当前身份已证明可以更新测试桶 CORS，但对 zone purge API 的精确 URL 请求返回 `10000 Authentication error`。没有受控的 Cache Purge 身份前，必须回滚并停止，不得切换身份或扩大清理范围。
- 生产授权延后到测试桶证据完成之后，因此不会阻塞其他五个子任务启动，但会阻塞本子任务和父任务最终完成。
