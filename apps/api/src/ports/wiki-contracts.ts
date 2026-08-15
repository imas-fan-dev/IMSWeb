export type WikiContractEntryKind = 'idol' | 'unit' | 'story' | 'other';
export type WikiContractStoryEntrySubtype = 'main' | 'event' | 'special' | 'other';

export interface WikiContractImageTransform {
    fit: 'contain' | 'cover';
    focalX: number;
    focalY: number;
    zoom: number;
    rotation: 0 | 90 | 180 | 270;
}

export interface WikiContractAgencySummary {
    id: number;
    code: string;
    name: string;
    color: string;
}

export interface WikiPublicAgencyContract extends WikiContractAgencySummary {
    bannerTitle: string;
    iconUrl: string | null;
    idolCount: number;
    entryCount: number;
    imageTransform: WikiContractImageTransform;
}

export interface WikiPublicIdolContract {
    id: number;
    name: string;
    folderName: string;
    color: string | null;
    wikiUrl: string | null;
    imageUrl: string;
    imageFit: 'contain' | 'cover';
    imageTransform: WikiContractImageTransform;
    textColor: string;
    entryKind: WikiContractEntryKind;
    entrySubtype: WikiContractStoryEntrySubtype | null;
}

export interface WikiPublicSearchEntryContract {
    id: number;
    name: string;
    agencyId: number;
    agencyCode: string;
    agencyName: string;
    agencyColor: string;
    entryKind: WikiContractEntryKind;
    entrySubtype: WikiContractStoryEntrySubtype | null;
}

export interface WikiPublicGroupContract {
    id: number;
    code: string;
    name: string;
    color: string;
    iconUrl: string | null;
    imageTransform: WikiContractImageTransform;
    idols: WikiPublicIdolContract[];
}

export interface WikiPublicCatalogContract {
    status: 'success';
    agencies: WikiPublicAgencyContract[];
    searchEntries: WikiPublicSearchEntryContract[];
    selection: {
        agency: WikiPublicAgencyContract;
        layoutRevision: number;
        groups: WikiPublicGroupContract[];
        ungroupedIdols: WikiPublicIdolContract[];
    } | null;
}

export interface WikiPublicStoryLinkContract {
    id: number;
    up: string;
    title: string;
    url: string;
    contentType: string;
    contentTypeIcon: string;
    sourcePlatform: string;
}

export interface WikiPublicStoryCardContract {
    id: number;
    name: string;
    img: string;
    subtitle: string;
    imageTransform: WikiContractImageTransform;
    links: WikiPublicStoryLinkContract[];
}

export interface WikiPublicStoriesContract {
    status: 'success';
    agency: WikiContractAgencySummary;
    idol: WikiPublicIdolContract;
    categories: Array<{
        name: string;
        cards: WikiPublicStoryCardContract[];
    }>;
}

export interface WikiAdminIdolContract {
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
    imageTransform: WikiContractImageTransform;
    mediaRevision: number;
    entryKind: WikiContractEntryKind;
    entrySubtype: WikiContractStoryEntrySubtype | null;
}

export interface WikiAdminGroupContract {
    id: number;
    code: string;
    name: string;
    color: string;
    displayOrder: number;
    isFallback: boolean;
    iconUrl: string | null;
    imageTransform: WikiContractImageTransform;
    mediaRevision: number;
    idolIds: number[];
    idols: WikiAdminIdolContract[];
}

export interface WikiAdminAgencyContract {
    id: number;
    code: string;
    name: string;
    color: string;
    wikiEnabled: boolean;
    bannerTitle: string;
    displayOrder: number;
    layoutRevision: number;
    iconUrl: string | null;
    imageTransform: WikiContractImageTransform;
    mediaRevision: number;
    idols: WikiAdminIdolContract[];
    groups: WikiAdminGroupContract[];
}

export interface WikiAdminCatalogContract {
    status: 'success';
    agencies: WikiAdminAgencyContract[];
}

export interface WikiCategoryContract {
    id: number;
    name: string;
    storageSlug: string;
    displayOrder: number;
    showWhenEmpty: boolean;
    backgroundEligible: boolean;
    revision: number;
}

export interface WikiCatalogOptionContract {
    id: number;
    name: string;
    description: string;
    displayOrder: number;
    isActive: boolean;
    revision: number;
}

export interface WikiStoryContentTypeContract extends WikiCatalogOptionContract {
    iconName: string;
}

export interface WikiStorySourcePlatformContract extends WikiCatalogOptionContract {
    homepageUrl: string;
}

export interface WikiAdminStoryCardContract {
    cardId: number;
    category: string;
    cardName: string;
    subtitle: string;
    imageFile: string | null;
    coverAssetId?: number | null;
    coverAssetName?: string | null;
    imageUrl: string;
    imageTransform: WikiContractImageTransform;
    mediaRevision: number;
    revision: number;
}

export interface WikiAdminStoryContract extends WikiAdminStoryCardContract {
    id: number;
    upName: string;
    videoTitle: string;
    url: string;
    contentTypeId: number;
    contentTypeName: string;
    sourcePlatformId: number;
    sourcePlatformName: string;
}

export interface WikiAdminStoriesContract {
    status: 'success';
    agency: WikiContractAgencySummary;
    idol: WikiAdminIdolContract;
    categories: WikiCategoryContract[];
    contentTypes: WikiStoryContentTypeContract[];
    sourcePlatforms: WikiStorySourcePlatformContract[];
    cards: WikiAdminStoryCardContract[];
    stories: WikiAdminStoryContract[];
}
