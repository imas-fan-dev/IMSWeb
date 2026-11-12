/**
 * SQL predicates that decide which `fudaba_cards` rows each public surface
 * may touch.
 *
 * `NAMECARD_COMPAT_ORIGIN` is the anonymous archive: rows unified from the
 * legacy archive and guest uploads. Anything scoped with it keys off
 * `card_number` and reverses the legacy media layout.
 *
 * `NAMECARD_PUBLIC_ORIGIN` is the public wall union: the anonymous archive plus
 * registered-user cards whose media was copied into the canonical layout when
 * they were approved. Reactions and read paths must use the same predicate as
 * the wall listing, otherwise a card can be listed and still be unreachable.
 */
export const NAMECARD_COMPAT_ORIGIN = "origin IN ('guest', 'legacy')";

export const NAMECARD_PUBLIC_ORIGIN =
    "(origin IN ('guest', 'legacy')" +
    // 统一布局的卡片以线上页面行为准；没有线上页面的旧布局不再参与可见性判断。
    " OR EXISTS (" +
    "SELECT 1 FROM public.fudaba_card_pages public_page" +
    " WHERE public_page.card_id = id AND public_page.queue = 'live'" +
    "))";
