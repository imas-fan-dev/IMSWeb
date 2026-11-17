/**
 * The `logs.action` vocabulary for namecard unit administration.
 *
 * `logs.action` is a free string with no CHECK constraint, so module-level
 * constants are what keep the three actions searchable instead of drifting into
 * synonyms. The target encodes the row id plus the agencies a unit is filed
 * under, so an audit line can be traced back to the catalog entry.
 */
export const NAMECARD_UNIT_ACTIONS = {
    create: '创建名片组合',
    update: '更新名片组合',
    delete: '删除名片组合'
} as const;

export function namecardUnitAuditTarget(
    id: number,
    agencyIds?: readonly number[]
): string {
    return agencyIds === undefined || agencyIds.length === 0
        ? `namecard_unit=${id}`
        : `namecard_unit=${id};agencies=${agencyIds.join(',')}`;
}
