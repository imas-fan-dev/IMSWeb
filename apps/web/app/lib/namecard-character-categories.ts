import type { NamecardCharacterCategory } from "~/lib/api"

/**
 * Chinese labels for the character-category vocabulary shared by the public
 * namecard picker and the admin character list. Kept here rather than in either
 * consumer so the two never drift apart.
 */
export const NAMECARD_CHARACTER_CATEGORY_LABELS: Record<
  NamecardCharacterCategory,
  string
> = {
  idol: "偶像",
  staff: "职员",
  rival: "对手",
  mascot: "吉祥物",
  chara: "角色",
  other: "其他",
}
