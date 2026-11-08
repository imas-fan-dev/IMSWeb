# 名片媒体验证记录：2026-11-08 预览环境

> 文档类型：执行记录
> 环境：`https://preview.idol-master.top`
> 关联计划：`docs/testing/namecard-media-acceptance-map.md`

## 1. 验证方式

不只检查 HTTP 状态，使用浏览器 `Image()` 实际解码，读取 `naturalWidth`/`naturalHeight`；
管理弹窗直接读取真实 `<img>` 的 `complete` 与尺寸。

## 2. 预览站结果

### #931（4 页卡）

| 页 | 解码结果 |
| --- | --- |
| front | 400×600 |
| middle 1 | 400×267 |
| middle 2 | 400×600 |
| back | 400×267 |

### #932（当前 3 页，原“验收四页P”）

| 页 | 解码结果 |
| --- | --- |
| front | 400×267 |
| middle 1 | 400×600 |
| back | 400×600 |

管理弹窗实际 `<img>`：

| 槽位 | URL | 解码结果 |
| --- | --- | --- |
| 正面 | `/api/admin/cards/932/media/live/page-9e724ce4-…?w=800` | 800×533 |
| 中间页 1 | `/api/admin/cards/932/media/live/page-34308ded-…?w=800` | 600×900 |
| 背面 | `/api/admin/cards/932/media/live/page-f0bb5a72-…?w=800` | 600×900 |

旧侧位入口实际加载：

| URL | 结果 |
| --- | --- |
| `/api/admin/cards/932/media/live/front` | 800×533 |
| `/api/admin/cards/932/media/live/back` | 600×900 |

## 3. 本轮发现

1. 已发布卡修订通过时只提升 pending 页，导致 live 正/背页被删；已修并加回归用例
   `approval promotes staged pages without dropping untouched live ones`。
2. pending 页对象未搬到 live 路径，批准后原图 404；已在审批中 move 并发布。
3. 管理入口按字面 `front`/`back` 取图，页面布局卡只有 `page-*` 行，旧 URL 404；
   已按页序首/末页兜底，本地与预览均实际解码通过。
4. `#932` 当前只有 3 页，缺一张中间页；“背面不可见”已消失，但页数据仍需属主重新提交或修复。

## 4. 回归命令

```bash
cd apps/api
IMS_TEST_POSTGRES_ENABLED=true \
IMS_TEST_POSTGRES_ADMIN_URL=postgresql://postgres@127.0.0.1:5432/postgres \
node ./node_modules/vitest/vitest.mjs run tests/server/namecard.test.ts
```

结果：20/20 通过（串行与默认并发各一次）。
