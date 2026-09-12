# Cloudflare 远端操作

## Scenario: R2 CORS 与精确 URL cache purge

### 1. Scope / Trigger

修改 R2 bucket CORS、验证 custom domain 资源，或清理 Cloudflare cache 时使用本契约。测试桶和生产桶是独立检查点；测试授权、快照和成功结果不能替代生产授权或生产验收。

### 2. Signatures

使用最新版 Wrangler读取和更新 R2 CORS：

```sh
pnpm dlx wrangler@latest r2 bucket domain list "$BUCKET"
pnpm dlx wrangler@latest r2 bucket cors list "$BUCKET"
pnpm dlx wrangler@latest r2 bucket cors set "$BUCKET" --file "$POLICY_FILE"
```

单文件cache purge使用zone API，并保留完整query string：

```http
POST /zones/{zone_id}/purge_cache
Content-Type: application/json

{"files":["https://asset.example/path/font.ttf?v=version"]}
```

### 3. Contracts

- 每个bucket在写入前单独保存完整REST response和可由Wrangler恢复的policy。快照放在仓库外，目录权限为`0700`，文件权限为`0600`，并记录SHA-256。
- 写入前用第二次独立控制面读取证明快照准确。写入后要求REST readback与候选JSON逐项相等。
- R2 CORS更新与zone cache purge是两套权限。Wrangler能够更新bucket CORS不代表同一OAuth token能够调用`/purge_cache`。
- purge payload只能包含用户明确授权的完整URL。query string属于cache key的一部分；不得改成hostname、prefix、whole-zone或`purge_everything`。
- 控制面readback、数据面HTTP和浏览器字体加载必须分别验证。任何一层失败都不能算发布成功。
- 生产操作必须有单独明确授权。只有生产URL通过后才能修改生产测试中的`fixme`。
- token、account ID、zone ID、回滚policy和凭据不得写入仓库或验证报告。

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| bucket/domain与授权目标不一致 | 写入前停止 |
| 快照无法解析、权限错误或二次readback不一致 | 写入前停止 |
| 候选写入或readback不一致 | 立即恢复快照并复验 |
| 精确URL purge返回认证或权限错误 | 不扩大范围、不切换身份；立即恢复快照 |
| 允许origin没有精确ACAO或未知origin被允许 | 立即恢复快照 |
| MIME、对象字节、Range或HEAD transport回归 | 立即恢复快照 |
| 浏览器`document.fonts.load()`或`check()`失败 | 立即恢复快照 |
| 回滚控制面正确但原URL仍有候选header | 等待传播窗口，并比较原URL与新缓存键；未收敛时继续标记blocked |

`HEAD`只验证状态、MIME和零响应体等运输语义。GET-only候选策略不要求跨域HEAD返回ACAO；浏览器字体CORS验收使用真实GET。

### 5. Good / Base / Bad Cases

- Good: 保存测试桶快照，应用候选，purge两个已授权完整URL，验证允许/未知/no-Origin、Range与三浏览器，然后停止等待生产授权。
- Base: 只读检查bucket、domain、CORS和公开资源，不执行写入或purge。
- Bad: 因Wrangler CORS写入成功而推断token也有Cache Purge权限，或在精确URL purge失败后改用整域、整zone或另一身份继续。

### 6. Tests Required

每个远端检查点至少验证：

- 允许origin的GET返回成功状态、正确MIME、完整字节和与请求origin完全相同的ACAO；
- 未知origin和无Origin请求不返回ACAO；
- `Range: bytes=0-31`返回`206`、32字节和正确`Content-Range`；
- 相关非字体资产仍能GET，HEAD transport语义没有回归；
- Chromium desktop、移动Chromium和Firefox从批准的页面origin执行`document.fonts.load()`与`document.fonts.check()`；
- 回滚后控制面等于快照，原URL和新缓存键的数据面均恢复。

### 7. Wrong vs Correct

#### Wrong

```sh
curl "$API/zones/$ZONE_ID/purge_cache" \
  --data '{"purge_everything":true}'
```

该命令扩大了授权范围，也无法证明具体cache key已刷新。

#### Correct

```sh
jq -nc --arg font "$FONT_URL" --arg image "$IMAGE_URL" \
  '{files: [$font, $image]}' > "$TEMP_PURGE_PAYLOAD"
curl "$API/zones/$ZONE_ID/purge_cache" \
  --data-binary "@$TEMP_PURGE_PAYLOAD"
```

`FONT_URL`和`IMAGE_URL`必须是本次授权中的完整URL，临时payload放在仓库外并在检查点结束后删除。
