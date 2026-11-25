-- ims:migration-phase: post-data
--
-- 收藏能力退役：名片「收藏夹」由名片册（`namecard_quick_exchange_cards`）取代。
-- 该表只存公开名片的收藏关系，与点赞（`fudaba_card_likes`）无关，也没有别的
-- 读写方；历史迁移 0022 保持原样，清理在这里做。

DROP TABLE IF EXISTS public.fudaba_card_favorites;
