import type { NamecardCharacterCategory } from '@imsweb/contracts/fudaba/admin-characters';

/**
 * A live `namecard_characters` row joined with the agency it belongs to. The
 * agency fields are part of the record because the admin list and the mutation
 * responses both render the agency label without a second round trip.
 *
 * `created_at` / `updated_at` are left as the driver returned them (a `Date` on
 * PostgreSQL) and normalised to ISO strings by the domain response mapper.
 */
export interface NamecardCharacterRecord {
    id: number;
    agency_id: number;
    agency_code: string;
    agency_name: string;
    agency_color: string;
    category: NamecardCharacterCategory;
    is_fallback: boolean;
    name_cn: string;
    name_ja: string | null;
    name_en: string | null;
    aliases: string | null;
    display_order: number;
    revision: number;
    created_at: string | Date;
    updated_at: string | Date;
}

export interface NamecardCharacterAgencyRecord {
    id: number;
    code: string;
    name_cn: string;
    color: string;
    wiki_enabled: boolean;
}

/**
 * Every list filter is optional; `null` means "do not filter". `query` is the
 * already-escaped and wildcard-wrapped `ILIKE` term produced by the domain.
 */
export interface NamecardCharacterListFilter {
    query: string | null;
    agencyId: number | null;
    category: NamecardCharacterCategory | null;
}

export interface NamecardCharacterListInput extends NamecardCharacterListFilter {
    limit: number;
    offset: number;
}

export interface NewNamecardCharacterInput {
    agencyId: number;
    category: NamecardCharacterCategory;
    isFallback: boolean;
    nameCn: string;
    nameJa: string | null;
    nameEn: string | null;
    aliases: string | null;
    displayOrder: number;
    /** Backoffice account id recorded as `created_by` / `updated_by`. */
    actorId: number;
}

export interface UpdateNamecardCharacterInput
    extends Omit<NewNamecardCharacterInput, 'isFallback'> {
    /** `null` leaves `is_fallback` untouched; the column is never nullable. */
    isFallback: boolean | null;
    id: number;
    revision: number;
}

export type NamecardCharacterCreateResult =
    | { status: 'created'; character: NamecardCharacterRecord }
    | { status: 'duplicate' }
    | { status: 'fallback-exists' }
    | { status: 'agency-not-found' };

export type NamecardCharacterUpdateResult =
    | { status: 'updated'; character: NamecardCharacterRecord }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' }
    | { status: 'duplicate' }
    | { status: 'fallback-exists' }
    | { status: 'agency-not-found' };

export type NamecardCharacterDeleteResult =
    | { status: 'deleted'; id: number }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' };

export interface NamecardCharacterRepository {
    listNamecardCharacters(
        input: NamecardCharacterListInput,
    ): Promise<NamecardCharacterRecord[]>;
    countNamecardCharacters(filter: NamecardCharacterListFilter): Promise<number>;
    findNamecardCharacterById(id: number): Promise<NamecardCharacterRecord | null>;
    /**
     * Every live character in catalog order, without pagination. The public
     * picker loads the whole catalog once so a keystroke never waits on the
     * network; `CHARACTER_ORDER` is the same order the admin list uses.
     */
    listNamecardCharacterCatalog(): Promise<NamecardCharacterRecord[]>;
    listNamecardCharacterAgencies(): Promise<NamecardCharacterAgencyRecord[]>;
    createNamecardCharacter(
        input: NewNamecardCharacterInput,
    ): Promise<NamecardCharacterCreateResult>;
    updateNamecardCharacter(
        input: UpdateNamecardCharacterInput,
    ): Promise<NamecardCharacterUpdateResult>;
    deleteNamecardCharacter(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardCharacterDeleteResult>;
}
