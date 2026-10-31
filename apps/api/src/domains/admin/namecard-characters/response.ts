import type {
    NamecardCharacter,
    NamecardCharacterAgency
} from '@imsweb/contracts/fudaba/admin-characters';
import type {
    NamecardCharacterAgencyRecord,
    NamecardCharacterRecord
} from '@/ports/repositories';

/**
 * `timestamptz` columns come back from the driver as `Date`; the wire contract
 * wants an ISO 8601 string with an offset, so the mapping is explicit rather
 * than spread to keep a future column from riding along silently.
 */
function isoString(value: string | Date): string {
    return typeof value === 'string' ? value : value.toISOString();
}

export function toNamecardCharacter(
    record: NamecardCharacterRecord
): NamecardCharacter {
    return {
        id: record.id,
        agencyId: record.agency_id,
        agencyCode: record.agency_code,
        agencyName: record.agency_name,
        agencyColor: record.agency_color,
        category: record.category,
        isFallback: record.is_fallback,
        nameCn: record.name_cn,
        nameJa: record.name_ja,
        nameEn: record.name_en,
        aliases: record.aliases,
        displayOrder: record.display_order,
        revision: record.revision,
        createdAt: isoString(record.created_at),
        updatedAt: isoString(record.updated_at)
    };
}

export function toNamecardCharacterAgency(
    record: NamecardCharacterAgencyRecord
): NamecardCharacterAgency {
    return {
        id: record.id,
        code: record.code,
        name: record.name_cn,
        color: record.color,
        wikiEnabled: record.wiki_enabled
    };
}
