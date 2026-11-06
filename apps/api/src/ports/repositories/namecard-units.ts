import type { NamecardCharacterCategory } from '@imsweb/contracts/fudaba/admin-characters';

/**
 * A live `namecard_units` row. Agencies and members are not columns: they are
 * link tables, so the aggregate carries them alongside the row. The repository
 * always fills both, which is what lets the admin response render a unit in one
 * round trip.
 *
 * `created_at` / `updated_at` are left as the driver returned them (a `Date` on
 * PostgreSQL) and normalised to ISO strings by the domain response mapper.
 */
export interface NamecardUnitRecord {
    id: number;
    name_cn: string;
    name_ja: string | null;
    name_en: string | null;
    aliases: string | null;
    display_order: number;
    revision: number;
    created_at: string | Date;
    updated_at: string | Date;
    agencies: NamecardUnitAgencyRecord[];
    members: NamecardUnitMemberRecord[];
}

/** A unit's agency link joined with the agency label the picker renders. */
export interface NamecardUnitAgencyRecord {
    id: number;
    code: string;
    name_cn: string;
    color: string;
}

/**
 * A unit's member link joined with the character it points at. A character that
 * was soft-deleted keeps its link row but disappears from this projection, so a
 * unit never expands into a character the catalog no longer offers.
 */
export interface NamecardUnitMemberRecord {
    character_id: number;
    name_cn: string;
    name_ja: string | null;
    name_en: string | null;
    category: NamecardCharacterCategory;
}

/**
 * Every list filter is optional; `null` means "do not filter". `query` is the
 * already-escaped and wildcard-wrapped `ILIKE` term produced by the domain.
 * `agencyId` matches units that include the agency, not units filed under only
 * that agency.
 */
export interface NamecardUnitListFilter {
    query: string | null;
    memberIds: number[];
    agencyId: number | null;
}

export interface NamecardUnitListInput extends NamecardUnitListFilter {
    limit: number;
    offset: number;
}

export interface NewNamecardUnitInput {
    nameCn: string;
    nameJa: string | null;
    nameEn: string | null;
    aliases: string | null;
    displayOrder: number;
    /** Stored in array order; each list must already be unique and non-empty. */
    agencyIds: number[];
    memberIds: number[];
    /** Backoffice account id recorded as `created_by` / `updated_by`. */
    actorId: number;
}

export interface UpdateNamecardUnitInput extends NewNamecardUnitInput {
    id: number;
    revision: number;
}

export type NamecardUnitCreateResult =
    | { status: 'created'; unit: NamecardUnitRecord }
    | { status: 'duplicate' }
    | { status: 'agency-not-found'; missingIds: number[] }
    | { status: 'member-not-found'; missingIds: number[] };

export type NamecardUnitUpdateResult =
    | { status: 'updated'; unit: NamecardUnitRecord }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' }
    | { status: 'duplicate' }
    | { status: 'agency-not-found'; missingIds: number[] }
    | { status: 'member-not-found'; missingIds: number[] };

export type NamecardUnitDeleteResult =
    | { status: 'deleted'; id: number }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' };

export interface NamecardUnitRepository {
    listNamecardUnits(
        input: NamecardUnitListInput,
    ): Promise<NamecardUnitRecord[]>;
    countNamecardUnits(filter: NamecardUnitListFilter): Promise<number>;
    /**
     * Every live unit with its agencies and members, without pagination. The
     * public picker offers units as search shortcuts, so the whole catalog is
     * read in one page; relations are still batched, never N+1.
     */
    listNamecardUnitCatalog(): Promise<NamecardUnitRecord[]>;
    createNamecardUnit(
        input: NewNamecardUnitInput,
    ): Promise<NamecardUnitCreateResult>;
    updateNamecardUnit(
        input: UpdateNamecardUnitInput,
    ): Promise<NamecardUnitUpdateResult>;
    deleteNamecardUnit(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardUnitDeleteResult>;
}
