# R2 字体 CORS：实施计划

## 测试桶检查点

- [x] 用户授权当前OAuth身份尝试更新`imsweb-media-public-test`；生产桶不在授权范围内。
- [x] `wrangler whoami`、bucket和domain readback再次确认测试目标。
- [x] 通过REST GET保存测试桶现有CORS响应与可恢复policy到仓库外系统临时目录，验证JSON有效、目录为`0700`、文件为`0600`，并与第二次控制面读取完全一致。
- [x] 记录测试字体URL变更前的允许origin、未知origin和无Origin HTTP证据。
- [x] 按首次用户授权执行一次`deploy/r2-public-cors.json`测试桶写入；命令成功，未切换身份或触碰生产桶。
- [x] 从控制面核对首次候选完整策略并等待30秒；字体URL无需purge，当时失败的PNG URL不在允许purge范围内。
- [x] 按第二次授权重新快照并写入候选；精确readback通过，但仅含获准字体和PNG URL的purge请求返回`10000 Authentication error`，因此立即恢复完整快照。
- [x] 验证生产站点origin和4173 origin返回匹配CORS头，未知origin和无Origin请求不返回允许头。
- [ ] 用测试字体URL执行隔离的三浏览器`document.fonts.load()`验证，不修改产品字体常量；第二次尝试在purge认证失败后按顺序停止，未进入浏览器阶段。
- [ ] 运行测试桶资产、range和相关Web回归；首次候选窗口内已缓存PNG仍返回旧wildcard ACAO。第二次尝试在purge前失败，两次均恢复完整快照；最新只读探针确认控制面、GET、HEAD和Range已在原URL及新缓存键恢复。
- [x] 记录不含凭据的测试桶写入、候选readback、HTTP结果、回滚和阻塞原因，见`evidence/test-bucket-checkpoint.md`。
- [x] 停止远端操作并提交测试证据；本检查点不申请或尝试生产授权。

## 生产检查点

- [ ] 获得明确的`imsweb-media-public-prod`更新授权；测试桶授权不可复用。
- [ ] 重新确认生产bucket/domain，保存独立生产CORS快照和变更前HTTP证据。
- [ ] 应用同一候选策略到生产桶并完成控制面readback、传播和必要的单URL purge。
- [ ] 验证生产URL的允许origin、未知origin、MIME、`Vary`和三浏览器字体加载。
- [ ] 扩展R2品牌资产验收，使带Origin的GET检查CORS而不是只检查无Origin HEAD。
- [ ] 移除`home.smoke.spec.ts`字体测试的`fixme`并运行三浏览器项目。
- [ ] 更新object-storage文档中的直接R2交付事实、操作和回滚步骤。
- [ ] 运行Web typecheck/lint、受影响Playwright、API资产测试、rules和boundaries。
- [ ] 记录生产变更和回滚证据，不记录凭据内容。
