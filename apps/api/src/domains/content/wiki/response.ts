import type { Env, Handler, Input } from 'hono';
import type {
    WikiAdminAgencyContract,
    WikiAdminCatalogContract,
    WikiAdminGroupContract,
    WikiAdminIdolContract,
    WikiAdminStoriesContract,
    WikiAdminStoryCardContract,
    WikiAdminStoryContract,
    BilibiliParseResult,
    IdolMediaCatalog,
    WikiAgencyMutationResult,
    WikiCategory,
    WikiCategoryMutationResult,
    WikiEntityImageResult,
    WikiErrorResponse as ContractWikiErrorResponse,
    WikiGroupMutationResult,
    WikiIdolDeleteResult,
    WikiIdolMutationResult,
    WikiLayoutResult,
    WikiMutationResult,
    WikiRandomBackground,
    WikiRandomIdol,
    WikiRevisionConflictResponse as ContractWikiRevisionConflictResponse,
    WikiStoryCardMutationResult,
    WikiStoryContentType,
    WikiStoryContentTypeMutation,
    WikiStoryCoverAsset,
    WikiStoryCoverAssetMutation,
    WikiStoryCoverAssets,
    WikiStoryLinkDeleteResult,
    WikiStorySourceCatalog,
    WikiStorySourceMutationResult,
    WikiStorySourcePlatform,
    WikiStorySourcePlatformMutation,
    WikiTestResponse as ContractWikiTestResponse,
    WikiPublicAgencyContract,
    WikiPublicCatalogContract,
    WikiPublicGroupContract,
    WikiPublicIdolContract,
    WikiPublicSearchEntryContract,
    WikiPublicStoriesContract,
} from '@imsweb/contracts/wiki';

export type WikiRouteHandler<E extends Env, I extends Input = Input> = Handler<E, string, I>;
export type WikiBinaryResponse = Response;
export type WikiPlainTextResponse = Response;
export type WikiBinaryRouteHandler<
    E extends Env,
    I extends Input = Input
> = Handler<E, string, I, WikiBinaryResponse | Promise<WikiBinaryResponse>>;

export type WikiErrorResponse = ContractWikiErrorResponse;
export type WikiRevisionConflictResponse = ContractWikiRevisionConflictResponse;
export type WikiMutationResponse = WikiMutationResult;
export type WikiTestResponse = ContractWikiTestResponse;
export type WikiImageResponse = WikiEntityImageResult;
export type WikiAgencyMutationDTO = WikiAgencyMutationResult['agency'];
export type WikiGroupMutationDTO = WikiGroupMutationResult['group'];
export type WikiIdolMutationDTO = WikiIdolMutationResult['idol'];
export type WikiCategoryResponse = WikiCategory;
export type WikiCatalogOptionResponse = WikiStoryContentType | WikiStorySourcePlatform;
export type WikiStoryCoverAssetResponse = WikiStoryCoverAsset;
export type WikiStoryListResponse = WikiPublicStoriesContract;
export type WikiBilibiliSuccessResponse = BilibiliParseResult;
export type WikiBilibiliResponse = WikiBilibiliSuccessResponse | WikiErrorResponse;
export type WikiAgencyMutationResponse = WikiAgencyMutationResult;
export type WikiGroupMutationResponse = WikiGroupMutationResult;
export type WikiIdolMutationResponse = WikiIdolMutationResult;
export type WikiIdolDeleteResponse = WikiIdolDeleteResult;
export type WikiCategoryMutationResponse = WikiCategoryMutationResult;
export type WikiStorySourceMutationResponse = WikiStorySourceMutationResult;
export type WikiStoryLinkDeleteResponse = WikiStoryLinkDeleteResult;
export type WikiStoryCardMutationResponse = WikiStoryCardMutationResult;
export type WikiLayoutMutationResponse = WikiLayoutResult;
export type WikiStoryCatalogResponse = WikiStorySourceCatalog;
export type WikiStoryCatalogMutationResponse = WikiStoryContentTypeMutation | WikiStorySourcePlatformMutation;
export type WikiStoryCoverAssetListResponse = WikiStoryCoverAssets;
export type WikiStoryCoverAssetMutationResponse = WikiStoryCoverAssetMutation;
export type WikiIdolMediaListResponse = IdolMediaCatalog;

export type WikiPublicCatalogAgencyResponse = WikiPublicAgencyContract;
export type WikiPublicCatalogSearchEntryResponse = WikiPublicSearchEntryContract;
export type WikiPublicCatalogIdolResponse = WikiPublicIdolContract;
export type WikiPublicCatalogGroupResponse = WikiPublicGroupContract;
export type WikiPublicCatalogResponse = WikiPublicCatalogContract;
export type WikiAdminCatalogIdolResponse = WikiAdminIdolContract;
export type WikiAdminCatalogGroupResponse = WikiAdminGroupContract;
export type WikiAdminCatalogAgencyResponse = WikiAdminAgencyContract;
export type WikiAdminCatalogResponse = WikiAdminCatalogContract;
export type WikiAdminStoryCardResponse = WikiAdminStoryCardContract;
export type WikiAdminStorySourceResponse = WikiAdminStoryContract;
export type WikiAdminStoriesResponse = WikiAdminStoriesContract;

export type WikiJsonResponse =
    | WikiErrorResponse
    | WikiRevisionConflictResponse
    | WikiMutationResponse
    | WikiTestResponse
    | WikiImageResponse
    | WikiStoryListResponse
    | WikiBilibiliSuccessResponse
    | WikiAgencyMutationResponse
    | WikiGroupMutationResponse
    | WikiIdolMutationResponse
    | WikiIdolDeleteResponse
    | WikiCategoryMutationResponse
    | WikiStorySourceMutationResponse
    | WikiStoryLinkDeleteResponse
    | WikiStoryCardMutationResponse
    | WikiLayoutMutationResponse
    | WikiStoryCatalogResponse
    | WikiStoryCatalogMutationResponse
    | WikiStoryCoverAssetListResponse
    | WikiStoryCoverAssetMutationResponse
    | WikiIdolMediaListResponse
    | WikiPublicCatalogResponse
    | WikiAdminCatalogResponse
    | WikiAdminStoriesResponse
    | WikiRandomBackground
    | WikiRandomIdol;
