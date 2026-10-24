/**
 * Numeric limits and vocabulary shared by the namecard catalogs.
 *
 * This module deliberately carries no Zod: the API imports these values
 * through `@imsweb/contracts/fudaba/runtime`, and pulling the schema runtime
 * into a server-only module would be dead weight. The schema modules
 * (`./admin-characters`, `./admin-units`, `./characters`) re-export every
 * value here so the Web can keep reading them from the entrypoint it already
 * uses.
 */

/**
 * The namecard-side taxonomy for a candidate entry.
 *
 * Ordered as the picker and the backoffice present it, so a list sorted by
 * category follows 偶像 → 职员 → 对手 → 吉祥物 → 角色 → 其他.
 */
export const NAMECARD_CHARACTER_CATEGORIES = [
  "idol",
  "staff",
  "rival",
  "mascot",
  "chara",
  "other",
] as const

/** Page size the backoffice list uses when the caller names none. */
export const NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE = 20

/** Largest page the backoffice list accepts, so one request cannot scan it all. */
export const NAMECARD_CHARACTER_MAX_PAGE_SIZE = 100

/** Longest accepted character search term. */
export const NAMECARD_CHARACTER_MAX_QUERY_LENGTH = 160

/**
 * How many characters one namecard may list as its 担当.
 *
 * A guard rail against a hostile payload, not a product limit: a producer may
 * genuinely follow a few hundred characters, and picking one unit expands into
 * every member it has.
 */
export const NAMECARD_FAVORITE_CHARACTER_LIMIT = 200

/** Page size the unit list uses when the caller names none. */
export const NAMECARD_UNIT_DEFAULT_PAGE_SIZE = 20

/** Largest page the unit list accepts. */
export const NAMECARD_UNIT_MAX_PAGE_SIZE = 100

/** Longest accepted unit search term. */
export const NAMECARD_UNIT_MAX_QUERY_LENGTH = 160

/**
 * Members one unit may list. Members are always characters, never other units,
 * so this is a flat bound rather than a nesting depth.
 */
export const NAMECARD_UNIT_MAX_MEMBERS = 200

/**
 * Agencies one unit may be filed under. A unit spans agencies precisely because
 * it is only ever expanded into members, so a cross-agency 组合 stays legal.
 */
export const NAMECARD_UNIT_MAX_AGENCIES = 50
