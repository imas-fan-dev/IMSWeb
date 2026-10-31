# Wiki 阅读

[返回前端总索引](../../README.md)

本目录负责公开 Wiki 目录、内容页与剧情阅读。默认入口与 modern 兼容入口共用现代页面；
经典目录及剧情保留 Web 独立外壳，App 不注册经典入口。
注册关系以 [routes.ts](../../routes.ts) 与
[route-metadata.ts](../../route-metadata.ts) 为准。

## 能力与职责地图

| 参与者与能力 | 关键实现路径 | 职责 |
| --- | --- | --- |
| 读者浏览现代 Wiki 目录 | [modern/index](modern/index.tsx)、[modern 组件](modern/components/) | 企划切换、栏目与内容页筛选、目录展示 |
| 读者查看现代剧情 | [modern/story-page](modern/story-page.tsx)、[剧情分类](modern/components/story-category-section.tsx)、[剧情导航](modern/components/story-navigation-panel.tsx) | 剧情分类、卡片与阅读导航 |
| Web 读者使用经典目录与剧情 | [classic/index](classic/index.tsx)、[classic-story-page](classic/classic-story-page.tsx)、[classic 组件与样式](classic/components/) | 经典页面自身的展示与外壳 |
| 维护者调整共同展示规则 | [wiki-model](wiki-model.ts)、[CG 配音筛选](cg-voiced-idols.ts)、[学园卡片筛选](gakumas-s-card-cast-model.ts) | 卡片布局、颜色与特定资料筛选模型 |
| 多页面复用 Wiki UI | [components/wiki](../../components/wiki/) | 跨目录与管理页面可复用的业务展示 |

## 协作边界

- 公开页面负责读取与展示。企划、栏目及内容页由
  [目录后台](../admin/idols/README.md) 维护；剧情分类、来源、封面等由
  [剧情后台](../admin/stories/README.md) 维护。公开展示规则变更时需核对相应编辑端。
- 页面请求统一通过 [API facade](../../lib/api/index.ts)，请求实现归
  [wiki endpoints](../../lib/api/endpoints/wiki/)。该目录链接用于定位实现，不作为页面直接导入入口；
  JSON wire 来源为 [@imsweb/contracts](../../../../../packages/contracts/README.md)。
- modern 页面复用 Web/App 布局；classic 自带独立展示结构。共享模型调整需同时检查现代与经典阅读，
  目标差异需核对 [App 布局](../../layouts/app-layout.tsx) 和路由注册，不能仅按目录名推断。
- 页面私有展示继续留在 [modern/components](modern/components/) 或
  [classic/components](classic/components/)，只有跨页业务 UI 才放入
  [components/wiki](../../components/wiki/)；纯展示计算归命名模型文件。

## 测试入口

- 单元测试：[Wiki 测试目录](../../../tests/unit/pages/wiki/)，覆盖共享模型、modern 与 classic。
- 浏览器流程：[移动阅读](../../../tests/e2e/wiki-mobile.spec.ts)、
  [可访问性](../../../tests/e2e/wiki.accessibility.spec.ts)、
  [App Wiki](../../../tests/e2e/app-wiki.spec.ts)。

调整默认入口、兼容入口或公开展示与后台字段的协作时，同步维护本索引和相邻后台索引；
路由、权限及接口协议仍由实现与 contracts 定义。
