import type { AppEnvironment } from '@/app';
import type {
    NamecardCollectionEntryParams,
    NamecardCollectionQuery,
    NamecardCollectionVisibilityRequest,
    NamecardExchangeCardParams,
    NamecardExchangeCommitRequest,
    NamecardExchangeHandleParams,
    NamecardExchangeHistoryQuery,
    NamecardExchangeIdParams,
    NamecardExchangeSlugParams,
    NamecardQuickCandidatesQuery,
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
/** 属主侧单卡分享链接：路径上只有名片编号，不需要请求体。 */
export type NamecardCardShareLinkContext = WithParams<NamecardExchangeCardParams>;
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
/** 候选读取带一个可选目标（uid / 主页 slug / 账号 ID）。 */
export type NamecardQuickSettingsContext = WithQuery<NamecardQuickCandidatesQuery>;
export type NamecardScanSessionContext = WithBody<NamecardScanSessionRequest>;
export type NamecardScanCommitContext = WithParamsBody<
    NamecardScanTokenParams,
    NamecardExchangeCommitRequest
>;
/** 名片册的查询参数由契约校验（分页 / 排序 / 搜索 / 筛选 / 两个开关）。 */
export type NamecardCollectionQueryContext = WithQuery<NamecardCollectionQuery>;
export type NamecardExchangeHistoryQueryContext =
    WithQuery<NamecardExchangeHistoryQuery>;
export type NamecardCollectionEntryContext = WithParamsBody<
    NamecardCollectionEntryParams,
    NamecardCollectionVisibilityRequest
>;
export type NamecardDecisionContext = WithParams<NamecardExchangeIdParams>;
/** 交换详情窗口：路径上只有交换 id。 */
export type NamecardExchangeDetailContext = WithParams<NamecardExchangeIdParams>;
