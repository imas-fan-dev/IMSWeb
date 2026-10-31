import type { Context } from 'hono';
import {
    type NamecardUnitCreateRequest as NamecardUnitCreateRequestWire,
    type NamecardUnitDeleteQuery as NamecardUnitDeleteQueryWire,
    type NamecardUnitIdParams as NamecardUnitIdParamsWire,
    type NamecardUnitListQuery as NamecardUnitListQueryWire,
    type NamecardUnitUpdateRequest as NamecardUnitUpdateRequestWire
} from '@imsweb/contracts/fudaba/admin-units';
import {
    NAMECARD_UNIT_DEFAULT_PAGE_SIZE,
    NAMECARD_UNIT_MAX_PAGE_SIZE
} from '@imsweb/contracts/fudaba/runtime';
import type { AppEnvironment } from '@/app';
import { escapeLikePattern } from '@/domains/admin/platform-users/request';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { positiveInteger } from '@/utils/validation/number';
import { invalidRequest } from '@/utils/validation/request-data';

export interface NamecardUnitListQuery {
    /** Already wildcard-wrapped and LIKE-escaped; `null` means "match everything". */
    query: string | null;
    /** Every character the unit has to contain; empty means "do not filter". */
    memberIds: number[];
    agencyId: number | null;
    page: number;
    pageSize: number;
}

/** The writable columns plus the two ordered link sets, wire fields defaulted. */
export interface NamecardUnitWriteFields {
    nameCn: string;
    nameJa: string | null;
    nameEn: string | null;
    aliases: string | null;
    displayOrder: number;
    agencyIds: number[];
    memberIds: number[];
}

export interface NamecardUnitUpdateFields extends NamecardUnitWriteFields {
    revision: number;
}

export interface NamecardUnitIdParams {
    id: number;
}

export interface NamecardUnitDeleteParams {
    revision: number;
}

function writeFields(
    value: NamecardUnitCreateRequestWire | NamecardUnitUpdateRequestWire
): NamecardUnitWriteFields {
    return {
        nameCn: value.nameCn,
        nameJa: value.nameJa ?? null,
        nameEn: value.nameEn ?? null,
        aliases: value.aliases ?? null,
        displayOrder: value.displayOrder ?? 0,
        agencyIds: value.agencyIds,
        memberIds: value.memberIds
    };
}

/**
 * Query values arrive as strings; the contract only checks their shape, so
 * parsing, clamping and the `%term%` assembly happen here. `pageSize` is capped
 * at `NAMECARD_UNIT_MAX_PAGE_SIZE` and defaults when absent or unparsable.
 */
const MEMBER_FILTER_LIMIT = 20;

/** The list query sends ids as one comma-separated value; dedupe and cap them. */
function parseMemberIds(value: string | undefined): number[] {
    if (value === undefined) return [];
    const ids = value
        .split(',')
        .map((part) => positiveInteger(part))
        .filter((id): id is number => id !== null);
    return [...new Set(ids)].slice(0, MEMBER_FILTER_LIMIT);
}

export function normalizeNamecardUnitListQuery(
    value: NamecardUnitListQueryWire
): NamecardUnitListQuery {
    const agencyId =
        value.agencyId === undefined ? null : positiveInteger(value.agencyId);
    if (value.agencyId !== undefined && agencyId === null) {
        invalidRequest('企划 ID 无效');
    }
    const page = positiveInteger(value.page) ?? 1;
    const requestedPageSize =
        positiveInteger(value.pageSize) ?? NAMECARD_UNIT_DEFAULT_PAGE_SIZE;
    return {
        query:
            value.query === undefined
                ? null
                : `%${escapeLikePattern(value.query)}%`,
        memberIds: parseMemberIds(value.memberIds),
        agencyId,
        page,
        pageSize: Math.min(requestedPageSize, NAMECARD_UNIT_MAX_PAGE_SIZE)
    };
}

export function normalizeNamecardUnitCreateRequest(
    value: NamecardUnitCreateRequestWire
): NamecardUnitWriteFields {
    return writeFields(value);
}

export function normalizeNamecardUnitUpdateRequest(
    value: NamecardUnitUpdateRequestWire
): NamecardUnitUpdateFields {
    return { ...writeFields(value), revision: value.revision };
}

export function normalizeNamecardUnitIdParams(
    value: NamecardUnitIdParamsWire
): NamecardUnitIdParams {
    const id = positiveInteger(value.id);
    if (id === null) invalidRequest('名片组合 ID 无效');
    return { id };
}

export function normalizeNamecardUnitDeleteQuery(
    value: NamecardUnitDeleteQueryWire
): NamecardUnitDeleteParams {
    const revision = Number(value.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        invalidRequest('名片组合版本无效');
    }
    return { revision };
}

export type NamecardUnitListRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'query', NamecardUnitListQuery>
>;

export type NamecardUnitCreateRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', NamecardUnitWriteFields>
>;

export type NamecardUnitUpdateRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', NamecardUnitIdParams> &
        ValidatedRequestInput<'json', NamecardUnitUpdateFields>
>;

export type NamecardUnitDeleteRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', NamecardUnitIdParams> &
        ValidatedRequestInput<'query', NamecardUnitDeleteParams>
>;
