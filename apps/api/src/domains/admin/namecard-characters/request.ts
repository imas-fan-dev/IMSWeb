import type { Context } from 'hono';
import {
    type NamecardCharacterCategory,
    type NamecardCharacterCreateRequest as NamecardCharacterCreateRequestWire,
    type NamecardCharacterDeleteQuery as NamecardCharacterDeleteQueryWire,
    type NamecardCharacterIdParams as NamecardCharacterIdParamsWire,
    type NamecardCharacterListQuery as NamecardCharacterListQueryWire,
    type NamecardCharacterUpdateRequest as NamecardCharacterUpdateRequestWire
} from '@imsweb/contracts/fudaba/admin-characters';
import {
    NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE,
    NAMECARD_CHARACTER_MAX_PAGE_SIZE
} from '@imsweb/contracts/fudaba/runtime';
import type { AppEnvironment } from '@/app';
import { escapeLikePattern } from '@/domains/admin/platform-users/request';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { positiveInteger } from '@/utils/validation/number';
import { invalidRequest } from '@/utils/validation/request-data';

export interface NamecardCharacterListQuery {
    /** Already wildcard-wrapped and LIKE-escaped; `null` means "match everything". */
    query: string | null;
    agencyId: number | null;
    category: NamecardCharacterCategory | null;
    page: number;
    pageSize: number;
}

/** The writable columns, with the optional wire fields defaulted. */
export interface NamecardCharacterWriteFields {
    agencyId: number;
    category: NamecardCharacterCategory;
    nameCn: string;
    nameJa: string | null;
    nameEn: string | null;
    aliases: string | null;
    displayOrder: number;
    /**
     * `null` means "not provided": a create defaults it to `false`, an update
     * leaves the stored value untouched.
     */
    isFallback: boolean | null;
}

export interface NamecardCharacterCreateFields
    extends Omit<NamecardCharacterWriteFields, 'isFallback'> {
    isFallback: boolean;
}

export interface NamecardCharacterUpdateFields extends NamecardCharacterWriteFields {
    revision: number;
}

export interface NamecardCharacterIdParams {
    id: number;
}

export interface NamecardCharacterDeleteParams {
    revision: number;
}

function writeFields(
    value: NamecardCharacterCreateRequestWire | NamecardCharacterUpdateRequestWire
): NamecardCharacterWriteFields {
    return {
        agencyId: value.agencyId,
        category: value.category,
        nameCn: value.nameCn,
        nameJa: value.nameJa ?? null,
        nameEn: value.nameEn ?? null,
        aliases: value.aliases ?? null,
        displayOrder: value.displayOrder ?? 0,
        isFallback: value.isFallback ?? null
    };
}

/**
 * Query values arrive as strings; the contract only checks their shape, so
 * parsing, clamping and the `%term%` assembly happen here. `pageSize` is capped
 * at `NAMECARD_CHARACTER_MAX_PAGE_SIZE` and defaults when absent or unparsable.
 */
export function normalizeNamecardCharacterListQuery(
    value: NamecardCharacterListQueryWire
): NamecardCharacterListQuery {
    const agencyId =
        value.agencyId === undefined ? null : positiveInteger(value.agencyId);
    if (value.agencyId !== undefined && agencyId === null) {
        invalidRequest('企划 ID 无效');
    }
    const page = positiveInteger(value.page) ?? 1;
    const requestedPageSize =
        positiveInteger(value.pageSize) ?? NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE;
    return {
        query:
            value.query === undefined
                ? null
                : `%${escapeLikePattern(value.query)}%`,
        agencyId,
        category: value.category ?? null,
        page,
        pageSize: Math.min(requestedPageSize, NAMECARD_CHARACTER_MAX_PAGE_SIZE)
    };
}

export function normalizeNamecardCharacterCreateRequest(
    value: NamecardCharacterCreateRequestWire
): NamecardCharacterCreateFields {
    return { ...writeFields(value), isFallback: value.isFallback ?? false };
}

export function normalizeNamecardCharacterUpdateRequest(
    value: NamecardCharacterUpdateRequestWire
): NamecardCharacterUpdateFields {
    return { ...writeFields(value), revision: value.revision };
}

export function normalizeNamecardCharacterIdParams(
    value: NamecardCharacterIdParamsWire
): NamecardCharacterIdParams {
    const id = positiveInteger(value.id);
    if (id === null) invalidRequest('名片角色 ID 无效');
    return { id };
}

export function normalizeNamecardCharacterDeleteQuery(
    value: NamecardCharacterDeleteQueryWire
): NamecardCharacterDeleteParams {
    const revision = Number(value.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        invalidRequest('名片角色版本无效');
    }
    return { revision };
}

export type NamecardCharacterListRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'query', NamecardCharacterListQuery>
>;

export type NamecardCharacterCreateRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', NamecardCharacterCreateFields>
>;

export type NamecardCharacterUpdateRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', NamecardCharacterIdParams> &
        ValidatedRequestInput<'json', NamecardCharacterUpdateFields>
>;

export type NamecardCharacterDeleteRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', NamecardCharacterIdParams> &
        ValidatedRequestInput<'query', NamecardCharacterDeleteParams>
>;
