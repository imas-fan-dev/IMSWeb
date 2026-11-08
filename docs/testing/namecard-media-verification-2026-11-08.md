# 名片媒体验证记录：2026-11-08 预览环境

> 文档类型：执行记录
> 环境：`https://preview.idol-master.top`
> 关联计划：`docs/testing/namecard-media-acceptance-map.md`

## 0. 测试目的与预期

`#932「验收四页P」` 是预览环境的临时测试卡，不是业务数据。它用于
`docs/testing/namecard-media-acceptance-map.md` 中的 C3/C14/C15/C17：

- C3：创建 4 页卡（front、middle1、middle2、back），验证页数角标、页签、全屏翻页一致。
- C14：首审通过后仍是 4 页，公开面只出现已审图。
- C15：管理窗旋转 front/back/中间页、删除页面后，页数和顺序正确，背面不能被误当成中间页。
- C17：已发布卡修订通过后，pending 页合并进 live，原来未改的 front/back 不丢。

预期结果（所有观测面共用）：

1. 页面顺序为 `1 front, 2 middle, 3 middle, 4 back`，不得出现断档。
2. 每个 `thumbUrl` / `url` / 管理窗 `<img>` 都能真实解码，`naturalWidth > 0`。
3. 页数角标、页签数量、全屏可翻页数三者一致。
4. 审批后 pending 页清空，公开面不 404，原图可读。
5. 管理侧 front/back 入口也必须加载成功，不能只在页面级 URL 上成功。

当前实际进度见第 5 节；`#932` 已偏离预期（现在只有 3 页），不再作为“四页通过”的证据。

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

## 5. 测试计划与进度

| 用例 | 覆盖点 | 状态 | 证据/问题 |
| --- | --- | --- | --- |
| C3 四页创建 | 4 页、顺序、角标、页签 | 部分通过 | #932 初始 4 页；后续管理 probing 丢 1 张中间页，现 3 页 |
| C14 首审通过 | 通过后公开面、页集 | 通过 | #931 4 页全部解码；#932 首审后曾 4 页 |
| C15 管理媒体 | 旋转/删除、背面不误转 | 部分通过 | 本地旋转 front 成功；中间页旋转入口早期 500，本地同一接口通过；#932 数据被破坏 |
| C17 复审通过 | pending 页合并、旧 live 不丢 | 通过（本地 + 单测） | `approval promotes staged pages without dropping untouched live ones` |
| L1 属主我的名片 | 瓦片、画廊、pending | 未执行 | 需要预览属主账号 |
| L2 名片墙 | 瓦片、详情、全屏 | 部分通过 | #931/#932 页面级图片解码通过 |
| L3 用户主页 | 与 L2 一致 | 未执行 | 需要预览用户页 |
| L4 投稿审核 | 左 live / 右 draft、页集 | 部分通过 | 管理弹窗图片解码通过；复审左右对照未完整跑 |
| L5 认领审核 | 两张卡图片 | 未执行 | — |
| L6 补充审核 | 页集与旋转 | 未执行 | — |
| L7 反馈管理 | 瓦片与反馈卡一致 | 部分通过 | 管理弹窗打开成功，未逐条反馈核对 |

### 尚未关闭

1. `#932` 缺一张中间页，需要恢复数据或让属主重新提交 4 页。
2. C15 在预览站的中间页旋转要在修复后重新执行一次，并检查背面未被误转。
3. L1/L3/L5/L6 仍需要账号/无主卡等前置数据。
4. 最新部署的 Web/浏览器阶段尚未全部通过。
