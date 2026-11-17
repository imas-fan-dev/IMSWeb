/**
 * The `logs.action` vocabulary for namecard candidate administration.
 *
 * `logs.action` is a free string with no CHECK constraint, so module-level
 * constants are what keep the three actions searchable instead of drifting into
 * synonyms. The target encodes the row id, plus the agency when the handler has
 * it, so an audit line can be traced back to the catalog entry.
 */
export const NAMECARD_CHARACTER_ACTIONS = {
    create: '创建名片角色',
    update: '更新名片角色',
    delete: '删除名片角色'
} as const;

export function namecardCharacterAuditTarget(
    id: number,
    agencyId?: number
): string {
    return agencyId === undefined
        ? `namecard_character=${id}`
        : `namecard_character=${id};agency=${agencyId}`;
}
