-- ims:migration-phase: post-data
-- Repository public facts, frozen with this migration. Match by project and
-- reviewed names, never by installation-specific IDs. Preserve maintained data.
SET LOCAL lock_timeout='5s';
LOCK TABLE catalog_characters,catalog_character_project_profiles,wiki_entries,wiki_project_settings IN EXCLUSIVE MODE;
CREATE TEMP TABLE catalog_public_fact_seed (
    project_code text, match_name text, source_name text,
    birth_month integer, birth_day integer, color text
) ON COMMIT DROP;
-- Birthday source SHA-256: c698671a646cf94577a82df493a5c400da0a9faab11b199f8085942be73f419d
INSERT INTO catalog_public_fact_seed VALUES
('765','天海春香','天海春香',4,3,'#e22b30'),
('765','如月千早','如月千早',2,25,'#2743d2'),
('765','萩原雪步','萩原雪步',12,24,'#d3dde9'),
('765','高槻弥生','高槻弥生',3,25,'#f39939'),
('765','秋月律子','秋月律子',6,23,'#01a860'),
('765','三浦梓','三浦梓',7,19,'#9238be'),
('765','水濑伊织','水濑伊织',5,5,'#fd99e1'),
('765','菊地真','菊地真',8,29,'#515558'),
('765','双海亚美','双海亚美',5,22,'#ffe43f'),
('765','双海真美','双海真美',5,22,'#ffe43f'),
('765','星井美希','星井美希',11,23,'#b4e04b'),
('765','我那霸响','我那霸响',10,10,'#01adb9'),
('765','四条贵音','四条贵音',1,21,'#a6126a'),
('765','音无小鸟','音无小鸟',9,9,'#FFF6A4'),
('765','诗花','诗花',9,16,'#E5F9E4'),
('765','玲音','玲音',8,22,'#5A2B8D'),
('765','奥空心白','奥空心白',7,26,'#FCFAD4'),
('765','亚夜','亚夜',9,6,'#3F3538'),
('876','日高爱','日高爱',6,25,'#E85786'),
('876','水谷绘理','水谷绘理',3,7,'#00adb9'),
('876','秋月涼','秋月凉',9,15,'#B2D468'),
('cg','千川千寻','千川千寻',11,28,'#CFEF8B'),
('cg','岛村卯月','岛村卯月',4,24,'#f67599'),
('cg','中野有香','中野有香',3,23,'#e277cd'),
('cg','水本紫','水本紫',10,18,'#e3bbd6'),
('cg','福山舞','福山舞',1,21,'#ff68b5'),
('cg','椎名法子','椎名法子',10,10,'#f8485e'),
('cg','今井加奈','今井加奈',3,3,'#bf2e8d'),
('cg','持田亚里沙','持田亚里沙',8,24,'#ef8d82'),
('cg','三村加奈子','三村加奈子',1,6,'#ffb1bb'),
('cg','奥山沙织','奥山沙织',6,12,'#dc6f82'),
('cg','间中美里','间中美里',11,6,'#d1e9dc'),
('cg','小日向美穗','小日向美穗',12,16,'#db3eb1'),
('cg','绪方智绘里','绪方智绘里',6,11,'#6cc24a'),
('cg','五十岚响子','五十岚响子',8,10,'#f3b6c5'),
('cg','柳濑美由纪','柳濑美由纪',3,16,'#eb5c22'),
('cg','樱井桃华','樱井桃华',4,8,'#ef95cf'),
('cg','江上椿','江上椿',2,6,'#dc595f'),
('cg','长富莲实','长富莲实',3,19,'#e0878d'),
('cg','横山千佳','横山千佳',12,18,'#fc87bf'),
('cg','关裕美','关裕美',8,17,'#ffb3ab'),
('cg','太田优','太田优',1,28,'#e25097'),
('cg','栋方爱海','栋方爱海',8,1,'#c7579a'),
('cg','藤本里奈','藤本里奈',10,14,'#623b2a'),
('cg','大原满','大原满',4,12,'#d08041'),
('cg','游佐梢','游佐梢',2,19,'#f4a6d7'),
('cg','大沼胡桃','大沼胡桃',3,30,'#f7bdbb'),
('cg','一之濑志希','一之濑志希',5,30,'#a50050'),
('cg','前川未来','前川未来',2,22,'#ce0037'),
('cg','赤西瑛梨华','赤西瑛梨华',7,7,'#db3269'),
('cg','松原早耶','松原早耶',12,28,'#df4895'),
('cg','相原雪乃','相原雪乃',2,14,'#c66145'),
('cg','宫本芙蕾德莉卡','宫本芙蕾德莉卡',2,14,'#a20067'),
('cg','小早川纱枝','小早川纱枝',10,18,'#e56db1'),
('cg','西园寺琴歌','西园寺琴歌',1,23,'#e8cdd0'),
('cg','双叶杏','双叶杏',9,2,'#f8a3bc'),
('cg','杨菲菲','杨菲菲',9,29,'#db6c63'),
('cg','桃井小豆','桃井小豆',7,7,'#8b2567'),
('cg','凉宫星花','凉宫星花',8,28,'#eb8eba'),
('cg','月宫雅','月宫雅',10,30,'#fad6d8'),
('cg','兵藤レナ','兵藤蕾娜',10,3,'#c91265'),
('cg','丹羽仁美','丹羽仁美',6,4,'#a01e28'),
('cg','道明寺歌铃','道明寺歌铃',1,1,'#d22630'),
('cg','柳清良','柳清良',5,12,'#e1c7e0'),
('cg','井村雪菜','井村雪菜',8,27,'#dc3762'),
('cg','日下部若叶','日下部若叶',5,4,'#bdce72'),
('cg','榊原里美','榊原里美',8,27,'#f5bf2b'),
('cg','舆水幸子','舆水幸子',11,25,'#c1a0da'),
('cg','安斋都','安斋都',1,6,'#ef8e64'),
('cg','浅野风香','浅野风香',2,11,'#5f8b72'),
('cg','大西由里子','大西由里子',3,20,'#ba0f6d'),
('cg','安部菜菜','安部菜菜',5,15,'#ef4b81'),
('cg','工藤忍','工藤忍',3,9,'#dd3149'),
('cg','栗原宁宁','栗原宁宁',9,9,'#2c70b7'),
('cg','古贺小春','古贺小春',4,1,'#c2e189'),
('cg','克拉莉丝','克拉莉丝',8,26,'#f8d47c'),
('cg','佐久间麻由','佐久间麻由',9,7,'#da1884'),
('cg','村松樱','村松樱',3,27,'#dd5c6e'),
('cg','白菊萤','白菊萤',4,19,'#c964cf'),
('cg','早坂美玲','早坂美玲',5,9,'#c800a1'),
('cg','有浦柑奈','有浦柑奈',3,6,'#de4a6a'),
('cg','乙仓悠贵','乙仓悠贵',10,6,'#e4bec3'),
('cg','原田美世','原田美世',11,14,'#db4044'),
('cg','池袋晶叶','池袋晶叶',6,10,'#d12c4c'),
('cg','辻野朱里','辻野朱里',11,5,'#e10600'),
('cg','黑埼千岁','黑埼千岁',11,10,'#ef3340'),
('cg','白雪千夜','白雪千夜',2,4,'#efd7e5'),
('cg','涩谷凛','涩谷凛',8,10,'#009cde'),
('cg','黑川千秋','黑川千秋',2,26,'#b21d23'),
('cg','松本沙理奈','松本沙理奈',9,1,'#2c4b9e'),
('cg','桐野绫','桐野绫',4,8,'#b73767'),
('cg','高桥礼子','高桥礼子',5,8,'#74151b'),
('cg','相川千夏','相川千夏',11,11,'#754e87'),
('cg','川岛瑞树','川岛瑞树',11,25,'#485cc7'),
('cg','神谷奈绪','神谷奈绪',9,16,'#9678d3'),
('cg','上条春菜','上条春菜',4,10,'#5bc2e7'),
('cg','荒木比奈','荒木比奈',4,9,'#a0d884'),
('cg','东乡爱','东乡爱',2,7,'#942747'),
('cg','多田李衣菜','多田李衣菜',6,30,'#0077c8'),
('cg','水木圣来','水木圣来',4,27,'#87d0f1'),
('cg','佐佐木千枝','佐佐木千枝',6,7,'#0171ce'),
('cg','三船美优','三船美优',2,25,'#12bfb2'),
('cg','服部瞳子','服部瞳子',10,11,'#5c3993'),
('cg','木场真奈美','木场真奈美',8,8,'#8c8595'),
('cg','藤原肇','藤原肇',6,15,'#9595d2'),
('cg','新田美波','新田美波',7,27,'#6ec4e9'),
('cg','水野翠','水野翠',12,5,'#4199a3'),
('cg','古泽赖子','古泽赖子',5,18,'#3c3884'),
('cg','橘爱丽丝','橘爱丽丝',7,31,'#5b87da'),
('cg','鹭泽文香','鹭泽文香',10,27,'#606eb2'),
('cg','八神牧野','八神牧野',11,7,'#a6a4e0'),
('cg','莱拉','莱拉',5,21,'#7ce0d3'),
('cg','浅利七海','浅利七海',10,9,'#009cbd'),
('cg','海伦','海伦',4,4,'#c58e31'),
('cg','松永凉','松永凉',10,1,'#211551'),
('cg','小室千奈美','小室千奈美',6,9,'#a9bbdf'),
('cg','高峰诺亚','高峰诺亚',3,25,'#9ed8f0'),
('cg','高垣枫','高垣枫',6,14,'#47d7ac'),
('cg','神崎兰子','神崎兰子',4,8,'#84329b'),
('cg','伊集院惠','伊集院惠',9,24,'#49256b'),
('cg','柊志乃','柊志乃',12,25,'#a41d60'),
('cg','北条加莲','北条加莲',9,5,'#2ad2c9'),
('cg','凯特','凯特',8,15,'#c2192c'),
('cg','濑名诗织','濑名诗织',1,10,'#50bdb8'),
('cg','绫濑穗乃香','绫濑穗乃香',5,29,'#e9d4e7'),
('cg','佐城雪美','佐城雪美',9,28,'#171c8f'),
('cg','篠原礼','篠原礼',11,22,'#8f6cae'),
('cg','和久井留美','和久井留美',4,7,'#2a3378'),
('cg','吉冈沙纪','吉冈沙纪',5,8,'#1c3b95'),
('cg','梅木音叶','梅木音叶',6,20,'#71b5a8'),
('cg','白坂小梅','白坂小梅',3,28,'#abcae9'),
('cg','岸部彩华','岸部彩华',11,13,'#d14f99'),
('cg','氏家睦','氏家睦',7,13,'#345536'),
('cg','西川保奈美','西川保奈美',10,23,'#4c55a4'),
('cg','成宫由爱','成宫由爱',11,3,'#2c5aa8'),
('cg','藤居朋','藤居朋',7,1,'#8957a0'),
('cg','盐见周子','盐见周子',12,12,'#dce6ed'),
('cg','胁山珠美','胁山珠美',9,20,'#407ec9'),
('cg','冈崎泰叶','冈崎泰叶',7,16,'#abdceb'),
('cg','速水奏','速水奏',7,1,'#003087'),
('cg','大石泉','大石泉',11,11,'#74d1ea'),
('cg','松尾千鹤','松尾千鹤',3,21,'#99d5ed'),
('cg','森久保乃乃','森久保乃乃',8,27,'#9cdbd9'),
('cg','安娜斯塔西娅','安娜斯塔西娅',9,19,'#B1C9E8'),
('cg','大和亚季','大和亚季',12,16,'#28724f'),
('cg','结城晴','结城晴',7,17,'#71dad4'),
('cg','二宫飞鸟','二宫飞鸟',2,3,'#5f259f'),
('cg','桐生司','桐生司',2,24,'#ab4ec6'),
('cg','望月圣','望月圣',12,25,'#b7dde1'),
('cg','鹰富士茄子','鹰富士茄子',1,1,'#5c068c'),
('cg','砂冢明','砂冢明',10,7,'#7e93a7'),
('cg','久川飒','久川飒',6,16,'#7eddd3'),
('cg','本田未央','本田未央',12,1,'#feb81d'),
('cg','高森蓝子','高森蓝子',7,25,'#cdea80'),
('cg','并木芽衣子','并木芽衣子',10,14,'#f7e39a'),
('cg','龙崎薰','龙崎薰',7,20,'#fae053'),
('cg','木村夏树','木村夏树',8,19,'#53565a'),
('cg','松山久美子','松山久美子',1,21,'#ee7832'),
('cg','齐藤洋子','齐藤洋子',12,29,'#c6df9b'),
('cg','泽田麻理菜','泽田麻理菜',5,6,'#f2a03a'),
('cg','矢口美羽','矢口美羽',7,10,'#df560e'),
('cg','赤城米莉亚','赤城米莉亚',4,14,'#ffcd00'),
('cg','爱野渚','爱野渚',8,1,'#f5c44d'),
('cg','真锅斋','真锅斋',12,29,'#FDA929'),
('cg','大槻唯','大槻唯',5,7,'#f6be00'),
('cg','姬川友纪','姬川友纪',9,14,'#ee8b00'),
('cg','喜多见柚','喜多见柚',12,2,'#f8f283'),
('cg','上田铃帆','上田铃帆',10,26,'#c58612'),
('cg','海老原菜帆','海老原菜帆',8,3,'#7d9331'),
('cg','及川雫','及川雫',6,3,'#ffffff'),
('cg','小关丽奈','小关丽奈',3,5,'#9b26b6'),
('cg','卫藤美纱希','卫藤美纱希',3,18,'#e683b2'),
('cg','星辉子','星辉子',6,6,'#a6093d'),
('cg','片桐早苗','片桐早苗',3,7,'#e24302'),
('cg','堀裕子','堀裕子',3,13,'#eca154'),
('cg','西岛櫂','西岛櫂',8,17,'#e45e2b'),
('cg','的场梨沙','的场梨沙',11,19,'#ff00a0'),
('cg','财前时子','财前时子',4,18,'#781937'),
('cg','依田芳乃','依田芳乃',7,3,'#c4bcb7'),
('cg','相叶夕美','相叶夕美',4,15,'#f0e991'),
('cg','野野村空','野野村空',1,3,'#ec6b32'),
('cg','滨川爱结奈','滨川爱结奈',5,25,'#992570'),
('cg','若林智香','若林智香',8,30,'#eeeb5e'),
('cg','城崎美嘉','城崎美嘉',11,12,'#fe9d1a'),
('cg','城崎莉嘉','城崎莉嘉',7,30,'#fedd00'),
('cg','仙崎惠磨','仙崎惠磨',6,27,'#c3147d'),
('cg','日野茜','日野茜',8,4,'#f9423a'),
('cg','诸星琪拉莉','诸星琪拉莉',9,1,'#ffd100'),
('cg','十时爱梨','十时爱梨',12,8,'#df4661'),
('cg','娜塔莉亚','娜塔莉亚',6,29,'#f4633a'),
('cg','相马夏美','相马夏美',7,23,'#f2bd3d'),
('cg','槙原志保','槙原志保',4,27,'#ee7b4c'),
('cg','向井拓海','向井拓海',8,7,'#b0008e'),
('cg','市原仁奈','市原仁奈',2,8,'#fbdf8d'),
('cg','喜多日菜子','喜多日菜子',4,6,'#fcd757'),
('cg','杉坂海','杉坂海',7,20,'#cb3a65'),
('cg','北川真寻','北川真寻',2,17,'#65b961'),
('cg','玛丽·柯克兰','玛丽·柯克兰',1,19,'#BD2D30'),
('cg','小松伊吹','小松伊吹',11,17,'#f2ed5d'),
('cg','三好纱南','三好纱南',6,25,'#6ebc59'),
('cg','凯茜·格拉汉姆','凯茜·格拉汉姆',9,19,'#f4d421'),
('cg','难波笑美','难波笑美',5,1,'#e03c31'),
('cg','滨口菖蒲','滨口菖蒲',1,13,'#440099'),
('cg','村上巴','村上巴',1,3,'#ab192c'),
('cg','土屋亚子','土屋亚子',5,2,'#f6b861'),
('cg','首藤葵','首藤葵',8,18,'#f1e283'),
('cg','冴岛清美','冴岛清美',9,26,'#ecb735'),
('cg','佐藤心','佐藤心',7,22,'#f04e98'),
('cg','南条光','南条光',9,13,'#e4002b'),
('cg','伊芙·珊德克罗丝','伊芙·珊德克罗丝',12,24,'#E5E1E6'),
('cg','梦见璃亚梦','梦见璃亚梦',9,12,'#E59BDC'),
('cg','久川凪','久川凪',6,16,'#f8a4bd'),
('ml','春日未来','春日未来',6,28,'#ea5b76'),
('ml','田中琴叶','田中琴叶',10,5,'#92cfbb'),
('ml','佐竹美奈子','佐竹美奈子',3,22,'#58a6dc'),
('ml','德川茉莉','德川茉莉',2,4,'#5abfb7'),
('ml','七尾百合子','七尾百合子',3,18,'#c7b83c'),
('ml','高山纱代子','高山纱代子',12,29,'#7f6575'),
('ml','松田亚利沙','松田亚利沙',6,7,'#b54461'),
('ml','高坂海美','高坂海美',8,10,'#e9739b'),
('ml','中谷育','中谷育',12,16,'#f7e78e'),
('ml','艾米莉·斯图亚特','艾米莉·斯图亚特',1,8,'#554171'),
('ml','矢吹可奈','矢吹可奈',8,18,'#f5ad3b'),
('ml','横山奈绪','横山奈绪',2,12,'#788bc5'),
('ml','福田法子','福田法子',3,30,'#eceb70'),
('ml','最上静香','最上静香',9,14,'#6495cf'),
('ml','所惠美','所惠美',4,15,'#454341'),
('ml','伴田路子','伴田路子',3,1,'#FFF03C'),
('ml','天空桥朋花','天空桥朋花',11,11,'#bee3e3'),
('ml','北泽志保','北泽志保',1,18,'#afa690'),
('ml','舞滨步','舞滨步',7,23,'#e25a9b'),
('ml','二阶堂千鹤','二阶堂千鹤',10,21,'#f19557'),
('ml','真壁瑞希','真壁瑞希',1,27,'#99b7dc'),
('ml','百濑莉绪','百濑莉绪',11,21,'#f19591'),
('ml','永吉昴','永吉昴',9,20,'#aeb49c'),
('ml','周防桃子','周防桃子',11,6,'#efb864'),
('ml','茱莉亚','茱莉亚',9,26,'#d7385f'),
('ml','白石紬','白石䌷',5,29,'#ebe1ff'),
('ml','伊吹翼','伊吹翼',7,30,'#fed552'),
('ml','岛原埃琳娜','岛原埃琳娜',10,26,'#9bce92'),
('ml','箱崎星梨花','箱崎星梨花',2,20,'#ed90ba'),
('ml','野野原茜','野野原茜',12,3,'#eb613f'),
('ml','望月杏奈','望月杏奈',5,31,'#7e6ca8'),
('ml','木下日向','木下日向',7,4,'#d1342c'),
('ml','马场木实','马场木实',6,12,'#f1becb'),
('ml','大神环','大神环',4,29,'#ee762e'),
('ml','丰川风花','丰川风花',9,2,'#7278a8'),
('ml','宫尾美也','宫尾美也',4,24,'#d7a96b'),
('ml','篠宫可怜','篠宫可怜',8,27,'#b63b40'),
('ml','北上丽花','北上丽花',5,17,'#6bb6b0'),
('ml','樱守歌织','樱守歌织',3,27,'#274079'),
('ml','青羽美咲','青羽美咲',6,29,'#96E2DF'),
('sidem','天濑冬马','天濑冬马',3,3,'#f32836'),
('sidem','御手洗翔太','御手洗翔太',4,20,'#8fd400'),
('sidem','伊集院北斗','伊集院北斗',2,14,'#1226aa'),
('sidem','天道辉','天道辉',2,23,'#e1261c'),
('sidem','樱庭薰','樱庭薰',9,24,'#004ebc'),
('sidem','柏木翼','柏木翼',6,2,'#2eb135'),
('sidem','都筑圭','都筑圭',4,2,'#c2afe6'),
('sidem','神乐丽','神乐丽',6,17,'#004898'),
('sidem','鹰城恭二','鹰城恭二',2,2,'#6dc6e7'),
('sidem','皮埃尔','皮埃尔',8,1,'#8add66'),
('sidem','渡边实','渡边实',3,22,'#ee869a'),
('sidem','苍井悠介','苍井悠介',7,7,'#ffe200'),
('sidem','苍井享介','苍井享介',7,7,'#53da3f'),
('sidem','握野英雄','握野英雄',3,7,'#73b8e2'),
('sidem','木村龙','木村龙',5,5,'#ea7125'),
('sidem','信玄诚司','信玄诚司',12,24,'#7b8d42'),
('sidem','猫柳桐生','猫柳桐生',11,12,'#FFD700'),
('sidem','华村翔真','华村翔真',8,24,'#6a488e'),
('sidem','清澄九郎','清澄九郎',7,3,'#71a4d9'),
('sidem','秋山隼人','秋山隼人',11,22,'#ff7000'),
('sidem','冬美旬','冬美旬',1,2,'#004ebc'),
('sidem','榊夏来','榊夏来',6,18,'#48d2dd'),
('sidem','若里春名','若里春名',3,30,'#70d551'),
('sidem','伊濑谷四季','伊濑谷四季',4,12,'#dd0ab2'),
('sidem','红井朱雀','红井朱雀',4,4,'#e23b30'),
('sidem','黑野玄武','黑野玄武',7,22,'#001ca8'),
('sidem','神谷幸广','神谷幸广',1,17,'#d88b83'),
('sidem','东云庄一郎','东云庄一郎',11,8,'#008e74'),
('sidem','アスラン=ベルゼビュートII世','阿斯兰·别西卜II世',10,9,'#5D6EB3'),
('sidem','卯月卷绪','卯月卷绪',12,12,'#eec362'),
('sidem','水嶋咲','水岛咲',8,19,'#F77EB4'),
('sidem','冈村直央','冈村直央',3,25,'#211e55'),
('sidem','橘志狼','橘志狼',4,22,'#e72510'),
('sidem','姬野花音','姬野花音',2,10,'#fab6c4'),
('sidem','硲道夫','硲道夫',1,13,'#426ca9'),
('sidem','舞田类','舞田类',8,8,'#f7d54e'),
('sidem','山下次郎','山下次郎',9,1,'#ee7800'),
('sidem','大河武','大河武',12,21,'#001CA8'),
('sidem','圆城寺道流','圆城寺道流',9,14,'#fda900'),
('sidem','牙崎涟','牙崎涟',5,14,'#ba2636'),
('sidem','兜大吾','兜大吾',5,20,'#dc291e'),
('sidem','九十九一希','九十九一希',10,13,'#d3a243'),
('sidem','葛之叶雨彦','葛之叶雨彦',10,31,'#4d4d4d'),
('sidem','北村想乐','北村想乐',11,28,'#3f7735'),
('sidem','古论克里斯','古论克里斯',10,11,'#00c4df'),
('sidem','天峰秀','天峰秀',12,1,'#0198f0'),
('sidem','花园百百人','花园百百人',6,30,'#b8f028'),
('sidem','眉见锐心','眉见锐心',5,23,'#e01828'),
('sidem','山村贤','山村贤',7,2,'#93C27F'),
('sc','樱木真乃','樱木真乃',4,25,'#ffbad6'),
('sc','风野灯织','风野灯织',3,4,'#144384'),
('sc','八宫巡','八宫巡',7,22,'#ffe012'),
('sc','月冈恋钟','月冈恋钟',2,25,'#f84cad'),
('sc','田中摩美美','田中摩美美',5,24,'#a846fb'),
('sc','白濑咲耶','白濑咲耶',6,27,'#006047'),
('sc','三峰结华','三峰结华',1,16,'#3b91c4'),
('sc','幽谷雾子','幽谷雾子',9,23,'#d9f2ff'),
('sc','小宫果穗','小宫果穗',7,29,'#e5461c'),
('sc','园田智代子','园田智代子',2,24,'#f93b90'),
('sc','西城树里','西城树里',11,26,'#ffc602'),
('sc','杜野凛世','杜野凛世',10,19,'#89c3eb'),
('sc','有栖川夏叶','有栖川夏叶',8,16,'#90e667'),
('sc','大崎甘奈','大崎甘奈',12,25,'#f54275'),
('sc','大崎甜花','大崎甜花',12,25,'#e75bec'),
('sc','桑山千雪','桑山千雪',4,18,'#fafafa'),
('sc','芹泽朝日','芹泽朝日',1,4,'#f30100'),
('sc','黛冬优子','黛冬优子',12,4,'#5aff19'),
('sc','和泉爱依','和泉爱依',8,2,'#ff00ff'),
('sc','浅仓透','浅仓透',5,4,'#50d0d0'),
('sc','樋口圆香','樋口圆香',10,27,'#be1e3e'),
('sc','福丸小糸','福丸小糸',11,11,'#7967c3'),
('sc','市川雏菜','市川雏菜',3,17,'#ffc639'),
('sc','七草日花','七草日花',7,26,'#a6cdb6'),
('sc','绯田美琴','绯田美琴',9,8,'#760f10'),
('sc','斑鸠路加','斑鸠路加',1,31,'#35281f'),
('sc','铃木羽那','铃木羽那',10,2,'#e0b5d3'),
('sc','郁田阳希','郁田阳希',4,5,'#ead7a4'),
('sc','七草叶月','七草叶月',2,3,'#8adfff'),
('gk','花海咲季','花海咲季',4,2,'#e30f25'),
('gk','月村手毬','月村手毬',6,3,'#0c7bbb'),
('gk','藤田琴音','藤田琴音',4,29,'#f8c112'),
('gk','葛城莉莉娅','葛城莉莉娅',7,24,'#eafdff'),
('gk','紫云清夏','紫云清夏',11,11,'#7cfc00'),
('gk','仓本千奈','仓本千奈',8,1,'#f68b1f'),
('gk','篠泽广','篠泽广',12,21,'#00afcc'),
('gk','花海佑芽','花海佑芽',4,1,'#ea533a'),
('gk','秦谷美铃','秦谷美铃',2,6,'#7a99cf'),
('gk','有村麻央','有村麻央',1,18,'#7f1184'),
('gk','姬崎莉波','姬崎莉波',3,5,'#f6adc6'),
('gk','十王星南','十王星南',12,7,'#f6ae54'),
('gk','雨夜燕','雨夜燕',5,20,'#7b68ee'),
('876','灯里爱夏','灯里爱夏',7,1,'#FF4554'),
('876','上水流宇宙','上水流宇宙',9,12,'#56CCF2'),
('876','蕾特拉','蕾特拉',11,11,'#D7F930'),
('gk','真城优','真城优',2,12,'#f0f8ff');

CREATE TEMP TABLE catalog_public_voice_seed (storage_slug text PRIMARY KEY) ON COMMIT DROP;
-- Voice source SHA-256: 33c17088a55e4eab7a69ab0ed60aa4e9a0b2e348ba4f6b15b979d9744d47c77c
INSERT INTO catalog_public_voice_seed VALUES
('shimamura_uzuki'),
('nakano_yuka'),
('mizumoto_yukari'),
('shiina_noriko'),
('mimura_kanako'),
('kohinata_miho'),
('ogata_chieri'),
('igarashi_kyoko'),
('sakurai_momoka'),
('seki_hiromi'),
('munakata_atsumi'),
('fujimoto_rina'),
('yusa_kozue'),
('ichinose_shiki'),
('maekawa_miku'),
('miyamoto_frederica'),
('kobayakawa_sae'),
('saionji_kotoka'),
('futaba_anzu'),
('domyoji_karin'),
('koshimizu_sachiko'),
('abe_nana'),
('koga_koharu'),
('sakuma_mayu'),
('shiragiku_hotaru'),
('hayasaka_mirei'),
('otokura_yuuki'),
('tsujino_akari'),
('kurosaki_chitose'),
('shirayuki_chiyo'),
('shibuya_rin'),
('kawashima_mizuki'),
('kamiya_nao'),
('kamijo_haruna'),
('araki_hina'),
('tada_riina'),
('sasaki_chie'),
('mifune_miyu'),
('fujiwara_hajime'),
('nitta_minami'),
('tachibana_arisu'),
('sagisawa_fumika'),
('yagami_makino'),
('layla'),
('asari_nanami'),
('matsunaga_ryo'),
('takagaki_kaede'),
('kanzaki_ranko'),
('hojo_karen'),
('sajo_yukimi'),
('shirasaka_koume'),
('shiomi_syuko'),
('wakiyama_tamami'),
('hayami_kanade'),
('ohishi_izumi'),
('morikubo_nono'),
('anastasia'),
('yamato_aki'),
('yuuki_haru'),
('ninomiya_asuka'),
('kiryu_tsukasa'),
('mochizuki_hijiri'),
('takafuji_kako'),
('sunazuka_akira'),
('hisakawa_hayate'),
('honda_mio'),
('takamori_aiko'),
('ryuzaki_kaoru'),
('kimura_natsuki'),
('akagi_miria'),
('ohtsuki_yui'),
('himekawa_yuki'),
('kitami_yuzu'),
('ueda_suzuho'),
('oikawa_shizuku'),
('koseki_reina'),
('hoshi_syoko'),
('katagiri_sanae'),
('hori_yuko'),
('matoba_risa'),
('yorita_yoshino'),
('aiba_yumi'),
('jougasaki_mika'),
('jougasaki_rika'),
('hino_akane'),
('moroboshi_kirari'),
('totoki_airi'),
('natalia'),
('mukai_takumi'),
('ichihara_nina'),
('kita_hinako'),
('namba_emi'),
('hamaguchi_ayame'),
('murakami_tomoe'),
('sato_shin'),
('yumemi_riamu'),
('nanjo_hikaru'),
('eve_santaclaus'),
('hisakawa_nagi');

CREATE TEMP TABLE catalog_public_fact_matches (entry_id bigint PRIMARY KEY, profile_id bigint NOT NULL) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.catalog_fact_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(lower(normalize(COALESCE(value,''),NFKC)),'\s+','','g') $$;
CREATE OR REPLACE FUNCTION pg_temp.catalog_fact_matches(key text, cn text, ja text, en text, aliases text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT EXISTS(SELECT 1 FROM unnest(ARRAY[cn,ja,en] || regexp_split_to_array(COALESCE(aliases,''),E'[\r\n,，、;；]+')) name
        WHERE name IS NOT NULL AND pg_temp.catalog_fact_normalize(name)=key)
$$;

DO $$
DECLARE
    fact record;
    project bigint;
    candidates bigint[];
    entry_ids bigint[];
    owner_id bigint;
    directory record;
    profile catalog_character_project_profiles;
    entry wiki_entries;
    created_profile boolean;
    pristine boolean;
BEGIN
    FOR fact IN SELECT *,pg_temp.catalog_fact_normalize(match_name) AS key FROM catalog_public_fact_seed LOOP
        SELECT id INTO project FROM projects WHERE code=fact.project_code;
        IF project IS NULL THEN CONTINUE; END IF;
        SELECT array_agg(DISTINCT c.id) INTO candidates
        FROM namecard_characters c WHERE c.deleted_at IS NULL AND NOT c.is_fallback
          AND (c.agency_id=project OR EXISTS(SELECT 1 FROM catalog_character_project_profiles p WHERE p.character_id=c.id AND p.project_id=project))
          AND (pg_temp.catalog_fact_matches(fact.key,c.name_cn,c.name_ja,c.name_en,c.aliases)
            OR EXISTS(SELECT 1 FROM catalog_character_project_profiles p WHERE p.character_id=c.id AND p.project_id=project
                AND pg_temp.catalog_fact_matches(fact.key,p.name_cn,p.name_ja,p.name_en,p.aliases)));
        -- ML explicitly shares the original 765 cast. No other project/world
        -- receives this identity rule (in particular DS, SideM and XENO).
        IF candidates IS NULL AND fact.project_code='ml' THEN
            SELECT array_agg(c.id) INTO candidates FROM namecard_characters c JOIN projects p ON p.id=c.agency_id
            WHERE p.code='765' AND c.deleted_at IS NULL AND NOT c.is_fallback
              AND pg_temp.catalog_fact_matches(fact.key,c.name_cn,c.name_ja,c.name_en,c.aliases);
        END IF;
        SELECT array_agg(id) INTO entry_ids FROM wiki_entries
        WHERE project_id=project AND deleted_at IS NULL
          AND pg_temp.catalog_fact_normalize(local_name_cn) IN (fact.key,pg_temp.catalog_fact_normalize(fact.source_name));
        owner_id:=NULL;
        IF cardinality(candidates)>1 THEN
            RAISE EXCEPTION 'Ambiguous public character fact in project %: %',fact.project_code,fact.source_name;
        ELSIF cardinality(candidates)=1 THEN owner_id:=candidates[1];
        ELSIF cardinality(entry_ids)=1 THEN
            SELECT * INTO entry FROM wiki_entries WHERE id=entry_ids[1] FOR UPDATE;
            IF entry.character_profile_id IS NOT NULL THEN
                SELECT c.id INTO owner_id FROM catalog_character_project_profiles p JOIN catalog_characters c ON c.id=p.character_id
                WHERE p.id=entry.character_profile_id AND c.deleted_at IS NULL AND NOT p.is_fallback;
            ELSIF entry.group_profile_id IS NULL AND entry.entry_kind='idol' THEN
                INSERT INTO namecard_characters(agency_id,name_cn,category) VALUES(project,fact.source_name,'idol') RETURNING id INTO owner_id;
            END IF;
        END IF;
        -- Empty installations and partial catalog fixtures have no matching
        -- identities. Do not invent directory rows from a name alone.
        IF owner_id IS NULL THEN CONTINUE; END IF;
        SELECT * INTO directory FROM namecard_characters WHERE id=owner_id;
        SELECT * INTO profile FROM catalog_character_project_profiles WHERE character_id=owner_id AND project_id=project FOR UPDATE;
        created_profile:=NOT FOUND;
        IF created_profile THEN
            INSERT INTO catalog_character_project_profiles(character_id,project_id,name_cn,name_ja,name_en,aliases,category)
            VALUES(owner_id,project,directory.name_cn,directory.name_ja,directory.name_en,directory.aliases,directory.category) RETURNING * INTO profile;
        END IF;
        pristine:=created_profile OR (profile.revision=0 AND profile.avatar_media_revision=0
            AND profile.representative_color IS NULL AND profile.avatar_object_key IS NULL);
        UPDATE catalog_character_project_profiles SET
            birth_month=CASE WHEN birth_month IS NULL THEN fact.birth_month ELSE birth_month END,
            birth_day=CASE WHEN birth_day IS NULL THEN fact.birth_day ELSE birth_day END,
            representative_color=COALESCE(representative_color,CASE WHEN pristine AND entry_ids IS NULL
                AND NOT EXISTS(SELECT 1 FROM wiki_entries WHERE character_profile_id=profile.id) THEN fact.color END),
            revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE id=profile.id AND (birth_month IS NULL OR pristine AND representative_color IS NULL AND fact.color IS NOT NULL AND entry_ids IS NULL
            AND NOT EXISTS(SELECT 1 FROM wiki_entries WHERE character_profile_id=profile.id));
        IF cardinality(entry_ids)=1 THEN
            INSERT INTO catalog_public_fact_matches VALUES(entry_ids[1],profile.id) ON CONFLICT DO NOTHING;
            SELECT * INTO entry FROM wiki_entries WHERE id=entry_ids[1] FOR UPDATE;
            IF entry.character_profile_id IS NULL AND entry.group_profile_id IS NULL
                AND NOT EXISTS(SELECT 1 FROM wiki_entries WHERE character_profile_id=profile.id AND deleted_at IS NULL)
                AND (created_profile OR profile.name_cn=entry.local_name_cn)
                AND (pristine OR (profile.representative_color,profile.avatar_object_key,profile.avatar_fit,profile.avatar_focal_x,
                    profile.avatar_focal_y,profile.avatar_zoom,profile.avatar_rotation,profile.avatar_media_revision)
                    IS NOT DISTINCT FROM (entry.local_accent_color,entry.local_image_object_key,entry.local_image_fit,entry.local_image_focal_x,
                    entry.local_image_focal_y,entry.local_image_zoom,entry.local_image_rotation,entry.local_image_media_revision)) THEN
                IF pristine THEN
                    UPDATE catalog_character_project_profiles SET name_cn=entry.local_name_cn,
                        aliases=CASE WHEN name_cn<>entry.local_name_cn THEN NULLIF(concat_ws(E'\n',NULLIF(aliases,''),name_cn),'') ELSE aliases END,
                        representative_color=entry.local_accent_color,avatar_object_key=entry.local_image_object_key,
                        avatar_fit=entry.local_image_fit,avatar_focal_x=entry.local_image_focal_x,avatar_focal_y=entry.local_image_focal_y,
                        avatar_zoom=entry.local_image_zoom,avatar_rotation=entry.local_image_rotation,avatar_media_revision=entry.local_image_media_revision,
                        revision=revision+1,updated_at=CURRENT_TIMESTAMP
                    WHERE id=profile.id AND (name_cn,representative_color,avatar_object_key,avatar_fit,avatar_focal_x,avatar_focal_y,avatar_zoom,avatar_rotation,avatar_media_revision)
                        IS DISTINCT FROM (entry.local_name_cn,entry.local_accent_color,entry.local_image_object_key,entry.local_image_fit,
                        entry.local_image_focal_x,entry.local_image_focal_y,entry.local_image_zoom,entry.local_image_rotation,entry.local_image_media_revision);
                END IF;
                UPDATE wiki_entries SET character_profile_id=profile.id,binding_revision=binding_revision+1 WHERE id=entry.id;
                UPDATE wiki_project_settings SET layout_revision=layout_revision+1 WHERE project_id=project;
            END IF;
        END IF;
    END LOOP;
    UPDATE catalog_character_project_profiles p SET voice_status='voiced',revision=revision+1,updated_at=CURRENT_TIMESTAMP
    WHERE p.voice_status='unknown' AND NOT p.is_fallback
      AND EXISTS(SELECT 1 FROM catalog_characters c WHERE c.id=p.character_id AND c.deleted_at IS NULL)
      AND p.id IN (
        SELECT COALESCE(e.character_profile_id,m.profile_id) FROM wiki_entries e JOIN projects project ON project.id=e.project_id
        JOIN catalog_public_voice_seed v ON v.storage_slug=e.storage_slug
        LEFT JOIN catalog_public_fact_matches m ON m.entry_id=e.id
        WHERE project.code='cg' AND e.deleted_at IS NULL AND e.group_profile_id IS NULL
    );
END $$;
