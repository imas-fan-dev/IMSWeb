# 地图地点搜索验收

地图任务的实现和验收已完成，可交主会话做最终源码审核与 scoped commit。图片任务仍由其独立 worker 处理；本记录不判断图片任务或整个共享 checkout 的发布状态。

- [x] 共享控件按按钮或 Enter 显式查询，Enter 不提交外层事务所 form；加载、空结果、503/429/502 文案及 attribution 单测通过。
- [x] 事务所地点选择保留未保存名称与介绍，只更新城市、地址及精确坐标。桌面与移动浏览器在选择后、保存前证明没有 office/location PUT。
- [x] 公开地图选择结果后 bbox 包含结果坐标且经度范围小于一度；临时 marker、焦点恢复、清除及移动边界均通过。
- [x] 匿名 public-read+map 查询、office-only write+auth 回退、owner 授权及公开 regional 隐私边界通过 88/88 API 回归。其后并行图片 worker 的 API 改动由主会话合并验收。
- [x] Compose 显式转发 provider 三项配置，10 个配置测试通过；默认 provider 继续关闭。
- [x] 56/56 focused Web units，full Web typecheck/lint/build，App build；最后的测试修改另通过 typecheck/lint 和 12/12 source-policy tests。
- [x] Web desktop/mobile Playwright 7/7；packaged App portrait/landscape 地图 Playwright 9/9。截图位于 `/tmp/imsweb-map-place-search-playwright/`。
- [x] 真实 provider 浏览器 smoke 在 Web desktop/mobile 与 packaged App portrait/landscape 共 4/4 场景通过。搜索经 4186 Web proxy、3206 Hono application 和真实 Valkey；配置与搜索均为 API pass-through。实际 Nominatim 返回西岸艺术中心，city=上海市，31.1693193/121.457005；真实 OpenFreeMap tiles 渲染，选择后定位、归属、marker 清除和无 mutation 均有断言。
- [x] 最后一次 `check:rules`、`check:boundaries` 和 `git diff --check` 通过。Trellis manifests 与验收记录已更新。
- [x] owned 4186/4187/3206 listener 已停止，临时 live spec 已从 Web 测试目录删除，Web/App 验证窗口释放。PostgreSQL/Valkey 保留运行。

所有命令、失败原因及证据位置见 `verification.md`。本次没有修改生产配置、部署或原生设备；App 结果来自构建后的浏览器表面。此前 staged 10-04 任务与三个 API build script 删除保持原样；未 stage、commit、archive 或 push。
