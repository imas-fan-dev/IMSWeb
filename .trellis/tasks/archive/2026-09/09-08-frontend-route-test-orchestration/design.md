# 前端路由与测试编排：技术设计

## 路由权威来源

新增纯数据`apps/web/app/route-metadata.ts`，记录route path、page module、layout、Web/App target、delivery mode和concrete prerender instances。`routes.ts`继续导出React Router 7 typed `RouteConfig`，但从描述源构造；`react-router.config.ts`从同一来源生成Web/App prerender列表。

八个work slug抽到小型常量，由作品页面和路由描述共同消费。首页smoke列表仍是有意抽样，站点header、admin layout和App tab仍是curated navigation/permission模型，不强制变成完整路由清单。

## API静态投递

由路由描述生成一个tracked API TypeScript artifact。API继续拥有prefix、敏感路径、URL decode、SPA fallback和404决策算法，只消费生成的delivery/prerender数据。preserve当前`/community/cards/submissions/:id`、`/packages/:siteSlug`和任意`/works/:workSlug`的404行为，不从React Router注册自动推断SPA fallback。

生成器必须提供check和write模式；现有script数量已达上限，因此接入`check:rules`或替换现有owner内部实现，不新增root/package alias。generated API path加入affected-workspace integration分类并有代表性测试。

## 双向验证

- 每个prerender route必须在manifest注册；
- 每个built document必须被API policy拥有；
- 每个policy prerender必须存在于build；
- 每个SPA pattern必须有正向和负向case；
- descriptor变更而generated artifact未更新必须fail；
- 路由增删只修改描述源，生成产物不手写。

## 测试编排

在不增加55/41/20脚本数量的前提下，将governance、contracts、API、Web、delivery分配给现有owner入口，root只调度。先建立内部prepared-artifact runner，再消除同一次调用内的重复build/test。不同CI job内的integration build保持独立。

目录或入口变化同步更新CI、测试文档、affected-workspace和governance tests。每一步保持root `build`、`check`、`test`可达API与Web。
