import type { Env, Handler, Input } from 'hono';
import type {
    WikiEntryKind,
    WikiImageTransform,
    WikiStoryCoverPresentationPolicy,
    WikiStoryEntrySubtype
} from '@/ports/repositories';
import type {
    WikiRandomBackground,
    WikiRandomIdol,
    WikiStoryCategory
} from '@/domains/wiki/models';

export type WikiRouteHandler<E extends Env, I extends Input = Input> = Handler<E, string, I>;
export type WikiBinaryResponse = Response;
export type WikiPlainTextResponse = Response;
export type WikiBinaryRouteHandler<
    E extends Env,
    I extends Input = Input
> = Handler<E, string, I, WikiBinaryResponse | Promise<WikiBinaryResponse>>;

export interface WikiErrorResponse {
    status: 'error';
    msg: string;
}

export interface WikiRevisionConflictResponse extends WikiErrorResponse {
    revision?: number;
    mediaRevision?: number;
    iconMediaRevision?: number;
    avatarMediaRevision?: number;
    layoutRevision?: number;
    currentName?: string;
}

export interface WikiMutationResponse {
    status: 'success';
}

export interface WikiTestResponse {
    status: 'ok';
}

export interface WikiImageResponse extends WikiMutationResponse {
    url: string;
    mediaRevision?: number;
    imageTransform?: WikiImageTransform;
}

export interface WikiAgencyMutationDTO {
    id: number;
    code: string;
    name: string;
    color: string;
    wikiEnabled: boolean;
    bannerTitle: string;
    displayOrder: number;
    layoutRevision: number;
    iconUrl: string | null;
    imageTransform: WikiImageTransform;
    mediaRevision: number;
}

export interface WikiGroupMutationDTO {
    id: number;
    agencyId: number;
    code: string;
    name: string;
    color: string;
    displayOrder: number;
    isFallback: boolean;
    iconUrl: string | null;
    imageTransform: WikiImageTransform;
    mediaRevision: number;
}

export interface WikiIdolMutationDTO {
    id: number;
    agencyId: number;
    name: string;
    folderName: string;
    color: string | null;
    wikiUrl: string | null;
    wikiEnabled: boolean;
    displayOrder: number;
    textColor: string;
    imageFit: 'cover' | 'contain';
    groupIds: number[];
    imageUrl: string;
    imageTransform: WikiImageTransform;
    mediaRevision: number;
    entryKind: WikiEntryKind;
    entrySubtype: WikiStoryEntrySubtype | null;
}

export interface WikiCategoryResponse {
    id: number;
    name: string;
    storageSlug: string;
    displayOrder: number;
    showWhenEmpty: boolean;
    backgroundEligible: boolean;
}

export interface WikiCatalogOptionResponse {
    id: number;
    name: string;
    description: string;
    displayOrder: number;
    isActive: boolean;
    revision: number;
    iconName?: string;
    homepageUrl?: string;
}

export interface WikiStoryCoverAssetResponse {
    id: number;
    agencyId: number;
    name: string;
    imageUrl: string;
    presentationPolicy: WikiStoryCoverPresentationPolicy;
    displayOrder: number;
    isActive: boolean;
    revision: number;
    usageCount: number;
}

export interface WikiCatalogAgencyResponse {
    id: number;
    code: string;
    name: string;
    color: string;
    bannerTitle?: string;
    iconUrl?: string | null;
    wikiEnabled?: boolean;
    displayOrder?: number;
    layoutRevision?: number;
    imageTransform?: WikiImageTransform;
    mediaRevision?: number;
}

export interface WikiCatalogIdolResponse {
    id: number;
    name: string;
    folderName?: string;
    color: string | null;
    wikiUrl?: string | null;
    imageUrl?: string;
    imageFit?: 'cover' | 'contain';
    imageTransform?: WikiImageTransform;
    textColor?: string;
    entryKind: WikiEntryKind;
    entrySubtype: WikiStoryEntrySubtype | null;
}

export interface WikiStoryListResponse extends WikiMutationResponse {
    agency: WikiCatalogAgencyResponse;
    idol: WikiCatalogIdolResponse;
    categories: WikiStoryCategory[];
}

export interface WikiBilibiliSuccessResponse extends WikiMutationResponse {
    title: string;
    up: string;
    std_url: string;
    cover_url: string;
}

export type WikiBilibiliResponse = WikiBilibiliSuccessResponse | WikiErrorResponse;

export interface WikiAgencyMutationResponse extends WikiMutationResponse {
    agency: WikiAgencyMutationDTO;
}

export interface WikiGroupMutationResponse extends WikiMutationResponse {
    group: WikiGroupMutationDTO;
}

export interface WikiIdolMutationResponse extends WikiMutationResponse {
    idol: WikiIdolMutationDTO;
}

export interface WikiIdolDeleteResponse extends WikiMutationResponse {
    softDeleted: { cards: number; stories: number };
}

export interface WikiCategoryMutationResponse extends WikiMutationResponse {
    category: WikiCategoryResponse;
}

export interface WikiStorySourceMutationResponse extends WikiMutationResponse {
    sourceCount: number;
    mediaRevision?: number;
}

export interface WikiStoryLinkDeleteResponse extends WikiMutationResponse {
    cardDeleted: boolean;
    mediaRevision: number;
}

export interface WikiStoryCardMutationResponse extends WikiMutationResponse {
    mediaRevision: number;
    imageFile: string | null;
    coverAssetId: number | null;
    imageTransform: WikiImageTransform;
}

export interface WikiLayoutMutationResponse extends WikiMutationResponse {
    layoutRevision: number;
}

export interface WikiStoryCatalogResponse extends WikiMutationResponse {
    contentTypes: WikiCatalogOptionResponse[];
    sourcePlatforms: WikiCatalogOptionResponse[];
}

export interface WikiStoryCatalogMutationResponse extends WikiMutationResponse {
    option: WikiCatalogOptionResponse;
}

export interface WikiStoryCoverAssetListResponse extends WikiMutationResponse {
    agency: { id: number; code: string; name: string };
    assets: WikiStoryCoverAssetResponse[];
}

export interface WikiStoryCoverAssetMutationResponse extends WikiMutationResponse {
    asset: WikiStoryCoverAssetResponse;
}

export interface WikiIdolMediaListResponse extends WikiMutationResponse {
    agencies: Array<{
        code: string;
        name: string;
        idols: Array<{
            name: string;
            imageUrl: string;
            imageFit: 'cover' | 'contain';
            source: 'object-storage' | 'none';
        }>;
    }>;
}

export interface WikiPublicCatalogAgencyResponse {
    id: number;
    code: string;
    name: string;
    color: string;
    bannerTitle: string;
    iconUrl: string | null;
    idolCount: number;
    entryCount: number;
    imageTransform: WikiImageTransform;
}

export interface WikiPublicCatalogSearchEntryResponse {
    id: number;
    name: string;
    agencyId: number;
    agencyCode: string;
    agencyName: string;
    agencyColor: string;
    entryKind: WikiEntryKind;
    entrySubtype: WikiStoryEntrySubtype | null;
}

export interface WikiPublicCatalogIdolResponse {
    id: number;
    name: string;
    folderName: string;
    color: string | null;
    wikiUrl: string | null;
    imageUrl: string;
    imageFit: 'cover' | 'contain';
    imageTransform: WikiImageTransform | undefined;
    textColor: string;
    entryKind: WikiEntryKind;
    entrySubtype: WikiStoryEntrySubtype | null;
}

export interface WikiPublicCatalogGroupResponse {
    id: number;
    code: string;
    name: string;
    color: string;
    iconUrl: string | null;
    imageTransform: WikiImageTransform;
    idols: WikiPublicCatalogIdolResponse[];
}

export interface WikiPublicCatalogResponse extends WikiMutationResponse {
    agencies: WikiPublicCatalogAgencyResponse[];
    searchEntries: WikiPublicCatalogSearchEntryResponse[];
    selection: {
        agency: WikiPublicCatalogAgencyResponse;
        layoutRevision: number;
        groups: WikiPublicCatalogGroupResponse[];
        ungroupedIdols: WikiPublicCatalogIdolResponse[];
    } | null;
}

export interface WikiAdminCatalogIdolResponse extends WikiIdolMutationDTO {
    groupIds: number[];
}

export interface WikiAdminCatalogGroupResponse
    extends Omit<WikiGroupMutationDTO, 'agencyId'> {
    idolIds: number[];
    idols: WikiAdminCatalogIdolResponse[];
}

export interface WikiAdminCatalogAgencyResponse extends WikiAgencyMutationDTO {
    idols: WikiAdminCatalogIdolResponse[];
    groups: WikiAdminCatalogGroupResponse[];
}

export interface WikiAdminCatalogResponse extends WikiMutationResponse {
    agencies: WikiAdminCatalogAgencyResponse[];
}

export interface WikiAdminStoryCardResponse {
    cardId: number;
    category: string;
    cardName: string;
    subtitle: string;
    imageFile: string | null;
    coverAssetId?: number | null;
    coverAssetName?: string | null;
    imageUrl: string;
    imageTransform: WikiImageTransform;
    mediaRevision: number;
}

export interface WikiAdminStorySourceResponse extends WikiAdminStoryCardResponse {
    id: number;
    upName: string;
    videoTitle: string;
    url: string;
    contentTypeId: number;
    contentTypeName: string;
    sourcePlatformId: number;
    sourcePlatformName: string;
}

export interface WikiAdminStoriesResponse extends WikiMutationResponse {
    agency: { id: number; code: string; name: string; color: string };
    idol: WikiIdolMutationDTO;
    categories: WikiCategoryResponse[];
    contentTypes: WikiCatalogOptionResponse[];
    sourcePlatforms: WikiCatalogOptionResponse[];
    cards: WikiAdminStoryCardResponse[];
    stories: WikiAdminStorySourceResponse[];
}

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
