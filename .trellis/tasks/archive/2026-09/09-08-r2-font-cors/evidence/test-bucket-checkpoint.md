# 测试桶 CORS 检查点证据

检查时间：2026-09-08T19:04:00Z

## 结论

本次按用户新增授权执行了一次测试桶 CORS 写入。候选策略写入成功，控制面 readback 与 `deploy/r2-public-cors.json` 完全一致。字体的允许 origin、拒绝 origin、MIME 和 range 请求均通过，但已存在的 PNG 资产仍从 Cloudflare cache 返回旧的 `Access-Control-Allow-Origin: *`。该 header 不符合候选策略，因此立即恢复完整快照。

回滚后的控制面 readback 与快照完全一致。等待 30 秒后，原 URL 的状态、MIME、对象字节数和 range 行为均正常，但缓存响应尚未恢复旧策略的 wildcard CORS header。没有可证明的独立 cache purge 权限，而且授权最多只允许清理测试字体 URL，不能清理失败的 PNG URL。因此检查点状态为 `BLOCKED`。

没有访问或修改生产 bucket、生产 domain、DNS、custom domain attachment、对象、产品字体常量、生产 cache 或生产 Playwright `fixme`。

2026-09-08T23:00Z 后，用户又授权了一次仅包含测试字体和已知 PNG 两个精确 URL 的 cache purge。新的测试桶快照通过权限、JSON、哈希和独立 REST readback 校验；候选 CORS 再次写入成功，REST readback 与仓库候选逐项相同。随后提交的两 URL purge 被 Cloudflare 以 `10000 Authentication error` 拒绝。该请求没有扩大为 hostname、prefix、whole-zone 或 purge-everything，也没有切换身份。

purge 失败后未访问候选数据面，也未启动浏览器验证；测试桶立即恢复新快照。回滚 REST readback 与快照完全相同。最终只读探针确认字体和 PNG 的 GET、HEAD、MIME、完整字节、Range 及 wildcard CORS 已恢复；字体 HEAD 的原 URL 与新缓存键在一个传播窗口后均返回 wildcard ACAO。

## 写入前门禁

- 起点：`release/v1.1` 的 `fd740ace`。
- Wrangler：`4.128.0`。
- 身份：当前 OAuth 身份有效，控制面读取成功。公开的 permission summary 仍未列出 R2 write/edit scope；本次实际写入尝试由用户最新指令单独授权。
- bucket：`imsweb-media-public-test`。
- domain：`test.imas-assets.texasoct.tech` 已启用，ownership 和 SSL 状态均为 `active`。
- 字体：完整 GET 返回 `200 font/ttf` 和 25904 字节。
- 已存在资产：PNG GET 返回 `200 image/png` 和 747816 字节。
- 变更前策略：1 条规则，origin 为 `*`，methods 为 `GET`、`HEAD`，allowed headers 为 `Range`、`If-Match`，exposed headers 为 `ETag`、`Accept-Ranges`、`Content-Range`、`Content-Length`，max age 为 3000 秒。

## 新回滚快照

完整 REST response 和可供 Wrangler 恢复的 policy 保存在仓库外：

`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/imsweb-r2-font-cors-test-before-20260908T190400Z`

目录权限为 `0700`，`cors-response.json` 和 `cors-policy.json` 权限均为 `0600`。两个 JSON 文件已解析验证，快照 policy 与第二次独立控制面读取完全一致。仓库不保存快照内容。

- REST response SHA-256：`f47a604158146336f30d4bace4b76867aecccd98abdaaf262c4cb5c09a9a0a6c`
- rollback policy SHA-256：`fe73dfc42443b6b8335e65135f042212b89dfc529387d26d73718ddf5ed516e6`

## 候选策略结果

唯一一次初始写入命令：

```sh
pnpm dlx wrangler@latest r2 bucket cors set imsweb-media-public-test --file deploy/r2-public-cors.json
```

命令退出状态为 0。紧接着的 REST readback 与候选文件完全一致：1 条规则，只允许 `https://imas.texasoct.tech` 和 `http://127.0.0.1:4173` 执行 `GET`，没有 allowed headers、exposed headers 或 max age。

等待 30 秒后，候选策略 HTTP 检查为 7/8：

| 检查 | 结果 |
| --- | --- |
| 两个允许 origin 的字体 GET | 2/2；`200 font/ttf`，25904 字节，ACAO 与请求 origin 完全一致，`Vary: Origin` |
| 未知 origin 与无 Origin 字体 GET | 2/2；`200 font/ttf`，均无 ACAO |
| `Range: bytes=0-31` | 1/1；`206 font/ttf`，32 字节，`Content-Range: bytes 0-31/25904`，ACAO 与本地 origin 一致 |
| PNG GET | 0/1；`200 image/png` 和 747816 字节正确，但 cache HIT 仍返回旧 ACAO `*` |
| PNG HEAD | 2/2；无 Origin HEAD 保持 `200`、正确 MIME 和长度；带本地 Origin 的 cache HIT 也保持可用 |

字体响应为 cache MISS，未使用 cache purge。PNG 的旧 header 是回滚触发条件。由于失败 URL 不是获准清理的测试字体 URL，未扩大 purge 范围。

## 回滚结果

使用新快照中的完整 policy 恢复测试桶，Wrangler 退出状态为 0。回滚 REST readback 与快照完全一致。

等待 30 秒后重复 7 项核心 HTTP/range 检查：

- 状态、MIME、字体 25904 字节、PNG 747816 字节、`206` range 和 32 字节 body：7/7 通过。
- 若要求原 wildcard policy 的 header 立即出现在相同 cache URL，结果为 2/7；五个带 Origin 的请求仍是 cache HIT，并继续返回候选期间缓存的精确 ACAO 或无 ACAO。
- 无 Origin 字体 GET 和 PNG HEAD 均无 ACAO，符合两种策略的共同预期。

控制面回滚已完成，但相同 URL 的缓存 header 在首次等待 30 秒后尚未传播回旧策略。没有执行 cache purge。

2026-09-08T19:22:38Z 的后续只读探针确认传播已经完成。字体和 PNG 的原 URL 及带独立 cache-busting query 的 URL 共 4 项均返回 `206`、32 字节、正确 MIME、正确 `Content-Range`、`Vary: Origin` 和 wildcard ACAO；原 URL 为 cache HIT，新缓存键为 cache MISS。回滚后的控制面与数据面因此重新一致。

## 第二次精确 URL purge 尝试

- 新快照：`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/imsweb-r2-font-cors-test-before-20260908T230006Z.uv4UXy`。
- 目录权限：`0700`；两个 JSON 文件权限：`0600`。
- REST response SHA-256：`f47a604158146336f30d4bace4b76867aecccd98abdaaf262c4cb5c09a9a0a6c`。
- rollback policy SHA-256：`fe73dfc42443b6b8335e65135f042212b89dfc529387d26d73718ddf5ed516e6`。
- preflight：唯一活动目标 zone 可读取，测试桶当前 CORS 与快照完全相同。
- 候选写入和 REST readback：通过。
- purge payload：仅两个已授权的完整测试域 URL，字体 query 保持不变。
- purge结果：失败，Cloudflare `10000 Authentication error`，未清除任何已授权或未授权缓存。
- 回滚：Wrangler恢复成功，REST和Wrangler readback均与快照完全一致。
- 回滚数据面：字体/PNG四种Origin GET、完整字节和MIME为8/8；两项Range为2/2；PNG HEAD为1/1；字体HEAD原URL和新缓存键为2/2。通配策略恢复后，Origin请求返回`*`，无Origin请求不返回ACAO。

## 浏览器与远端操作

- Chromium desktop、Chromium mobile、Firefox `document.fonts.load()`：0/3，因资产 header 不一致已触发回滚，未继续执行。
- test bucket CORS候选写入：2次，均成功。
- test bucket CORS回滚写入：2次，均成功。
- 精确URL cache purge：1次请求，认证失败，未执行清理。
- production bucket、domain、cache、DNS、对象和应用代码：未访问或修改。

## 状态

`BLOCKED`。候选字体行为在首次尝试中通过，但缓存资产没有在候选窗口内统一采用候选header；第二次尝试获准清理两个精确URL，但当前OAuth身份被zone purge API以`10000 Authentication error`拒绝。三浏览器验证仍未执行。回滚策略已在控制面和原URL/新缓存键的数据面恢复一致。继续测试桶检查点需要一个对目标zone具有Cache Purge权限的受控身份；本结果不能作为生产发布证据。
