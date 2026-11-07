import type { AppEnvironment } from '@/app';
import type {
    NamecardCollectionEntryParams,
    NamecardCollectionVisibilityRequest,
    NamecardExchangeCardParams,
    NamecardExchangeCommitRequest,
    NamecardExchangeHandleParams,
    NamecardExchangeIdParams,
    NamecardExchangeSlugParams,
    NamecardQuickSelection,
    NamecardScanSessionRequest,
    NamecardScanTokenParams,
} from '@imsweb/contracts/namecards';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import type { Context } from 'hono';

/** 一个 handler 可能同时校验路径参数、查询串与请求体，上下文按需拼装。 */
type WithParams<P> = Context<AppEnvironment, string, ValidatedRequestInput<'param', P>>;
type WithBody<B> = Context<AppEnvironment, string, ValidatedRequestInput<'json', B>>;
type WithQuery<Q> = Context<AppEnvironment, string, ValidatedRequestInput<'query', Q>>;
type WithParamsBody<P, B> = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', P> & ValidatedRequestInput<'json', B>
>;

export type NamecardShareContext = WithParams<NamecardExchangeSlugParams>;
export type NamecardShareCommitContext = WithParamsBody<
    NamecardExchangeSlugParams,
    NamecardExchangeCommitRequest
>;
export type NamecardRequestContext = WithParamsBody<
    NamecardExchangeCardParams,
    NamecardExchangeCommitRequest
>;
export type NamecardQuickContext = WithParams<NamecardExchangeHandleParams>;
export type NamecardQuickCommitContext = WithParamsBody<
    NamecardExchangeHandleParams,
    NamecardExchangeCommitRequest
>;
export type NamecardQuickSelectionContext = WithBody<NamecardQuickSelection>;
export type NamecardScanSessionContext = WithBody<NamecardScanSessionRequest>;
export type NamecardScanCommitContext = WithParamsBody<
    NamecardScanTokenParams,
    NamecardExchangeCommitRequest
>;
/** 名片册与交换记录共用一套页码参数。 */
export interface NamecardCollectionQuery {
    page?: number;
    size?: number;
}

export type NamecardCollectionQueryContext = WithQuery<NamecardCollectionQuery>;
export type NamecardCollectionEntryContext = WithParamsBody<
    NamecardCollectionEntryParams,
    NamecardCollectionVisibilityRequest
>;
export type NamecardDecisionContext = WithParams<NamecardExchangeIdParams>;
