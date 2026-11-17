import type {
    AdminCatalog,
    AdminCatalogStoryTargetResponse,
    AdminCatalogBindingRequest,
    AdminCatalogCreateCharacterRequest,
    AdminCatalogDefaultProfileRequest,
    AdminCatalogGroupKindRequest,
    AdminCatalogMediaRequest,
    AdminCatalogProfile,
    AdminCatalogProfileRequest,
    CatalogBirthdays,
} from '@imsweb/contracts/catalog';

export type CatalogProfileRecord = Omit<AdminCatalogProfile, 'imageUrl'> & {
    imageObjectKey: string | null;
};
export type CatalogSnapshotRecord = Omit<
    AdminCatalog,
    'characters' | 'groups'
> & {
    characters: Array<
        Omit<AdminCatalog['characters'][number], 'profiles'> & {
            profiles: CatalogProfileRecord[];
        }
    >;
    groups: Array<
        Omit<AdminCatalog['groups'][number], 'profiles'> & {
            profiles: CatalogProfileRecord[];
        }
    >;
};

export interface CatalogRepository {
    listBirthdayProfiles(): Promise<BirthdayProfileRecord[]>;
    ensureCharacterStoryTarget(
        profileId: number,
    ): Promise<AdminCatalogStoryTargetResponse>;
    snapshot(): Promise<CatalogSnapshotRecord>;
    createCharacter(
        input: AdminCatalogCreateCharacterRequest,
        actorId: number,
    ): Promise<{ characterId: number; profileId: number }>;
    setDefaultProfile(input: AdminCatalogDefaultProfileRequest): Promise<void>;
    saveProfile(input: AdminCatalogProfileRequest): Promise<void>;
    saveBinding(input: AdminCatalogBindingRequest): Promise<void>;
    saveGroupKind(input: AdminCatalogGroupKindRequest): Promise<void>;
    findProfile(
        kind: 'character' | 'group',
        id: number,
    ): Promise<CatalogProfileRecord | null>;
    saveMedia(
        input: AdminCatalogMediaRequest,
        objectKey: string | null,
    ): Promise<string | null>;
    hasMediaReference(objectKey: string): Promise<boolean>;
    ownsWikiPresentation(kind: 'idol' | 'group', id: number): Promise<boolean>;
}

export interface BirthdayProfileRecord {
    characterId: number;
    profileId: number;
    projectId: number;
    defaultProfileId: number | null;
    name: string;
    agency: string;
    color: string | null;
    birthMonth: number | null;
    birthDay: number | null;
    category: string;
    isFallback: boolean;
    story: CatalogBirthdays['items'][number]['story'];
}
