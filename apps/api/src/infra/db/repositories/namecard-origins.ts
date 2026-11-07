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
    " OR front_object_key LIKE 'community/namecards/assets/%'" +
    // 属主改图后线上图是 fudaba 版本对象（审核时才复制进 canonical 布局），
    // 这两种布局都必须算进墙，否则改过图的名片会整张从墙上消失。
    " OR front_object_key LIKE 'community/fudaba/cards/%')";
