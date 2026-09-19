# 前端路由与测试编排：实施计划

- [x] 固化当前route、30个Web prerender、App排除项、SPA fallback和404行为基线。
- [x] 新增纯route descriptor和共享work slug常量。
- [x] 从descriptor构造React Router typed manifest并运行Web/App route unit tests。
- [x] 从descriptor生成Web/App prerender值，删除手写重复列表。
- [x] 实现API TypeScript artifact生成器的check/write模式并接入现有governance owner。
- [x] 改造API frontend route policy只消费生成数据，保留policy算法和全部404例外。
- [x] 添加manifest/prerender/build/policy双向测试与SPA正负样例。
- [x] 更新affected-workspace generated-path分类和治理测试。
- [x] 固化55/41/20 script基线与当前调用图。
- [x] 在现有脚本预算内建立governance、contracts、API、Web、delivery owner入口。
- [x] 添加内部prepared-artifact runner，消除同一次root/API/Web调用内的重复build或unit执行。
- [x] 保留integration job独立build，更新CI与测试文档调用同一owner命令。
- [x] 运行route、App、Web、API、routing、CI-governance及完整root检查和测试。
