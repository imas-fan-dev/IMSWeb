export interface AgencyRecord {
    id: number;
    code: string;
    name_cn: string;
    color: string;
}

export interface IdolRecord {
    id: number;
    agency_id: number;
    name_cn: string;
    folder_name: string;
    color: string | null;
}

export interface IdolWithAgencyRecord extends IdolRecord {
    agency_code: string;
    agency_name: string;
    agency_color: string;
}

export interface StoryRecord {
    id: number;
    idol_id: number;
    category: string;
    card_name: string;
    up_name: string;
    video_title: string;
    url: string;
    subtitle: string | null;
    image_file: string | null;
}

export interface NewStoryInput {
    agencyCode: string;
    idolId: number;
    category: string;
    cardName: string;
    upName: string;
    videoTitle: string;
    url: string;
    subtitle: string;
    imageFile: string | null;
}

export interface UpdateStoryInput extends NewStoryInput {
    id: number;
    imageFile: string | null;
}

export interface StoryRepository {
    initialize(): Promise<void>;
    close(): Promise<void>;
    listThemeColors(): Promise<Record<string, string>>;
    listAgencies(): Promise<AgencyRecord[]>;
    listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]>;
    findAgencyByName(name: string): Promise<AgencyRecord | null>;
    findAgencyByCode(code: string): Promise<AgencyRecord | null>;
    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null>;
    listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]>;
    sampleStory(agencyCode: string, categories: readonly string[]): Promise<(StoryRecord & {
        idol_name: string;
        agency_name: string;
    }) | null>;
    insertStoryReturningId(input: NewStoryInput): Promise<number>;
    setStoryImage(agencyCode: string, id: number, imageFile: string): Promise<void>;
    findFirstStoryByCard(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord | null>;
    updateStory(input: UpdateStoryInput): Promise<void>;
    updateStoryAndRenameGroup(input: {
        story: UpdateStoryInput;
        rename?: {
            oldCategory: string;
            oldCardName: string;
            category: string;
            cardName: string;
            subtitle: string;
        };
    }): Promise<void>;
    renameStoryGroup(input: {
        agencyCode: string;
        idolId: number;
        oldCategory: string;
        oldCardName: string;
        category: string;
        cardName: string;
        subtitle: string;
        excludeId: number;
    }): Promise<void>;
    listStoryGroupForDelete(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord[]>;
    deleteStoryGroup(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<void>;
    listCategoryImages(
        agencyCode: string,
        idolId: number,
        category: string
    ): Promise<Array<{ image_file: string | null }>>;
    deleteCategory(agencyCode: string, idolId: number, category: string): Promise<void>;
}
