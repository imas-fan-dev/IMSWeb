-- ims:migration-phase: post-data

ALTER TABLE public.agencies
    ADD COLUMN wiki_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    ADD COLUMN banner_title TEXT NOT NULL DEFAULT '',
    ADD COLUMN icon_object_key TEXT,
    ADD COLUMN fallback_artwork_object_key TEXT,
    ADD COLUMN layout_revision BIGINT NOT NULL DEFAULT 0 CHECK (layout_revision >= 0);

ALTER TABLE public.idols
    ADD COLUMN wiki_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    ADD COLUMN text_color TEXT NOT NULL DEFAULT '#ffffff',
    ADD COLUMN avatar_object_key TEXT,
    ADD COLUMN avatar_fit TEXT NOT NULL DEFAULT 'cover'
        CHECK (avatar_fit IN ('cover', 'contain')),
    ADD CONSTRAINT idols_id_agency_id_key UNIQUE (id, agency_id);

UPDATE public.agencies
SET display_order = id::integer, banner_title = name_cn;

WITH seed(code, display_order, banner_title, icon_object_key, fallback_artwork_object_key) AS (VALUES
        ('765', '0', '765PRO ALLSTARS', 'wiki/shared/static/icon/765pro.webp', 'wiki/shared/static/assets/images/Production/765intro.png'),
        ('876', '1', '876PRO', 'wiki/shared/static/icon/876pro.webp', 'wiki/shared/static/icon/876pro.webp'),
        ('cg', '2', 'CINDERELLA GIRLS', 'wiki/shared/static/icon/cg.webp', 'wiki/shared/static/assets/images/Production/Cinderellaintro.png'),
        ('ml', '3', '百万现场 剧场时光', 'wiki/shared/static/icon/ml.webp', 'wiki/shared/static/assets/images/Production/Millionintro.png'),
        ('sidem', '4', '315 Production', 'wiki/shared/static/icon/sidem.webp', 'wiki/shared/static/assets/images/Production/Sidemintro.png'),
        ('sc', '5', '283 Production', 'wiki/shared/static/icon/sc.webp', 'wiki/shared/static/assets/images/Production/Shinyintro.png'),
        ('gk', '6', '初星学园', 'wiki/shared/static/icon/gk.webp', 'wiki/shared/static/assets/images/Production/Gakuenintro.png')
)
UPDATE public.agencies a
SET display_order = seed.display_order::integer,
    banner_title = seed.banner_title,
    icon_object_key = seed.icon_object_key,
    fallback_artwork_object_key = seed.fallback_artwork_object_key
FROM seed
WHERE a.code = seed.code;

WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY agency_id ORDER BY id) - 1 AS display_order
    FROM public.idols
)
UPDATE public.idols i
SET display_order = ranked.display_order
FROM ranked
WHERE i.id = ranked.id;

UPDATE public.idols SET text_color = '#333333' WHERE name_cn IN ('萩原雪歩', '萩原雪步', '葛城リーリヤ', '葛城莉莉娅', '幽谷霧子', '幽谷雾子', '桑山千雪', '奥空心白', '诗花', 'Altessimo', '中谷育', 'W', '蕾特拉', '神速一魂', '及川雫');

WITH seed(code, folder_name, object_key) AS (VALUES
        ('765', 'amami_haruka', 'wiki/shared/static/assets/images/Production/765Haruka.png'),
        ('765', 'hoshii_miki', 'wiki/shared/static/assets/images/Information/mikipose.jpg'),
        ('cg', 'shimamura_uzuki', 'wiki/shared/static/assets/images/Production/346Uzuki.png'),
        ('gk', 'hanami_saki', 'wiki/shared/static/assets/images/Production/GakuenSaki.png'),
        ('gk', 'neo_asari', 'wiki/shared/static/assets/images/Production/GakuenAsari.png'),
        ('ml', 'amami_haruka', 'wiki/shared/static/assets/images/Production/765Haruka.png'),
        ('ml', 'hoshii_miki', 'wiki/shared/static/assets/images/Information/mikipose.jpg'),
        ('ml', 'kasuga_mirai', 'wiki/shared/static/assets/images/Production/765Mirai.png'),
        ('ml', 'sakuramori_kaori', 'wiki/shared/static/assets/images/Kaori.png'),
        ('sc', 'sakuragi_mano', 'wiki/shared/static/assets/images/Production/283Mano.png'),
        ('sidem', 'tendo_teru', 'wiki/shared/static/assets/images/Production/315Teru.png')
)
UPDATE public.idols i
SET avatar_object_key = seed.object_key, avatar_fit = 'cover'
FROM public.agencies a, seed
WHERE a.id = i.agency_id AND a.code = seed.code AND i.folder_name = seed.folder_name;

WITH seed(code, idol_name, object_key) AS (VALUES
        ('765', '天海春香', 'wiki/shared/static/assets/images/Production/765Haruka.png'),
        ('765', '星井美希', 'wiki/shared/static/assets/images/Information/mikipose.jpg'),
        ('cg', '岛村卯月', 'wiki/shared/static/assets/images/Production/346Uzuki.png'),
        ('gk', '根绪亚纱里', 'wiki/shared/static/assets/images/Production/GakuenAsari.png'),
        ('gk', '花海咲季', 'wiki/shared/static/assets/images/Production/GakuenSaki.png'),
        ('ml', '天海春香', 'wiki/shared/static/assets/images/Production/765Haruka.png'),
        ('ml', '星井美希', 'wiki/shared/static/assets/images/Information/mikipose.jpg'),
        ('ml', '春日未来', 'wiki/shared/static/assets/images/Production/765Mirai.png'),
        ('ml', '樱守歌织', 'wiki/shared/static/assets/images/Kaori.png'),
        ('sc', '樱木真乃', 'wiki/shared/static/assets/images/Production/283Mano.png'),
        ('sidem', '天道辉', 'wiki/shared/static/assets/images/Production/315Teru.png')
)
UPDATE public.idols i
SET avatar_object_key = COALESCE(i.avatar_object_key, seed.object_key), avatar_fit = 'cover'
FROM public.agencies a, seed
WHERE a.id = i.agency_id AND a.code = seed.code AND i.name_cn = seed.idol_name;

CREATE TABLE public.wiki_groups (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    agency_id BIGINT NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    icon_object_key TEXT,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (agency_id, code),
    UNIQUE (agency_id, display_order),
    UNIQUE (id, agency_id)
);

CREATE UNIQUE INDEX wiki_groups_one_fallback_per_agency_idx
    ON public.wiki_groups(agency_id) WHERE is_fallback;
CREATE INDEX wiki_groups_agency_order_idx
    ON public.wiki_groups(agency_id, display_order);

CREATE TABLE public.wiki_group_members (
    agency_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    idol_id BIGINT NOT NULL UNIQUE,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    PRIMARY KEY (group_id, idol_id),
    UNIQUE (group_id, display_order),
    FOREIGN KEY (group_id, agency_id)
        REFERENCES public.wiki_groups(id, agency_id) ON DELETE CASCADE,
    FOREIGN KEY (idol_id, agency_id)
        REFERENCES public.idols(id, agency_id) ON DELETE CASCADE
);

CREATE INDEX wiki_group_members_agency_idx ON public.wiki_group_members(agency_id);
CREATE INDEX wiki_group_members_group_order_idx
    ON public.wiki_group_members(group_id, display_order);

CREATE TABLE public.wiki_categories (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    agency_id BIGINT NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_slug TEXT NOT NULL CHECK (storage_slug ~ '^[a-z0-9][a-z0-9_-]*$'),
    background_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (agency_id, name),
    UNIQUE (agency_id, storage_slug),
    UNIQUE (id, agency_id)
);

CREATE INDEX wiki_categories_agency_idx ON public.wiki_categories(agency_id);
CREATE INDEX wiki_categories_background_idx
    ON public.wiki_categories(agency_id, id) WHERE background_eligible;

CREATE TABLE public.wiki_idol_categories (
    agency_id BIGINT NOT NULL,
    idol_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    show_when_empty BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (idol_id, category_id),
    UNIQUE (idol_id, display_order),
    FOREIGN KEY (idol_id, agency_id)
        REFERENCES public.idols(id, agency_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id, agency_id)
        REFERENCES public.wiki_categories(id, agency_id) ON DELETE CASCADE
);

CREATE INDEX wiki_idol_categories_agency_idx ON public.wiki_idol_categories(agency_id);
CREATE INDEX wiki_idol_categories_category_idx ON public.wiki_idol_categories(category_id);
CREATE INDEX wiki_idol_categories_idol_order_idx
    ON public.wiki_idol_categories(idol_id, display_order);

WITH seed(agency_code, code, name, color, icon_object_key, display_order) AS (VALUES
        ('765', '765pro', '765PRO', '#f34f6d', 'wiki/shared/static/icon/765/765pro.webp', '0'),
        ('765', '961pro', '961PRO', '#333333', 'wiki/shared/static/icon/765/961pro.webp', '1'),
        ('876', 'dearly-stars', '深情之星', '#ff79a1', 'wiki/shared/static/icon/876/876.webp', '0'),
        ('876', 'valiv', 'vα-liv', '#7b68ee', 'wiki/shared/static/icon/876/valiv.webp', '1'),
        ('cg', 'cg-special', '特殊', '#2681c8', 'wiki/shared/static/icon/cg/special.webp', '0'),
        ('cg', 'cute', 'Cute', '#ff5085', 'wiki/shared/static/icon/cg/cute.webp', '1'),
        ('cg', 'cool', 'Cool', '#0062ff', 'wiki/shared/static/icon/cg/cool.webp', '2'),
        ('cg', 'passion', 'Passion', '#ff9d00', 'wiki/shared/static/icon/cg/passion.webp', '3'),
        ('ml', 'ml-special', '特殊', '#3f51b5', 'wiki/shared/static/icon/ml/special.webp', '0'),
        ('ml', 'ml-allstars', '765PRO ALLSTARS', '#f34f6d', 'wiki/shared/static/icon/ml/765pro.webp', '1'),
        ('ml', 'princess-stars', 'PRINCESS STARS', '#ea5b76', 'wiki/shared/static/icon/ml/princess.webp', '2'),
        ('ml', 'fairy-stars', 'FAIRY STARS', '#0074b3', 'wiki/shared/static/icon/ml/fairy.webp', '3'),
        ('ml', 'angel-stars', 'ANGEL STARS', '#fec352', 'wiki/shared/static/icon/ml/angel.webp', '4'),
        ('sidem', 'sidem-special', '特殊', '#0fbe94', 'wiki/shared/static/icon/sidem/special.webp', '0'),
        ('sidem', 'sidem-units', '组合', '#0fbe94', 'wiki/shared/static/icon/sidem/unit.webp', '1'),
        ('sc', 'sc-special', '特殊', '#8dbbff', 'wiki/shared/static/icon/sc/special.webp', '0'),
        ('sc', 'illumination-stars', 'illumination STARS', '#ffca00', 'wiki/shared/static/icon/sc/illumination_stars.webp', '1'),
        ('sc', 'lantica', 'L''Antica', '#853998', 'wiki/shared/static/icon/sc/l_antica.webp', '2'),
        ('sc', 'houkago-climax-girls', '放学后Climax Girls', '#fa8333', 'wiki/shared/static/icon/sc/houkago_climax_girls.webp', '3'),
        ('sc', 'alstroemeria', 'Alstroemeria', '#ff699e', 'wiki/shared/static/icon/sc/alstroemeria.webp', '4'),
        ('sc', 'straylight', 'Straylight', '#af011c', 'wiki/shared/static/icon/sc/straylight.webp', '5'),
        ('sc', 'noctchill', 'noctchill', '#384d98', 'wiki/shared/static/icon/sc/noctchill.webp', '6'),
        ('sc', 'shhis', 'SHHis', '#008e74', 'wiki/shared/static/icon/sc/shhis.webp', '7'),
        ('sc', 'cometik', 'CoMETIK', '#333333', 'wiki/shared/static/icon/sc/cometik.webp', '8'),
        ('sc', 'sc-collab', '联动', '#eb3ba6', 'wiki/shared/static/icon/sc/collab.webp', '9'),
        ('gk', 'gk-special', '特殊', '#3f51b5', 'wiki/shared/static/icon/gk/special.webp', '0'),
        ('gk', 'hatsuboshi-gakuen', '初星学园', '#ff9800', 'wiki/shared/static/icon/gk/hatsuboshi_gakuen.webp', '1')
)
INSERT INTO public.wiki_groups
    (agency_id, code, name, color, icon_object_key, display_order, is_fallback)
SELECT a.id, seed.code, seed.name, seed.color, NULLIF(seed.icon_object_key, ''),
       seed.display_order::integer, FALSE
FROM seed JOIN public.agencies a ON a.code = seed.agency_code;

INSERT INTO public.wiki_groups
    (agency_id, code, name, color, display_order, is_fallback)
SELECT a.id, 'other', '事务所人员与其他', '#777777',
       COALESCE(MAX(g.display_order), -1) + 1, TRUE
FROM public.agencies a
LEFT JOIN public.wiki_groups g ON g.agency_id = a.id
GROUP BY a.id;

WITH seed(agency_code, group_code, folder_name, member_order) AS (VALUES
        ('765', '765pro', 'amami_haruka', '0'),
        ('765', '765pro', 'kisaragi_chihaya', '1'),
        ('765', '765pro', 'hoshii_miki', '2'),
        ('765', '765pro', 'hagiwara_yukiho', '3'),
        ('765', '765pro', 'takatsuki_yayoi', '4'),
        ('765', '765pro', 'kikuchi_makoto', '5'),
        ('765', '765pro', 'minase_iori', '6'),
        ('765', '765pro', 'shijou_takane', '7'),
        ('765', '765pro', 'akizuki_ritsuko', '8'),
        ('765', '765pro', 'miura_azusa', '9'),
        ('765', '765pro', 'futami_ami', '10'),
        ('765', '765pro', 'futami_mami', '11'),
        ('765', '765pro', 'ganaha_hibiki', '12'),
        ('765', '961pro', 'leon', '0'),
        ('765', '961pro', 'shika', '1'),
        ('765', '961pro', 'okuzora_kohaku', '2'),
        ('765', '961pro', 'aya', '3'),
        ('876', 'dearly-stars', 'hidaka_ai', '0'),
        ('876', 'dearly-stars', 'mizutani_eri', '1'),
        ('876', 'dearly-stars', 'akizuki_ryo', '2'),
        ('876', 'valiv', 'tomori_manaka', '0'),
        ('876', 'valiv', 'kamizuru_cosmo', '1'),
        ('876', 'valiv', 'letora', '2'),
        ('cg', 'cg-special', 'main_story', '0'),
        ('cg', 'cg-special', 'event_story', '1'),
        ('cg', 'cute', 'shimamura_uzuki', '0'),
        ('cg', 'cute', 'nakano_yuka', '1'),
        ('cg', 'cute', 'mizumoto_yukari', '2'),
        ('cg', 'cute', 'shiina_noriko', '3'),
        ('cg', 'cute', 'mimura_kanako', '4'),
        ('cg', 'cute', 'kohinata_miho', '5'),
        ('cg', 'cute', 'ogata_chieri', '6'),
        ('cg', 'cute', 'igarashi_kyoko', '7'),
        ('cg', 'cute', 'sakurai_momoka', '8'),
        ('cg', 'cute', 'seki_hiromi', '9'),
        ('cg', 'cute', 'munakata_atsumi', '10'),
        ('cg', 'cute', 'fujimoto_rina', '11'),
        ('cg', 'cute', 'yusa_kozue', '12'),
        ('cg', 'cute', 'ichinose_shiki', '13'),
        ('cg', 'cute', 'maekawa_miku', '14'),
        ('cg', 'cute', 'miyamoto_frederica', '15'),
        ('cg', 'cute', 'kobayakawa_sae', '16'),
        ('cg', 'cute', 'saionji_kotoka', '17'),
        ('cg', 'cute', 'futaba_anzu', '18'),
        ('cg', 'cute', 'domyoji_karin', '19'),
        ('cg', 'cute', 'koshimizu_sachiko', '20'),
        ('cg', 'cute', 'abe_nana', '21'),
        ('cg', 'cute', 'koga_koharu', '22'),
        ('cg', 'cute', 'sakuma_mayu', '23'),
        ('cg', 'cute', 'shiragiku_hotaru', '24'),
        ('cg', 'cute', 'hayasaka_mirei', '25'),
        ('cg', 'cute', 'otokura_yuuki', '26'),
        ('cg', 'cute', 'tsujino_akari', '27'),
        ('cg', 'cute', 'kurosaki_chitose', '28'),
        ('cg', 'cute', 'shirayuki_chiyo', '29'),
        ('cg', 'cute', 'fukuyama_mai', '30'),
        ('cg', 'cute', 'imai_kana', '31'),
        ('cg', 'cute', 'mochida_arisa', '32'),
        ('cg', 'cute', 'okuyama_saori', '33'),
        ('cg', 'cute', 'manaka_misato', '34'),
        ('cg', 'cute', 'yanase_miyuki', '35'),
        ('cg', 'cute', 'egami_tsubaki', '36'),
        ('cg', 'cute', 'nagatomi_hasumi', '37'),
        ('cg', 'cute', 'yokoyama_chika', '38'),
        ('cg', 'cute', 'ohta_yuu', '39'),
        ('cg', 'cute', 'ohara_michiru', '40'),
        ('cg', 'cute', 'ohnuma_kurumi', '41'),
        ('cg', 'cute', 'akanishi_erika', '42'),
        ('cg', 'cute', 'matsubara_saya', '43'),
        ('cg', 'cute', 'aihara_yukino', '44'),
        ('cg', 'cute', 'yao_fueifuei', '45'),
        ('cg', 'cute', 'momoi_azuki', '46'),
        ('cg', 'cute', 'suzumiya_seika', '47'),
        ('cg', 'cute', 'tsukimiya_miyabi', '48'),
        ('cg', 'cute', 'hyodo_rena', '49'),
        ('cg', 'cute', 'niwa_hitomi', '50'),
        ('cg', 'cute', 'yanagi_kiyora', '51'),
        ('cg', 'cute', 'imura_setsuna', '52'),
        ('cg', 'cute', 'kusakabe_wakaba', '53'),
        ('cg', 'cute', 'sakakibara_satomi', '54'),
        ('cg', 'cute', 'anzai_miyako', '55'),
        ('cg', 'cute', 'asano_fuka', '56'),
        ('cg', 'cute', 'ohnishi_yuriko', '57'),
        ('cg', 'cute', 'kudo_shinobu', '58'),
        ('cg', 'cute', 'kurihara_nene', '59'),
        ('cg', 'cute', 'clarice', '60'),
        ('cg', 'cute', 'muramatsu_sakura', '61'),
        ('cg', 'cute', 'ariura_kanna', '62'),
        ('cg', 'cute', 'harada_miyo', '63'),
        ('cg', 'cute', 'ikebukuro_akiha', '64'),
        ('cg', 'cool', 'shibuya_rin', '0'),
        ('cg', 'cool', 'kawashima_mizuki', '1'),
        ('cg', 'cool', 'kamiya_nao', '2'),
        ('cg', 'cool', 'kamijo_haruna', '3'),
        ('cg', 'cool', 'araki_hina', '4'),
        ('cg', 'cool', 'tada_riina', '5'),
        ('cg', 'cool', 'sasaki_chie', '6'),
        ('cg', 'cool', 'mifune_miyu', '7'),
        ('cg', 'cool', 'fujiwara_hajime', '8'),
        ('cg', 'cool', 'nitta_minami', '9'),
        ('cg', 'cool', 'tachibana_arisu', '10'),
        ('cg', 'cool', 'sagisawa_fumika', '11'),
        ('cg', 'cool', 'yagami_makino', '12'),
        ('cg', 'cool', 'layla', '13'),
        ('cg', 'cool', 'asari_nanami', '14'),
        ('cg', 'cool', 'matsunaga_ryo', '15'),
        ('cg', 'cool', 'takagaki_kaede', '16'),
        ('cg', 'cool', 'kanzaki_ranko', '17'),
        ('cg', 'cool', 'hojo_karen', '18'),
        ('cg', 'cool', 'sajo_yukimi', '19'),
        ('cg', 'cool', 'shirasaka_koume', '20'),
        ('cg', 'cool', 'shiomi_syuko', '21'),
        ('cg', 'cool', 'wakiyama_tamami', '22'),
        ('cg', 'cool', 'hayami_kanade', '23'),
        ('cg', 'cool', 'ohishi_izumi', '24'),
        ('cg', 'cool', 'morikubo_nono', '25'),
        ('cg', 'cool', 'anastasia', '26'),
        ('cg', 'cool', 'yamato_aki', '27'),
        ('cg', 'cool', 'yuuki_haru', '28'),
        ('cg', 'cool', 'ninomiya_asuka', '29'),
        ('cg', 'cool', 'kiryu_tsukasa', '30'),
        ('cg', 'cool', 'mochizuki_hijiri', '31'),
        ('cg', 'cool', 'takafuji_kako', '32'),
        ('cg', 'cool', 'sunazuka_akira', '33'),
        ('cg', 'cool', 'hisakawa_hayate', '34'),
        ('cg', 'cool', 'kurokawa_chiaki', '35'),
        ('cg', 'cool', 'matsumoto_sarina', '36'),
        ('cg', 'cool', 'kirino_aya', '37'),
        ('cg', 'cool', 'takahashi_reiko', '38'),
        ('cg', 'cool', 'aikawa_chinatsu', '39'),
        ('cg', 'cool', 'togo_ai', '40'),
        ('cg', 'cool', 'mizuki_seira', '41'),
        ('cg', 'cool', 'hattori_toko', '42'),
        ('cg', 'cool', 'kiba_manami', '43'),
        ('cg', 'cool', 'mizuno_midori', '44'),
        ('cg', 'cool', 'furusawa_yoriko', '45'),
        ('cg', 'cool', 'helen', '46'),
        ('cg', 'cool', 'komuro_chinami', '47'),
        ('cg', 'cool', 'takamine_noa', '48'),
        ('cg', 'cool', 'ijuin_megumi', '49'),
        ('cg', 'cool', 'hiiragi_shino', '50'),
        ('cg', 'cool', 'kate', '51'),
        ('cg', 'cool', 'sena_shiori', '52'),
        ('cg', 'cool', 'ayase_honoka', '53'),
        ('cg', 'cool', 'shinohara_rei', '54'),
        ('cg', 'cool', 'wakui_rumi', '55'),
        ('cg', 'cool', 'yoshioka_saki', '56'),
        ('cg', 'cool', 'umeki_otoha', '57'),
        ('cg', 'cool', 'kishibe_ayaka', '58'),
        ('cg', 'cool', 'ujiie_mutsumi', '59'),
        ('cg', 'cool', 'nishikawa_honami', '60'),
        ('cg', 'cool', 'narumiya_yume', '61'),
        ('cg', 'cool', 'fujii_tomo', '62'),
        ('cg', 'cool', 'okazaki_yasuha', '63'),
        ('cg', 'cool', 'matsuo_chizuru', '64'),
        ('cg', 'passion', 'honda_mio', '0'),
        ('cg', 'passion', 'takamori_aiko', '1'),
        ('cg', 'passion', 'ryuzaki_kaoru', '2'),
        ('cg', 'passion', 'kimura_natsuki', '3'),
        ('cg', 'passion', 'akagi_miria', '4'),
        ('cg', 'passion', 'ohtsuki_yui', '5'),
        ('cg', 'passion', 'himekawa_yuki', '6'),
        ('cg', 'passion', 'kitami_yuzu', '7'),
        ('cg', 'passion', 'ueda_suzuho', '8'),
        ('cg', 'passion', 'oikawa_shizuku', '9'),
        ('cg', 'passion', 'koseki_reina', '10'),
        ('cg', 'passion', 'hoshi_syoko', '11'),
        ('cg', 'passion', 'katagiri_sanae', '12'),
        ('cg', 'passion', 'hori_yuko', '13'),
        ('cg', 'passion', 'matoba_risa', '14'),
        ('cg', 'passion', 'yorita_yoshino', '15'),
        ('cg', 'passion', 'aiba_yumi', '16'),
        ('cg', 'passion', 'jougasaki_mika', '17'),
        ('cg', 'passion', 'jougasaki_rika', '18'),
        ('cg', 'passion', 'hino_akane', '19'),
        ('cg', 'passion', 'moroboshi_kirari', '20'),
        ('cg', 'passion', 'totoki_airi', '21'),
        ('cg', 'passion', 'natalia', '22'),
        ('cg', 'passion', 'mukai_takumi', '23'),
        ('cg', 'passion', 'ichihara_nina', '24'),
        ('cg', 'passion', 'kita_hinako', '25'),
        ('cg', 'passion', 'namba_emi', '26'),
        ('cg', 'passion', 'hamaguchi_ayame', '27'),
        ('cg', 'passion', 'murakami_tomoe', '28'),
        ('cg', 'passion', 'sato_shin', '29'),
        ('cg', 'passion', 'nanjo_hikaru', '30'),
        ('cg', 'passion', 'eve_santaclaus', '31'),
        ('cg', 'passion', 'yumemi_riamu', '32'),
        ('cg', 'passion', 'hisakawa_nagi', '33'),
        ('cg', 'passion', 'namiki_meiko', '34'),
        ('cg', 'passion', 'matsuyama_kumiko', '35'),
        ('cg', 'passion', 'saito_yoko', '36'),
        ('cg', 'passion', 'sawada_marina', '37'),
        ('cg', 'passion', 'yaguchi_miu', '38'),
        ('cg', 'passion', 'aino_nagisa', '39'),
        ('cg', 'passion', 'manabe_itsuki', '40'),
        ('cg', 'passion', 'ebihara_naho', '41'),
        ('cg', 'passion', 'etou_misaki', '42'),
        ('cg', 'passion', 'nishijima_kai', '43'),
        ('cg', 'passion', 'zaizen_tokiko', '44'),
        ('cg', 'passion', 'nonomura_sora', '45'),
        ('cg', 'passion', 'hamakawa_ayuna', '46'),
        ('cg', 'passion', 'wakabayashi_tomoka', '47'),
        ('cg', 'passion', 'senzaki_ema', '48'),
        ('cg', 'passion', 'soma_natsumi', '49'),
        ('cg', 'passion', 'makihara_shiho', '50'),
        ('cg', 'passion', 'sugisaka_umi', '51'),
        ('cg', 'passion', 'kitagawa_mahiro', '52'),
        ('cg', 'passion', 'mary_cochran', '53'),
        ('cg', 'passion', 'komatsu_ibuki', '54'),
        ('cg', 'passion', 'miyoshi_sana', '55'),
        ('cg', 'passion', 'cathy_graham', '56'),
        ('cg', 'passion', 'tsuchiya_ako', '57'),
        ('cg', 'passion', 'shuto_aoi', '58'),
        ('cg', 'passion', 'saejima_kiyomi', '59'),
        ('ml', 'ml-special', 'main_story', '0'),
        ('ml', 'ml-special', 'event_story', '1'),
        ('ml', 'ml-special', 'festival_story', '2'),
        ('ml', 'ml-special', 'management_birthday', '3'),
        ('ml', 'ml-special', 'aoba_misaki', '4'),
        ('ml', 'ml-special', 'shika', '5'),
        ('ml', 'ml-special', 'leon', '6'),
        ('ml', 'ml-special', '346_pro', '7'),
        ('ml', 'ml-special', 'ichinose_shiki', '8'),
        ('ml', 'ml-allstars', 'amami_haruka', '0'),
        ('ml', 'ml-allstars', 'kisaragi_chihaya', '1'),
        ('ml', 'ml-allstars', 'hoshii_miki', '2'),
        ('ml', 'ml-allstars', 'hagiwara_yukiho', '3'),
        ('ml', 'ml-allstars', 'takatsuki_yayoi', '4'),
        ('ml', 'ml-allstars', 'kikuchi_makoto', '5'),
        ('ml', 'ml-allstars', 'minase_iori', '6'),
        ('ml', 'ml-allstars', 'shijou_takane', '7'),
        ('ml', 'ml-allstars', 'akizuki_ritsuko', '8'),
        ('ml', 'ml-allstars', 'miura_azusa', '9'),
        ('ml', 'ml-allstars', 'futami_ami', '10'),
        ('ml', 'ml-allstars', 'futami_mami', '11'),
        ('ml', 'ml-allstars', 'ganaha_hibiki', '12'),
        ('ml', 'princess-stars', 'kasuga_mirai', '0'),
        ('ml', 'princess-stars', 'tanaka_kotoha', '1'),
        ('ml', 'princess-stars', 'satake_minako', '2'),
        ('ml', 'princess-stars', 'tokugawa_matsuri', '3'),
        ('ml', 'princess-stars', 'nanao_yuriko', '4'),
        ('ml', 'princess-stars', 'takayama_sayoko', '5'),
        ('ml', 'princess-stars', 'matsuda_arisa', '6'),
        ('ml', 'princess-stars', 'kousaka_umi', '7'),
        ('ml', 'princess-stars', 'nakatani_iku', '8'),
        ('ml', 'princess-stars', 'emily_stewart', '9'),
        ('ml', 'princess-stars', 'yabuki_kana', '10'),
        ('ml', 'princess-stars', 'yokoyama_nao', '11'),
        ('ml', 'princess-stars', 'fukuda_noriko', '12'),
        ('ml', 'fairy-stars', 'mogami_shizuka', '0'),
        ('ml', 'fairy-stars', 'tokoro_megumi', '1'),
        ('ml', 'fairy-stars', 'roco', '2'),
        ('ml', 'fairy-stars', 'tenkubashi_tomoka', '3'),
        ('ml', 'fairy-stars', 'kitazawa_shiho', '4'),
        ('ml', 'fairy-stars', 'maihama_ayumu', '5'),
        ('ml', 'fairy-stars', 'nikaido_chizuru', '6'),
        ('ml', 'fairy-stars', 'makabe_mizuki', '7'),
        ('ml', 'fairy-stars', 'momose_rio', '8'),
        ('ml', 'fairy-stars', 'nagayoshi_subaru', '9'),
        ('ml', 'fairy-stars', 'suou_momoko', '10'),
        ('ml', 'fairy-stars', 'julia', '11'),
        ('ml', 'fairy-stars', 'shiraishi_tsumugi', '12'),
        ('ml', 'angel-stars', 'ibuki_tsubasa', '0'),
        ('ml', 'angel-stars', 'shimabara_elena', '1'),
        ('ml', 'angel-stars', 'hakozaki_serika', '2'),
        ('ml', 'angel-stars', 'nonohara_akane', '3'),
        ('ml', 'angel-stars', 'mochizuki_anna', '4'),
        ('ml', 'angel-stars', 'kinoshita_hinata', '5'),
        ('ml', 'angel-stars', 'baba_konomi', '6'),
        ('ml', 'angel-stars', 'oogami_tamaki', '7'),
        ('ml', 'angel-stars', 'toyokawa_fuka', '8'),
        ('ml', 'angel-stars', 'miyao_miya', '9'),
        ('ml', 'angel-stars', 'shinomiya_karen', '10'),
        ('ml', 'angel-stars', 'kitakami_reika', '11'),
        ('ml', 'angel-stars', 'sakuramori_kaori', '12'),
        ('sidem', 'sidem-special', 'reading_play', '0'),
        ('sidem', 'sidem-special', 'growing_stars', '1'),
        ('sidem', 'sidem-units', 'jupiter', '0'),
        ('sidem', 'sidem-units', 'dramatic_stars', '1'),
        ('sidem', 'sidem-units', 'altessimo', '2'),
        ('sidem', 'sidem-units', 'beit', '3'),
        ('sidem', 'sidem-units', 'w', '4'),
        ('sidem', 'sidem-units', 'frame', '5'),
        ('sidem', 'sidem-units', 'sai', '6'),
        ('sidem', 'sidem-units', 'high_joker', '7'),
        ('sidem', 'sidem-units', 'shinsoku_ikkon', '8'),
        ('sidem', 'sidem-units', 'cafe_parade', '9'),
        ('sidem', 'sidem-units', 'mofumofuen', '10'),
        ('sidem', 'sidem-units', 'sem', '11'),
        ('sidem', 'sidem-units', 'the_kogadou', '12'),
        ('sidem', 'sidem-units', 'flags', '13'),
        ('sidem', 'sidem-units', 'legenders', '14'),
        ('sidem', 'sidem-units', 'c_first', '15'),
        ('sc', 'sc-special', 'enza_units', '0'),
        ('sc', 'sc-special', 'enza_festivals', '1'),
        ('sc', 'sc-special', 'scsp_event', '2'),
        ('sc', 'sc-special', 'live', '3'),
        ('sc', 'sc-special', 'nanakusa_hazuki', '4'),
        ('sc', 'illumination-stars', 'sakuragi_mano', '0'),
        ('sc', 'illumination-stars', 'kazano_hiori', '1'),
        ('sc', 'illumination-stars', 'hachimiya_meguru', '2'),
        ('sc', 'lantica', 'tsukioka_kogane', '0'),
        ('sc', 'lantica', 'tanaka_mamimi', '1'),
        ('sc', 'lantica', 'shirase_sakuya', '2'),
        ('sc', 'lantica', 'mitsumine_yuika', '3'),
        ('sc', 'lantica', 'yukoku_kiriko', '4'),
        ('sc', 'houkago-climax-girls', 'komiya_kaho', '0'),
        ('sc', 'houkago-climax-girls', 'sonoda_chiyoko', '1'),
        ('sc', 'houkago-climax-girls', 'saijo_juri', '2'),
        ('sc', 'houkago-climax-girls', 'morino_rinze', '3'),
        ('sc', 'houkago-climax-girls', 'arisugawa_natsuha', '4'),
        ('sc', 'alstroemeria', 'osaki_amana', '0'),
        ('sc', 'alstroemeria', 'osaki_tenka', '1'),
        ('sc', 'alstroemeria', 'kuwayama_chiyuki', '2'),
        ('sc', 'straylight', 'serizawa_asahi', '0'),
        ('sc', 'straylight', 'mayuzumi_fuyuko', '1'),
        ('sc', 'straylight', 'izumi_mei', '2'),
        ('sc', 'noctchill', 'asakura_toru', '0'),
        ('sc', 'noctchill', 'higuchi_madoka', '1'),
        ('sc', 'noctchill', 'fukumaru_koito', '2'),
        ('sc', 'noctchill', 'ichikawa_hinana', '3'),
        ('sc', 'shhis', 'nanakusa_nichika', '0'),
        ('sc', 'shhis', 'aketa_mikoto', '1'),
        ('sc', 'cometik', 'ikaruga_luca', '0'),
        ('sc', 'cometik', 'suzuki_hana', '1'),
        ('sc', 'cometik', 'ikuta_haruki', '2'),
        ('sc', 'sc-collab', 'ruby', '0'),
        ('sc', 'sc-collab', 'memcho', '1'),
        ('sc', 'sc-collab', 'arima_kana', '2'),
        ('sc', 'sc-collab', 'kurokawa_akane', '3'),
        ('sc', 'sc-collab', 'collab', '4'),
        ('gk', 'gk-special', 'main_story', '0'),
        ('gk', 'gk-special', 'event_story', '1'),
        ('gk', 'gk-special', 's_card', '2'),
        ('gk', 'gk-special', 'neo_asari', '3'),
        ('gk', 'hatsuboshi-gakuen', 'hanami_saki', '0'),
        ('gk', 'hatsuboshi-gakuen', 'tsukimura_temari', '1'),
        ('gk', 'hatsuboshi-gakuen', 'fujita_kotone', '2'),
        ('gk', 'hatsuboshi-gakuen', 'arimura_mao', '3'),
        ('gk', 'hatsuboshi-gakuen', 'katsuragi_liliya', '4'),
        ('gk', 'hatsuboshi-gakuen', 'kuramoto_china', '5'),
        ('gk', 'hatsuboshi-gakuen', 'shiun_sumika', '6'),
        ('gk', 'hatsuboshi-gakuen', 'shinosawa_hiro', '7'),
        ('gk', 'hatsuboshi-gakuen', 'himesaki_riha', '8'),
        ('gk', 'hatsuboshi-gakuen', 'hanami_ume', '9'),
        ('gk', 'hatsuboshi-gakuen', 'hataya_misuzu', '10'),
        ('gk', 'hatsuboshi-gakuen', 'juo_sena', '11'),
        ('gk', 'hatsuboshi-gakuen', 'amaya_tsubame', '12')
), matched AS (
    SELECT a.id AS agency_id, g.id AS group_id, i.id AS idol_id,
           g.display_order AS group_order, seed.member_order::integer
    FROM seed
    JOIN public.agencies a ON a.code = seed.agency_code
    JOIN public.wiki_groups g ON g.agency_id = a.id AND g.code = seed.group_code
    JOIN public.idols i ON i.agency_id = a.id AND i.folder_name = seed.folder_name
), deduplicated AS (
    SELECT DISTINCT ON (idol_id) agency_id, group_id, idol_id, group_order, member_order
    FROM matched
    ORDER BY idol_id, group_order, member_order
), ordered AS (
    SELECT agency_id, group_id, idol_id,
           ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY member_order, idol_id) - 1 AS display_order
    FROM deduplicated
)
INSERT INTO public.wiki_group_members(agency_id, group_id, idol_id, display_order)
SELECT agency_id, group_id, idol_id, display_order FROM ordered;

WITH missing AS (
    SELECT i.agency_id, g.id AS group_id, i.id AS idol_id,
           ROW_NUMBER() OVER (PARTITION BY i.agency_id ORDER BY i.display_order, i.id) - 1 AS ordinal
    FROM public.idols i
    JOIN public.wiki_groups g ON g.agency_id = i.agency_id AND g.is_fallback
    LEFT JOIN public.wiki_group_members m ON m.idol_id = i.id
    WHERE i.wiki_enabled AND m.idol_id IS NULL
), offsets AS (
    SELECT group_id, COALESCE(MAX(display_order), -1) + 1 AS next_order
    FROM public.wiki_group_members GROUP BY group_id
)
INSERT INTO public.wiki_group_members(agency_id, group_id, idol_id, display_order)
SELECT missing.agency_id, missing.group_id, missing.idol_id,
       COALESCE(offsets.next_order, 0) + missing.ordinal
FROM missing LEFT JOIN offsets ON offsets.group_id = missing.group_id;

WITH seed(agency_code, name, storage_slug, background_eligible) AS (VALUES
        ('765', 'SP', 'sp', 'FALSE'),
        ('765', '二代', 'gen2', 'FALSE'),
        ('765', '白金星光', 'platinum', 'FALSE'),
        ('765', '星光舞台', 'stella', 'FALSE'),
        ('765', 'OFA', 'ofa', 'FALSE'),
        ('765', '星耀季节', 'starlit', 'FALSE'),
        ('876', 'ytb，X链接 [需要VPN]', 'ytb_x_link', 'FALSE'),
        ('876', 'b站的一些切片', 'bilibili_clips', 'FALSE'),
        ('cg', '特殊', 'special', 'FALSE'),
        ('cg', '卡剧情', 'card', 'TRUE'),
        ('ml', '亲密度剧情', 'intimacy', 'FALSE'),
        ('ml', '横卡', 'h_card', 'TRUE'),
        ('ml', '竖卡', 'v_card', 'FALSE'),
        ('ml', '生日', 'birthday', 'FALSE'),
        ('ml', '新年', 'new_year', 'FALSE'),
        ('ml', '情人节', 'valentine', 'FALSE'),
        ('ml', '白情', 'whiteday', 'FALSE'),
        ('ml', '圣诞节', 'christmas', 'FALSE'),
        ('ml', '万圣节', 'halloween', 'FALSE'),
        ('sidem', '个人剧情', 'personal', 'FALSE'),
        ('sidem', '组合剧情', 'unit_story', 'FALSE'),
        ('sidem', '活动剧情', 'event', 'FALSE'),
        ('sidem', '卡剧情', 'card', 'FALSE'),
        ('sidem', '节日_生日', 'festival_birthday', 'FALSE'),
        ('sidem', '其他', 'others', 'FALSE'),
        ('sc', 'illumination STARS', 'cat_696c6c756d69', 'FALSE'),
        ('sc', 'L''Antica', 'cat_4c27416e7469', 'FALSE'),
        ('sc', '放学后Climax Girls', 'cat_e694bee5ada6', 'FALSE'),
        ('sc', 'Alstroemeria', 'cat_416c7374726f', 'FALSE'),
        ('sc', 'Straylight', 'cat_53747261796c', 'FALSE'),
        ('sc', 'noctchill', 'cat_6e6f63746368', 'FALSE'),
        ('sc', 'SHHis', 'cat_5348486973', 'FALSE'),
        ('sc', 'CoMETIK', 'cat_436f4d455449', 'FALSE'),
        ('sc', '🍫情人节', 'valentine', 'FALSE'),
        ('sc', '🍬白色情人节', 'whiteday', 'FALSE'),
        ('sc', '🃏愚人节', 'april_fools', 'FALSE'),
        ('sc', '🌟闪耀日', 'shiny_day', 'FALSE'),
        ('sc', '🎃万圣节', 'halloween', 'FALSE'),
        ('sc', '🎄圣诞节', 'christmas', 'FALSE'),
        ('sc', '📄其他', 'others', 'FALSE'),
        ('sc', '组合剧情', 'unit_story', 'FALSE'),
        ('sc', '偶像直播', 'idol_live', 'FALSE'),
        ('sc', '特殊', 'special', 'FALSE'),
        ('sc', '星组', 'ilstars', 'FALSE'),
        ('sc', '安提卡', 'lantica', 'FALSE'),
        ('sc', '放学后', 'afterschool', 'FALSE'),
        ('sc', '花组', 'alstroemeria', 'FALSE'),
        ('sc', '迷光', 'straylight', 'FALSE'),
        ('sc', 'N组', 'noctchill', 'FALSE'),
        ('sc', '嘘组', 'shhis', 'FALSE'),
        ('sc', '黑星', 'cometik', 'FALSE'),
        ('sc', '混组训练直播', 'mixed_live', 'FALSE'),
        ('sc', 'enza主线', 'enza_main', 'FALSE'),
        ('sc', 'enzaP卡', 'enza_pcard', 'TRUE'),
        ('sc', 'enzaS卡', 'enza_scard', 'TRUE'),
        ('sc', '特殊剧情', 'special_story', 'FALSE'),
        ('sc', 'scspS卡', 'scsp_scard', 'FALSE'),
        ('sc', 'Episode 0', 'ep0', 'FALSE'),
        ('sc', 'scspP卡_电话', 'scsp_pcard_call', 'FALSE'),
        ('gk', '初', 'first', 'FALSE'),
        ('gk', 'N.I.A', 'nia', 'FALSE'),
        ('gk', 'STEP3', 'step3', 'FALSE'),
        ('gk', 'P卡', 'pcard', 'TRUE')
)
INSERT INTO public.wiki_categories(agency_id, name, storage_slug, background_eligible)
SELECT a.id, seed.name, seed.storage_slug, seed.background_eligible::boolean
FROM seed JOIN public.agencies a ON a.code = seed.agency_code
ON CONFLICT (agency_id, name) DO NOTHING;

WITH story_categories(agency_code, name) AS (
    SELECT '765', category FROM public."765_stories"
    UNION SELECT '876', category FROM public."876_stories"
    UNION SELECT 'cg', category FROM public.cg_stories
    UNION SELECT 'ml', category FROM public.ml_stories
    UNION SELECT 'sidem', category FROM public.sidem_stories
    UNION SELECT 'sc', category FROM public.sc_stories
    UNION SELECT 'gk', category FROM public.gk_stories
)
INSERT INTO public.wiki_categories(agency_id, name, storage_slug, background_eligible)
SELECT a.id, story_categories.name, 'cat_' || SUBSTRING(md5(story_categories.name), 1, 12), FALSE
FROM story_categories JOIN public.agencies a ON a.code = story_categories.agency_code
ON CONFLICT (agency_id, name) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('SP', '0'),
        ('二代', '1'),
        ('白金星光', '2'),
        ('星光舞台', '3'),
        ('OFA', '4'),
        ('星耀季节', '5')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = '765' AND i.name_cn NOT IN ('奥空心白','玲音','诗花','四条贵音','我那霸响','亚夜','星井美希')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('ytb，X链接 [需要VPN]', '0'),
        ('b站的一些切片', '1')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = '876' AND i.name_cn NOT IN ('日高爱','水谷绘理','秋月凉')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('特殊', '0'),
        ('卡剧情', '1')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'cg' AND i.name_cn <> '活动剧情'
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('亲密度剧情', '0'),
        ('横卡', '1'),
        ('竖卡', '2'),
        ('生日', '3'),
        ('新年', '4'),
        ('情人节', '5'),
        ('白情', '6'),
        ('圣诞节', '7'),
        ('万圣节', '8')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'ml' AND i.name_cn NOT IN ('主线剧情','活动剧情','管理层生日','诗花','玲音','346')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('个人剧情', '0'),
        ('组合剧情', '1'),
        ('活动剧情', '2'),
        ('卡剧情', '3'),
        ('节日_生日', '4'),
        ('其他', '5')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sidem' AND i.name_cn NOT IN ('朗读剧','成长之星')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('illumination STARS', '0'),
        ('L''Antica', '1'),
        ('放学后Climax Girls', '2'),
        ('Alstroemeria', '3'),
        ('Straylight', '4'),
        ('noctchill', '5'),
        ('SHHis', '6'),
        ('CoMETIK', '7')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn = 'enza组合'
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('🍫情人节', '0'),
        ('🍬白色情人节', '1'),
        ('🃏愚人节', '2'),
        ('🌟闪耀日', '3'),
        ('🎃万圣节', '4'),
        ('🎄圣诞节', '5'),
        ('📄其他', '6')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn = 'enza节日'
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('组合剧情', '0')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn = '联动活动'
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('偶像直播', '0'),
        ('特殊', '1'),
        ('星组', '2'),
        ('安提卡', '3'),
        ('放学后', '4'),
        ('花组', '5'),
        ('迷光', '6'),
        ('N组', '7'),
        ('嘘组', '8'),
        ('黑星', '9'),
        ('混组训练直播', '10')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn = '直播'
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('enza主线', '0'),
        ('enzaP卡', '1'),
        ('enzaS卡', '2')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn IN ('ルビー','MEMちょ','有馬かな','黒川あかね')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('特殊剧情', '0'),
        ('enzaS卡', '1'),
        ('scspS卡', '2')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn = '七草叶月'
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('enza主线', '0'),
        ('Episode 0', '1'),
        ('特殊剧情', '2'),
        ('enzaP卡', '3'),
        ('enzaS卡', '4'),
        ('scspP卡_电话', '5'),
        ('scspS卡', '6')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'sc' AND i.name_cn NOT IN ('enza组合','enza节日','联动活动','直播','scsp活动','ルビー','MEMちょ','有馬かな','黒川あかね','七草叶月')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH ordered(name, display_order) AS (VALUES
        ('初', '0'),
        ('N.I.A', '1'),
        ('STEP3', '2'),
        ('P卡', '3')
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT a.id, i.id, c.id, ordered.display_order::integer, TRUE
FROM public.agencies a
JOIN public.idols i ON i.agency_id = a.id
JOIN ordered ON TRUE
JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = ordered.name
WHERE a.code = 'gk' AND i.name_cn NOT IN ('活动剧情','主线剧情','S卡','根绪亚纱里')
ON CONFLICT (idol_id, category_id) DO NOTHING;


WITH story_categories(agency_code, idol_id, name) AS (
    SELECT '765', idol_id, category FROM public."765_stories"
    UNION SELECT '876', idol_id, category FROM public."876_stories"
    UNION SELECT 'cg', idol_id, category FROM public.cg_stories
    UNION SELECT 'ml', idol_id, category FROM public.ml_stories
    UNION SELECT 'sidem', idol_id, category FROM public.sidem_stories
    UNION SELECT 'sc', idol_id, category FROM public.sc_stories
    UNION SELECT 'gk', idol_id, category FROM public.gk_stories
), missing AS (
    SELECT a.id AS agency_id, stories.idol_id, c.id AS category_id,
           ROW_NUMBER() OVER (PARTITION BY stories.idol_id ORDER BY c.name, c.id) - 1 AS ordinal
    FROM story_categories stories
    JOIN public.agencies a ON a.code = stories.agency_code
    JOIN public.idols i ON i.id = stories.idol_id AND i.agency_id = a.id
    JOIN public.wiki_categories c ON c.agency_id = a.id AND c.name = stories.name
    LEFT JOIN public.wiki_idol_categories existing
        ON existing.idol_id = stories.idol_id AND existing.category_id = c.id
    WHERE existing.category_id IS NULL
), offsets AS (
    SELECT idol_id, COALESCE(MAX(display_order), -1) + 1 AS next_order
    FROM public.wiki_idol_categories GROUP BY idol_id
)
INSERT INTO public.wiki_idol_categories
    (agency_id, idol_id, category_id, display_order, show_when_empty)
SELECT missing.agency_id, missing.idol_id, missing.category_id,
       COALESCE(offsets.next_order, 0) + missing.ordinal, FALSE
FROM missing LEFT JOIN offsets ON offsets.idol_id = missing.idol_id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.idols i
        LEFT JOIN public.wiki_group_members m ON m.idol_id = i.id
        WHERE i.wiki_enabled AND m.idol_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Wiki metadata migration left enabled idols without a group';
    END IF;
    IF EXISTS (
        SELECT agency_id FROM public.wiki_groups
        GROUP BY agency_id HAVING COUNT(*) FILTER (WHERE is_fallback) <> 1
    ) THEN
        RAISE EXCEPTION 'Wiki metadata migration requires one fallback group per agency';
    END IF;
END $$;
