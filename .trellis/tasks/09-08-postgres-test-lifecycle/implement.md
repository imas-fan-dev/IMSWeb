# PostgreSQL 测试生命周期：实施计划

- [x] 为enabled、disabled、无效flag、URL优先级、协议和回环限制添加不连接数据库的配置测试。
- [x] 实现CJS兼容的共享allocator和安全数据库命名。
- [x] 添加创建后失败、migration失败、open sibling和close失败的cleanup回归。
- [x] 改造显式`createPostgresTestHarness()`为薄适配器，seed留在适配层。
- [x] 改造`createPostgresTestDatabase()`和`connectPostgresTestDatabase()`为`TestContext`适配器。
- [x] 把`node-security`数据库创建与删除迁移到共享核心。
- [x] 统一全部PostgreSQL-backed测试的skip配置，覆盖当前无predicate调用方。
- [x] 保留自定义migration catalog的隔离回放路径。
- [x] 搜索确认`CREATE DATABASE`、`DROP DATABASE`、URL解析和命名只有一个owner。
- [x] 运行repository concurrency、migration replay、node-security及全部API测试。
- [x] 查询并确认测试结束后无`ims_test_*`等孤儿数据库。
