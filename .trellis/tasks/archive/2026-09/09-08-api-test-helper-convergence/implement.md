# API 测试辅助层：实施计划

- [x] 建立重复helper与调用方清单，标注共同语义和有意差异。
- [x] 添加contract JSON helper，覆盖content-type拒绝和schema stripping检测。
- [x] 添加cookie/auth helper，覆盖含等号编码值、多Set-Cookie、round-trip、缺失/不匹配CSRF和realm隔离。
- [x] 迁移完全重复的JSON helper消费者并运行相关Fudaba/content suites。
- [x] 迁移cookie、Bearer、CSRF和fixture hash消费者，realm wrapper保持本地。
- [x] 添加migration catalog boundary helper；缺少目标文件必须失败。
- [x] 抽取immutable canonical Fudaba agency数据，保留各存储映射。
- [x] 仅在两个Fudaba migration suite语义一致时抽取受限JSON fixture writer。
- [x] 搜索确认旧重复定义消失或记录有意保留原因。
- [x] 运行受影响auth、Fudaba、migration、Wiki suites和API全量门禁。
