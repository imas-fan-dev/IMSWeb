-- Producer Map R2 control-plane seed generated from the verified 2026-07-26 import.
-- Data plane: imsweb-media-public-prod, empty IMS_S3_PREFIX.
-- Requires PostgreSQL migration 0009_s3_public_storage_scope and the 44 physical
-- R2 objects listed below. This script is idempotent only for identical rows and
-- aborts instead of overwriting any conflicting online state.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(hashtext('imsweb-producer-map-r2-control-plane'));

CREATE TEMP TABLE producer_map_r2_seed (
    logical_key TEXT PRIMARY KEY,
    object_id TEXT NOT NULL UNIQUE,
    operation_id TEXT NOT NULL UNIQUE,
    physical_key TEXT NOT NULL UNIQUE,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    content_type TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    etag TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO producer_map_r2_seed
    (logical_key, object_id, operation_id, physical_key, byte_size, content_type, sha256, etag)
VALUES
    ('community/producer-map/assets/community-chaoshan-wechat/image.jpg', '7744860c-4b6c-4a1a-9d77-7983ec7a0db4', '171e2851-ee9a-4a02-b08a-82f72e3e4ff4', 'community/producer-map/assets/community-chaoshan-wechat/objects/7744860c-4b6c-4a1a-9d77-7983ec7a0db4/image.jpg', 292756, 'image/jpeg', '796e33e7fb126d24e19062fa9a4129d19e613e92b5208bbe9eba5135e010792b', '"07a73acca6466037e4c769a29da18c0e"'),
    ('community/producer-map/assets/community-ichibanboshi-lounge/image.jpg', 'b327758a-02e3-4f46-a96e-1c7c68d7080e', '2bb47885-6d04-4e53-a0a2-51ef9239f79a', 'community/producer-map/assets/community-ichibanboshi-lounge/objects/b327758a-02e3-4f46-a96e-1c7c68d7080e/image.jpg', 158435, 'image/jpeg', 'b7439ad2657667fb2cd14f8c2f0ddff94760c653f695fdf0e32f5671d7645530', '"e02ef0deb6a82c422a366b028022f2a0"'),
    ('community/producer-map/assets/community-idol-sports-lounge/image.jpg', 'bf7e6026-f876-498d-8475-ca615bd773da', '7b1e55c0-1589-4be6-9c4a-9d3d5a4dbfad', 'community/producer-map/assets/community-idol-sports-lounge/objects/bf7e6026-f876-498d-8475-ca615bd773da/image.jpg', 109090, 'image/jpeg', '3c2ef94c33f173f0c68b1d56499b1d9e1078d5e3526d2bf4670af86c50782c97', '"3658cf226380d0843ecf201b0e2c0a51"'),
    ('community/producer-map/assets/community-producer-tarkov/image.png', 'd6814330-467f-48de-aa49-1f18c151c5b8', '5023f308-ab9d-4287-9a99-88282b57aa3c', 'community/producer-map/assets/community-producer-tarkov/objects/d6814330-467f-48de-aa49-1f18c151c5b8/image.png', 491385, 'image/png', '1c116e382ae0d01b9ef0ad3c52ef2278e088428bb127c5dde022f087851acc87', '"b7e1d50dfa17cb361f8d19a836853eed"'),
    ('community/producer-map/assets/community-shiny-colors-lounge/image.png', 'b983217d-9af8-4918-82f1-0f0c6dc8b23f', '09f5ffc6-0292-4a6e-b020-b32c6a07bcf4', 'community/producer-map/assets/community-shiny-colors-lounge/objects/b983217d-9af8-4918-82f1-0f0c6dc8b23f/image.png', 432017, 'image/png', '17f395ea71959905ed67190f559516405c7b407dba97d0fb9ac8476b20643434', '"14fa774671f3f5fd66d08cf685444af3"'),
    ('community/producer-map/assets/community-site-owner-lounge/image.png', 'c16ca5a4-96f3-4251-8e63-e35a8fb2c019', 'cee38573-ddce-47bb-ae4b-278c66e19e66', 'community/producer-map/assets/community-site-owner-lounge/objects/c16ca5a4-96f3-4251-8e63-e35a8fb2c019/image.png', 415389, 'image/png', '8113bb3199d497133cdf57375b5491ef706aeb253be0927558b8a21c87912f44', '"8daa9567e3984f3e890d2eb79a1dd656"'),
    ('community/producer-map/assets/community-u149-lounge/image.png', '3a482cab-9ca6-4d1d-9dc3-8a72bbb3ff38', '3a3c5334-0e8b-4b06-b81d-fb9b1c5a15e1', 'community/producer-map/assets/community-u149-lounge/objects/3a482cab-9ca6-4d1d-9dc3-8a72bbb3ff38/image.png', 122381, 'image/png', '24a9b065f1291b5b850fa3938e8f86c9072f46769f2f80406275c48f96bb4a07', '"d015a07f6d958ca53d634d179d4d857d"'),
    ('community/producer-map/assets/community-war-thunder-lounge/image.png', 'bc335d06-81f8-4985-87f2-55e53b0cde00', 'e556486b-9125-417f-9f94-56d04e120958', 'community/producer-map/assets/community-war-thunder-lounge/objects/bc335d06-81f8-4985-87f2-55e53b0cde00/image.png', 69973, 'image/png', '772b0abd06ba996f04d4571b19aec16d8eeda10b1a069d5e80583a186a1c17ed', '"234b437de2e55675d54e792f84874896"'),
    ('community/producer-map/assets/community-world-of-warships/image.png', 'd4eb7203-0d24-4734-acdf-d8f89eb9b475', 'bf7e319b-aca8-49fe-9fab-1b50a5396e81', 'community/producer-map/assets/community-world-of-warships/objects/d4eb7203-0d24-4734-acdf-d8f89eb9b475/image.png', 432971, 'image/png', 'd37998f8764bffb3766438dc5cb3d7e4333ed143487b5cf876471a137b1aa676', '"510b05a55f2b3f56c77a9cef6b37fbf3"'),
    ('community/producer-map/assets/region-anhui/image.png', '92cc8879-cd4c-40e1-b872-66ee36dd18f1', 'e621e413-6137-4848-9009-0ed33aab81c3', 'community/producer-map/assets/region-anhui/objects/92cc8879-cd4c-40e1-b872-66ee36dd18f1/image.png', 162318, 'image/png', 'e0a5b9aa1bd332ee56bab397dac029ec3040918dc5b2b9a085d9c617d51f0a30', '"86471b1d8a39549ca81f2b339463efa0"'),
    ('community/producer-map/assets/region-aomen/image.png', 'e932b4c9-6517-44cb-bcee-f366b0658148', '5bd84ba0-c9e3-452b-9d05-490aefddfc14', 'community/producer-map/assets/region-aomen/objects/e932b4c9-6517-44cb-bcee-f366b0658148/image.png', 122366, 'image/png', 'c7cb39b9ca9a285b8cbb15275f2439984c0898da0f4b50d78a90663749e6aac6', '"f3d41bc22a5fce3582357a6094749b9c"'),
    ('community/producer-map/assets/region-beijing/image.png', 'ab65e8e8-c48c-450c-94a0-32e76a1e7804', 'b6829dc9-9692-489e-be30-90a2e1fb05f6', 'community/producer-map/assets/region-beijing/objects/ab65e8e8-c48c-450c-94a0-32e76a1e7804/image.png', 105025, 'image/png', 'a9e16f6474bee60dccf09bcebc92dc8342c29fff7ef2437689e88c0447295022', '"72871d4ae911625ab40b4a18954ca439"'),
    ('community/producer-map/assets/region-chongqing/image.png', 'b1144236-fa11-4615-9a8d-4c4af92289fa', '07306e0c-07be-4af8-9bec-ff07558c987f', 'community/producer-map/assets/region-chongqing/objects/b1144236-fa11-4615-9a8d-4c4af92289fa/image.png', 146065, 'image/png', '0b7d06310b106f7eab339233b31d78457e8829ce0eff96dfc1b33efe73eed13e', '"97ef44199a5162a77b47089e54e82b84"'),
    ('community/producer-map/assets/region-dongbei/image.png', '34de1246-71ac-4e8d-b604-3ad3114ac2f6', '597de926-2e10-4fdf-bf27-574d70865c6f', 'community/producer-map/assets/region-dongbei/objects/34de1246-71ac-4e8d-b604-3ad3114ac2f6/image.png', 196670, 'image/png', '960688f730544e07eb9fffc15a691664beba3bec448f5d102b667eef2440afab', '"c3dac4b63e2673cf1b9505600053f525"'),
    ('community/producer-map/assets/region-fujian/image.png', '0da5180b-7672-42fd-b70d-4acfc3fade64', '19ae66b6-1226-489e-838c-f06e21c5605d', 'community/producer-map/assets/region-fujian/objects/0da5180b-7672-42fd-b70d-4acfc3fade64/image.png', 195701, 'image/png', 'bc87849be08b1a5d300c634858414f9e91840bd11a519b1958fd75142f82745d', '"ad19b1a00f0288fd3ad13aa59020ff4e"'),
    ('community/producer-map/assets/region-gansu/image.png', 'b35d0fa3-1acb-46ba-bbab-b968e7821d3a', 'ec777e23-1d57-4bb6-8fa6-0c12347a174f', 'community/producer-map/assets/region-gansu/objects/b35d0fa3-1acb-46ba-bbab-b968e7821d3a/image.png', 88167, 'image/png', 'ee325ea7855c51f457280ad35cefa2bba6f4fe8471504ecb7d85a49c84922f9c', '"df23bc66c721045147b5aba0043c89a1"'),
    ('community/producer-map/assets/region-guangdong/image.png', '09cc6a6d-9cbd-4e25-a346-3c07bfe7044f', '9bb077c4-fb8c-4a69-a695-678a7b51cfde', 'community/producer-map/assets/region-guangdong/objects/09cc6a6d-9cbd-4e25-a346-3c07bfe7044f/image.png', 286600, 'image/png', '7324f8a2bd22a2139442e60d58c4d5fb14300901d47addc07501e4dc205e0209', '"bdda9090d391cc93b05ce332a6435a7e"'),
    ('community/producer-map/assets/region-guangxi/image.png', '308b948b-c176-42b2-ae91-beadd2533ced', 'a1fdefda-3234-4aa1-923a-24fa656b952e', 'community/producer-map/assets/region-guangxi/objects/308b948b-c176-42b2-ae91-beadd2533ced/image.png', 182256, 'image/png', 'e7aa4cdf74d4f0d7848a61381ae5a85781c21cf2fb08b4bc792989a70635f095', '"51a52a9079422425b9a7fbfda349ecc5"'),
    ('community/producer-map/assets/region-guizhou/image.png', '35eedd59-cefc-4b67-a0d7-551835e7d8e0', 'f3f9b4e5-6b39-4ab7-9537-5664b328fded', 'community/producer-map/assets/region-guizhou/objects/35eedd59-cefc-4b67-a0d7-551835e7d8e0/image.png', 94533, 'image/png', '158088125e4902b02cb01b99364fd9ec8b9f55698dcacbd0eec023f1934239fb', '"d014cf9fa9cfe2c5355e1a4aebf87dd0"'),
    ('community/producer-map/assets/region-hainan/image.png', '6c6b2847-666d-4683-ab97-4ee125bb4c84', '32b6fa7a-150a-4a2b-9dd2-c0272fb5d6fc', 'community/producer-map/assets/region-hainan/objects/6c6b2847-666d-4683-ab97-4ee125bb4c84/image.png', 159082, 'image/png', '84d8cfcf5fef5dadfef4ac9abead2595868638096341f569c0984edfc52baed8', '"8eab9265caf7e71e5fde7709ea835926"'),
    ('community/producer-map/assets/region-hebei/image.png', 'bffcc897-d63d-47a2-97e3-bc165698530b', 'c7226cc1-b91f-417d-ad2e-4726b4371264', 'community/producer-map/assets/region-hebei/objects/bffcc897-d63d-47a2-97e3-bc165698530b/image.png', 113659, 'image/png', '280b8b154f323339c44fab372c95710bc8ba344758e8fcb83877211ba1e48bc4', '"47cfcb0a42cf713ec170fdffc3da50ea"'),
    ('community/producer-map/assets/region-heilongjiang/image.png', '21487170-3e2b-42f3-bb45-a1df02aaece3', '80c8e974-4c00-4ba8-be8e-bc75332c8a26', 'community/producer-map/assets/region-heilongjiang/objects/21487170-3e2b-42f3-bb45-a1df02aaece3/image.png', 206587, 'image/png', 'fe78c56c3468a5266fd281be29dd5a13db4d4e1449cb73b1d87f9f461b01c841', '"5f691b7ddc9f9254ebff743284b81fda"'),
    ('community/producer-map/assets/region-henan/image.png', '3a484a53-a234-45ff-95a6-892f61a49f33', '2f80edba-5041-46c8-8a2a-7e06e3c5e537', 'community/producer-map/assets/region-henan/objects/3a484a53-a234-45ff-95a6-892f61a49f33/image.png', 197499, 'image/png', '864f423ac291fc4f4db763094149610eea805979b6c89816f323e15c0dd40aca', '"5f49c66229ac5da4c2e2d8becb124981"'),
    ('community/producer-map/assets/region-hubei/image.png', '24801c10-6ce1-4750-be30-a24107b668c4', '295ab669-9f60-4d94-a3d2-961ea69fcdb0', 'community/producer-map/assets/region-hubei/objects/24801c10-6ce1-4750-be30-a24107b668c4/image.png', 164710, 'image/png', '1cbb60f50f113ef5a44239bb69985ca2acb1a372cb690e678f6470b95e0ad178', '"a18486432157ac0d17dca276758c3f02"'),
    ('community/producer-map/assets/region-hunan/image.png', '19be9021-5ce3-44fc-b9f5-d78f8cc79e38', '8d0ec344-20b7-4c29-a32b-f5a67eb73b92', 'community/producer-map/assets/region-hunan/objects/19be9021-5ce3-44fc-b9f5-d78f8cc79e38/image.png', 135838, 'image/png', '56740639b16391ffe06d2093afa5ac4af63badf74368ae7c1dda23219a0d52e0', '"0c9d70e51a2f6c5baed95baf86344cac"'),
    ('community/producer-map/assets/region-jiangsu/image.png', '31e55279-e0da-4943-a7ba-414e9a8b42b7', 'c6d8d414-1495-450a-970e-9bc04cc28ab5', 'community/producer-map/assets/region-jiangsu/objects/31e55279-e0da-4943-a7ba-414e9a8b42b7/image.png', 198124, 'image/png', '94d532e617c6a6578d33a3379ace7940e77381983638dc206de01cee524d216b', '"8596eb05118c1ca8476a5d64b11a164f"'),
    ('community/producer-map/assets/region-jiangxi/image.png', '636b1e56-9adc-4966-a9cb-6bb41c8ff30d', 'f3c54ae9-85a3-46df-a06a-02640c16de80', 'community/producer-map/assets/region-jiangxi/objects/636b1e56-9adc-4966-a9cb-6bb41c8ff30d/image.png', 155755, 'image/png', 'e60d26a4aaed4e9d901977b3362e3760553e92cbc0c8af8b3d215812dd75f003', '"bde69c6551ac5571415548c374e43219"'),
    ('community/producer-map/assets/region-jilin/image.png', '3a8f4d3e-462a-43b3-ba5f-626a0a32af5e', 'e1501d17-bb9f-46d5-9b01-b5ad42a81ba2', 'community/producer-map/assets/region-jilin/objects/3a8f4d3e-462a-43b3-ba5f-626a0a32af5e/image.png', 87593, 'image/png', '519b5b2cda9b66fde821d62c72036fe4474daa8932b9b68281a7a4513733dd0b', '"233f41747ee04cd494eeb80136139aed"'),
    ('community/producer-map/assets/region-neimenggu/image.png', '9a52590b-2c6e-43fa-93d0-e0f278d9b2f2', '0a1f27ce-0a75-4f89-8942-765b19326aac', 'community/producer-map/assets/region-neimenggu/objects/9a52590b-2c6e-43fa-93d0-e0f278d9b2f2/image.png', 42521, 'image/png', 'daeb194ec5cf3ec070f0c2c906aa63126b8cc01f90e4be0cdd4585b70779929e', '"528603ca3039b1149a54e0433b30ca06"'),
    ('community/producer-map/assets/region-ningxia/image.png', '4888c966-3d72-4ef8-9060-0937355076c7', '03c74ac6-ce2f-4b63-96bf-b06142a8eb54', 'community/producer-map/assets/region-ningxia/objects/4888c966-3d72-4ef8-9060-0937355076c7/image.png', 342237, 'image/png', 'f96358172522ac4945c31234b0ce88b440edd551821a102215600595afc0cb62', '"b3f325b54a7fea1eec2ec0fcda3b6fa5"'),
    ('community/producer-map/assets/region-qinghai/image.png', 'a288a1cf-c1ca-4d83-806f-3e664d11c80f', 'e8ad0208-55dc-49ff-9df3-56bd38f9a473', 'community/producer-map/assets/region-qinghai/objects/a288a1cf-c1ca-4d83-806f-3e664d11c80f/image.png', 34341, 'image/png', 'd92ea643e5ea4e5ee59827ee8eb20a56d1ddbe64610fbb68e28eef4f18dbac09', '"33a504de30c88acdce0963a4d6c54e59"'),
    ('community/producer-map/assets/region-shandong/image.png', '768253de-e790-4801-8cb9-6456ed044767', '17653597-ee26-4b66-8d0c-fb0ce7276629', 'community/producer-map/assets/region-shandong/objects/768253de-e790-4801-8cb9-6456ed044767/image.png', 192895, 'image/png', 'dba368affeb6cf2023508cd5c34d6da0331840a0b314cb1673080aad2c98327d', '"58cb392bb715f6bdbdaa675d3aecb499"'),
    ('community/producer-map/assets/region-shanghai/image.png', '7406176a-a2d6-494d-b457-d87447406665', 'f23947df-3757-4adc-ba3b-ff0853b5ee00', 'community/producer-map/assets/region-shanghai/objects/7406176a-a2d6-494d-b457-d87447406665/image.png', 117872, 'image/png', '141e783881ba784491499773ea9c00a02abae722462d13de4779599ada03499c', '"49899ed3eb261974e533759132d703ff"'),
    ('community/producer-map/assets/region-shanxi1/image.png', 'fee776db-b28f-4b93-914e-18aa680b6462', '8f54b302-ec14-4e0a-ac84-37db5e58469a', 'community/producer-map/assets/region-shanxi1/objects/fee776db-b28f-4b93-914e-18aa680b6462/image.png', 166358, 'image/png', '16d2ae71fce768e55d61e7ea1dd4a4616abc15a94057719669b033cfefe53a02', '"27cc0ace2d907670de9ff389268509bd"'),
    ('community/producer-map/assets/region-shanxi3/image.png', '0b2894e9-154a-47c9-87e3-f9b9adbb4b7c', '2e631b35-f6b0-49a2-a856-b24faae6b4b5', 'community/producer-map/assets/region-shanxi3/objects/0b2894e9-154a-47c9-87e3-f9b9adbb4b7c/image.png', 169657, 'image/png', '683d0d28091f36dcc0ac2bf66edad5ad6901ee53ef5f8d477f3d4aadf1800846', '"9972ce0bd38c49633c0d301bfb116d60"'),
    ('community/producer-map/assets/region-sichuan/image.png', '9d2dd338-0fd8-4d8e-b66d-2bdcdf737a68', '64ac729b-ecfe-44ba-9294-1086b1704908', 'community/producer-map/assets/region-sichuan/objects/9d2dd338-0fd8-4d8e-b66d-2bdcdf737a68/image.png', 136991, 'image/png', 'a271006ce4924655039f6dba9ac0b8cef64dc1e9e67914298bb6c2292eba3410', '"41874ff494025ee0ffeb76327f037677"'),
    ('community/producer-map/assets/region-taiwan/image.png', 'a7ac602a-9e55-4f4c-9edf-a59b5a1ee273', 'de0f5974-738e-4ea8-a5e0-3a455c3bb890', 'community/producer-map/assets/region-taiwan/objects/a7ac602a-9e55-4f4c-9edf-a59b5a1ee273/image.png', 27976, 'image/png', '9466acc451bb35169697b9ca7b50cf07c7416dc7fc8deaa49e9c0212b53d18c3', '"9394904227c549043a146cbbf5dec947"'),
    ('community/producer-map/assets/region-tianjin/image.png', 'a2f776e6-9ddf-4b69-988e-a0b107d74528', '55040ca1-8c38-4193-88a4-ed9d8c300ab9', 'community/producer-map/assets/region-tianjin/objects/a2f776e6-9ddf-4b69-988e-a0b107d74528/image.png', 86835, 'image/png', '454934be6fe8da0e80098d50c263db87eba6957138b48c8f0533d7b2e17eddf7', '"62dda6b4416445cd2a407f28abd49b61"'),
    ('community/producer-map/assets/region-xianggang/image.png', '83be0765-2626-46bd-8dab-c07e0573d6fc', 'f55b6d53-45de-4775-971e-d6e7e7ff70ac', 'community/producer-map/assets/region-xianggang/objects/83be0765-2626-46bd-8dab-c07e0573d6fc/image.png', 37525, 'image/png', '4dda85cbf90bf5bdf3454c033470b4ab4a14f45aa5452ae684ed967553f2b386', '"9e3d9f160f90e680f151db2e9674845a"'),
    ('community/producer-map/assets/region-xinjiang/image.png', '4a646594-1edf-4f41-aab4-e77cbfda3fc8', 'aa2d7551-4a40-4bcc-bc41-79d624f956b6', 'community/producer-map/assets/region-xinjiang/objects/4a646594-1edf-4f41-aab4-e77cbfda3fc8/image.png', 169673, 'image/png', '386a7cd66f82a9eda9aff4bb7560f37b2b9bd3a22e4fbb695381655f191430b5', '"e6f6e93257869f1214d5ea9370fb1d40"'),
    ('community/producer-map/assets/region-xizang/image.png', '42bff8dd-c1a1-4ef5-ae68-6e7067241976', '69d09905-2a3f-4dba-b1d7-6f4db8e2986a', 'community/producer-map/assets/region-xizang/objects/42bff8dd-c1a1-4ef5-ae68-6e7067241976/image.png', 27810, 'image/png', 'f26cce976475e84f7af2d5004bb1b15480c92a442706584ca2e1720564df2240', '"58cd661d031c6d92e06fe8800751828d"'),
    ('community/producer-map/assets/region-yunnan/image.png', 'e6676941-2ed0-4d06-8426-767629142fef', '06def42b-f9f3-42c2-9d0b-7865060af723', 'community/producer-map/assets/region-yunnan/objects/e6676941-2ed0-4d06-8426-767629142fef/image.png', 161187, 'image/png', '9d5ee43d5bd176749fc2d571cc06c640a5477d9e4443b3bb33717c3c9f0a7af0', '"bf2d23c4a0846d1050d8c503128cd7f4"'),
    ('community/producer-map/assets/region-zhejiang/image.png', 'b34005ab-2ac9-40cb-8a23-48e8eb1d30de', '0e3dc5c3-6f34-42ff-87c5-e1ffaa5005f9', 'community/producer-map/assets/region-zhejiang/objects/b34005ab-2ac9-40cb-8a23-48e8eb1d30de/image.png', 279428, 'image/png', 'e5c668894a79e42bf1cceb919a64d95398a8e709421a538f74448f0575ae31a2', '"fad43fce6c62e96b03d27ef7ed0cd677"'),
    ('community/producer-map/config.json', '28b4b197-3bb9-4abd-b3eb-c1c6a22bd8f6', '6fa217f3-8d0c-413c-aae0-168ce29fcc68', 'community/producer-map/objects/28b4b197-3bb9-4abd-b3eb-c1c6a22bd8f6/config.json', 12994, 'application/json; charset=utf-8', '73dfa5f443c4dc1f60412cc005c96d0b32059cd8b26b5f87e21937f3daf0a3e9', '"a8fa3cb3b815cf2aa2306b90ba259280"');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.ims_schema_migrations
        WHERE version = '0009_s3_public_storage_scope'
    ) THEN
        RAISE EXCEPTION 'Producer Map migration requires 0009_s3_public_storage_scope';
    END IF;

    IF (SELECT COUNT(*) FROM producer_map_r2_seed) <> 44 OR
        (SELECT COALESCE(SUM(byte_size), 0) FROM producer_map_r2_seed) <> 7529245 THEN
        RAISE EXCEPTION 'Producer Map seed inventory must contain 44 objects and 7529245 bytes';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM producer_map_r2_seed seed
        JOIN public.s3_object_index current USING (logical_key)
        WHERE current.object_id IS DISTINCT FROM seed.object_id
           OR current.state IS DISTINCT FROM 'ready'
           OR current.incarnation IS DISTINCT FROM 1
           OR current.operation_id IS DISTINCT FROM seed.operation_id
    ) THEN
        RAISE EXCEPTION 'Producer Map logical key conflicts with existing online state';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM producer_map_r2_seed seed
        JOIN public.s3_object_versions current ON current.object_id = seed.object_id
        WHERE current.physical_key IS DISTINCT FROM seed.physical_key
           OR current.storage_scope IS DISTINCT FROM 'public'
           OR current.byte_size IS DISTINCT FROM seed.byte_size
           OR current.content_type IS DISTINCT FROM seed.content_type
           OR current.sha256 IS DISTINCT FROM seed.sha256
           OR current.etag IS DISTINCT FROM seed.etag
           OR current.owner_token IS NOT NULL
    ) OR EXISTS (
        SELECT 1
        FROM producer_map_r2_seed seed
        JOIN public.s3_object_versions current
          ON current.storage_scope = 'public' AND current.physical_key = seed.physical_key
        WHERE current.object_id IS DISTINCT FROM seed.object_id
    ) THEN
        RAISE EXCEPTION 'Producer Map object version conflicts with existing online state';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM producer_map_r2_seed seed
        JOIN public.s3_upload_operations current ON current.id = seed.operation_id
        WHERE current.state IS DISTINCT FROM 'ready'
           OR current.logical_key IS DISTINCT FROM seed.logical_key
           OR current.object_id IS DISTINCT FROM seed.object_id
           OR current.target_state IS DISTINCT FROM 'ready'
           OR current.previous_object_id IS NOT NULL
           OR current.previous_state IS NOT NULL
           OR current.previous_operation_id IS NOT NULL
           OR current.previous_incarnation IS NOT NULL
           OR current.physical_key IS DISTINCT FROM seed.physical_key
           OR current.storage_scope IS DISTINCT FROM 'public'
    ) OR EXISTS (
        SELECT 1
        FROM producer_map_r2_seed seed
        JOIN public.s3_upload_operations current
          ON current.storage_scope = 'public' AND current.physical_key = seed.physical_key
        WHERE current.id IS DISTINCT FROM seed.operation_id
    ) THEN
        RAISE EXCEPTION 'Producer Map upload operation conflicts with existing online state';
    END IF;
END $$;

INSERT INTO public.s3_object_versions
    (object_id, physical_key, storage_scope, byte_size, content_type, sha256,
     etag, owner_token, created_at)
SELECT object_id, physical_key, 'public', byte_size, content_type, sha256,
       etag, NULL, 1785076029046
FROM producer_map_r2_seed
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO public.s3_upload_operations
    (id, state, logical_key, object_id, target_state, previous_object_id,
     previous_state, previous_operation_id, previous_incarnation, physical_key,
     storage_scope, created_at, updated_at)
SELECT operation_id, 'ready', logical_key, object_id, 'ready', NULL,
       NULL, NULL, NULL, physical_key, 'public', 1785076029046, 1785076029046
FROM producer_map_r2_seed
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.s3_object_index
    (logical_key, object_id, state, incarnation, operation_id, updated_at)
SELECT logical_key, object_id, 'ready', 1, operation_id, 1785076029046
FROM producer_map_r2_seed
ON CONFLICT (logical_key) DO NOTHING;

DO $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM producer_map_r2_seed seed
        JOIN public.s3_object_index index_row
          ON index_row.logical_key = seed.logical_key
         AND index_row.object_id = seed.object_id
         AND index_row.state = 'ready'
         AND index_row.incarnation = 1
         AND index_row.operation_id = seed.operation_id
        JOIN public.s3_object_versions version_row
          ON version_row.object_id = seed.object_id
         AND version_row.physical_key = seed.physical_key
         AND version_row.storage_scope = 'public'
         AND version_row.byte_size = seed.byte_size
         AND version_row.content_type = seed.content_type
         AND version_row.sha256 = seed.sha256
         AND version_row.etag = seed.etag
        JOIN public.s3_upload_operations operation_row
          ON operation_row.id = seed.operation_id
         AND operation_row.state = 'ready'
         AND operation_row.logical_key = seed.logical_key
         AND operation_row.object_id = seed.object_id
         AND operation_row.physical_key = seed.physical_key
         AND operation_row.storage_scope = 'public'
    ) <> 44 THEN
        RAISE EXCEPTION 'Producer Map control-plane verification failed';
    END IF;
END $$;

SELECT
    COUNT(*) AS producer_map_objects,
    SUM(byte_size) AS producer_map_bytes,
    COUNT(*) FILTER (WHERE content_type = 'application/json; charset=utf-8') AS config_objects,
    COUNT(*) FILTER (WHERE content_type LIKE 'image/%') AS media_objects
FROM producer_map_r2_seed;

COMMIT;
