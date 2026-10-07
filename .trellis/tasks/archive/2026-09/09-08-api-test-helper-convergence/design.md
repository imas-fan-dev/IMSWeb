# API 测试辅助层：技术设计

## 抽取边界

研究发现15个`contractJson()`、9个`assertRawJsonConforms()`以及重复的Set-Cookie、Cookie header、Bearer、CSRF和fixture hash代码。抽取仅覆盖共同语义：

- contract JSON helper负责状态、JSON content type、schema parse和untouched payload deep equality；
- wire assertion与返回parsed value分为两个明确函数，避免调用方丢失原始JSON检查；
- cookie/auth模块负责Set-Cookie解析、Cookie序列化、Bearer header、显式CSRF组合和fixture SHA-256；
- Backoffice与Platform的realm组合wrapper继续留在各自fixture附近。

迁移catalog helper负责截取指定boundary之前的migration文件，并在缺少boundary时失败。canonical Fudaba agency数据可以共享，SQL/Wiki映射留在调用方。

## 保留本地的代码

response factory、raw token断言、领域专用login断言、SQLite metadata source、media migration状态机和历史row builder不合并。新模块按职责命名，不能创建通用`helpers.ts`或barrel。

## 迁移顺序

1. helper自身负向测试；
2. 两个以上完全重复消费者；
3. Fudaba/auth高重复调用方；
4. migration catalog和canonical data；
5. 搜索并逐项解释有意保留的本地实现。

每批迁移后运行对应领域suite，删除动作单独审查。
