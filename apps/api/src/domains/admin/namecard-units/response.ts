import type {
    NamecardUnit,
    NamecardUnitAgency,
    NamecardUnitMember
} from '@imsweb/contracts/fudaba/admin-units';
import type {
    NamecardUnitAgencyRecord,
    NamecardUnitMemberRecord,
    NamecardUnitRecord
} from '@/ports/repositories/namecard-units';

/**
 * `timestamptz` columns come back from the driver as `Date`; the wire contract
 * wants an ISO 8601 string with an offset, so the mapping is explicit rather
 * than spread to keep a future column from riding along silently.
 */
function isoString(value: string | Date): string {
    return typeof value === 'string' ? value : value.toISOString();
}

function toNamecardUnitAgency(
    record: NamecardUnitAgencyRecord
): NamecardUnitAgency {
    return {
        id: record.id,
        code: record.code,
        name: record.name_cn,
        color: record.color
    };
}

function toNamecardUnitMember(
    record: NamecardUnitMemberRecord
): NamecardUnitMember {
    return {
        characterId: record.character_id,
        nameCn: record.name_cn,
        nameJa: record.name_ja,
        nameEn: record.name_en,
        category: record.category
    };
}

export function toNamecardUnit(record: NamecardUnitRecord): NamecardUnit {
    return {
        id: record.id,
        nameCn: record.name_cn,
        nameJa: record.name_ja,
        nameEn: record.name_en,
        aliases: record.aliases,
        displayOrder: record.display_order,
        revision: record.revision,
        agencies: record.agencies.map(toNamecardUnitAgency),
        members: record.members.map(toNamecardUnitMember),
        createdAt: isoString(record.created_at),
        updatedAt: isoString(record.updated_at)
    };
}
