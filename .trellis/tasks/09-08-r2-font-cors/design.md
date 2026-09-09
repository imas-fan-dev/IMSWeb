# R2 字体 CORS：技术设计

## 当前链路

`apps/web/app/pages/works/brand-assets.ts` 直接引用 `https://imas-assets.texasoct.tech/.../iris-idol.ttf`。浏览器请求不经过 Hono。只读验证确认生产 custom domain 连接 `imsweb-media-public-prod`，对象返回 `200 font/ttf`，但允许 origin 请求没有 `Access-Control-Allow-Origin`。

测试目标是 `imsweb-media-public-test`，custom domain 是 `test.imas-assets.texasoct.tech`。相同对象路径返回 `200 font/ttf`。测试桶当前策略返回 `Access-Control-Allow-Origin: *`，允许 `GET`、`HEAD` 和 Range相关header。测试阶段将验证收紧后的生产候选策略，不能把当前宽策略的成功当作修复证据。

仓库中的 `deploy/r2-public-cors.json` 是生产候选策略，允许 `https://imas.texasoct.tech` 与 `http://127.0.0.1:4173` 的 `GET`。测试桶检查点先应用这份候选策略；是否需要保留其他跨域方法或header由测试结果决定，发现回归时立即恢复完整快照。

## 变更所有者

- 远端响应所有者：Cloudflare R2 bucket CORS policy。
- 仓库期望状态：`deploy/r2-public-cors.json`。
- 操作说明：`docs/architecture/object-storage.md`。
- 浏览器验收：`apps/web/tests/e2e/home.smoke.spec.ts`。
- R2 资产验收：`apps/api/scripts/migration/legacy-brand-assets.js` 及其测试。

## 执行流程

### 测试桶检查点

1. 再次读取 `imsweb-media-public-test` 的domain、字体响应和现有CORS。
2. 通过Cloudflare API把精确CORS JSON保存到仓库外临时文件，并验证它可以作为Wrangler rollback输入。
3. 使用当前OAuth身份尝试把`deploy/r2-public-cors.json`应用到测试桶。权限失败时停止，不得触碰生产桶。
4. 从控制面readback确认策略完全一致，等待传播；响应仍旧时只对获准的测试字体和已知 PNG 两个精确 URL 执行cache purge。
5. 对生产站点origin、本地4173 origin、未知origin和无Origin请求执行真实GET，检查状态、MIME、CORS和`Vary`。
6. 从`http://127.0.0.1:4173`加载一个隔离测试页面，使用测试字体URL执行`document.fonts.load()`；不修改产品字体常量。
7. 运行测试桶相关资产和range回归。任何回归都恢复快照并重复readback与HTTP验证。
8. 保存不含凭据的验证摘要，然后停止远端操作。

### 生产检查点

生产写入必须等待新的用户授权。获批后，生产桶重复快照、候选策略、readback、传播、必要的单URL purge和正反HTTP验证。只有生产URL通过三浏览器字体加载后，才移除Playwright `fixme`并更新生产验收文档。

## 安全边界

- 候选CORS只允许两个明确origin和`GET`，不增加写方法、credentials或通配origin。
- 当前授权只覆盖测试桶；生产桶、custom domain、DNS和对象保持不变。
- cache purge只针对当前检查点获准的测试字体和已知 PNG 两个精确 URL；无独立purge权限时恢复快照并交给zone owner。
- 不把控制面token、account ID或回滚快照写入仓库。

## 回滚

每个bucket有独立快照和回滚。测试桶若出现允许origin无响应、未知origin被允许、range/asset回归或浏览器加载失败，立即恢复测试桶完整策略；生产检查点失败时只恢复生产桶。必要时仅清理当前检查点明确授权的精确URL，然后重复控制面和HTTP正反验证。
