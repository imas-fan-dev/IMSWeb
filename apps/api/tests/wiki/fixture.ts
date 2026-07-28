import { createHonoApp } from '@/app';
import { HmacTokenService } from '@/infra/security/hmac/token-service';
import type { ImageInfo, ImageProcessor } from '@/ports/media';
import type { ObjectStorage, PutObjectOptions, StoredObject } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import type {
    AgencyRecord,
    IdolRecord,
    IdolWithAgencyRecord,
    NewStoryInput,
    StoryRecord,
    StoryRepository,
    UpdateStoryInput,
    WikiCategoryRecord,
    WikiGroupMemberRecord,
    WikiGroupRecord,
    WikiLayoutInput
} from '@/ports/repositories';
import type { ParsedUpload, UploadParser } from '@/ports/http';

const AGENCY_BASE = [
    { id: 1, code: '765', name_cn: '765PRO', color: '#f34f6d' },
    { id: 2, code: '876', name_cn: '876PRO', color: '#656a75' },
    { id: 3, code: 'cg', name_cn: '灰姑娘女孩', color: '#2681c8' },
    { id: 4, code: 'ml', name_cn: '百万现场', color: '#ffc30b' },
    { id: 5, code: 'sidem', name_cn: 'SideM', color: '#0fbe94' },
    { id: 6, code: 'sc', name_cn: '闪耀色彩', color: '#8dbbff' },
    { id: 7, code: 'gk', name_cn: '学园偶像大师', color: '#f39800' }
] as const;

export const AGENCIES: AgencyRecord[] = AGENCY_BASE.map((agency, index) => ({
    ...agency,
    wiki_enabled: true,
    display_order: index,
    banner_title: `${agency.name_cn} Banner`,
    icon_object_key: null,
    fallback_artwork_object_key: null,
    layout_revision: 0
}));

const IDOL_NAMES = ['天海春香', '日高爱', '岛村卯月', '春日未来', '天道辉', '樱木真乃', '花海咲季'];

export const IDOLS: IdolWithAgencyRecord[] = AGENCIES.map((agency, index) => ({
    id: index + 1,
    agency_id: agency.id,
    agency_code: agency.code,
    agency_name: agency.name_cn,
    agency_color: agency.color,
    name_cn: IDOL_NAMES[index]!,
    folder_name: `${agency.code}_idol`,
    color: agency.color,
    wiki_enabled: true,
    display_order: 0,
    text_color: '#ffffff',
    avatar_object_key: null,
    avatar_fit: 'cover'
}));

const GROUPS: WikiGroupRecord[] = AGENCIES.map((agency, index) => ({
    id: index + 1,
    agency_id: agency.id,
    code: `${agency.code}-main`,
    name: `${agency.name_cn} Main`,
    color: agency.color,
    icon_object_key: null,
    display_order: 0,
    is_fallback: false
}));

const MEMBERS: WikiGroupMemberRecord[] = IDOLS.map((idol) => ({
    agency_id: idol.agency_id,
    group_id: idol.agency_id,
    idol_id: idol.id,
    display_order: 0
}));

function cloneStory(row: StoryRecord): StoryRecord {
    return { ...row };
}

export class MemoryStoryRepository implements StoryRepository {
    agencies = AGENCIES.map((row) => ({ ...row }));
    idols = IDOLS.map((row) => ({ ...row }));
    groups = GROUPS.map((row) => ({ ...row }));
    members = MEMBERS.map((row) => ({ ...row }));
    categories: Array<WikiCategoryRecord & { idol_id: number }> = IDOLS.map((idol) => ({
        id: idol.id,
        agency_id: idol.agency_id,
        idol_id: idol.id,
        name: idol.agency_code === 'sc' ? 'enzaP卡' : '未分类剧情',
        storage_slug: idol.agency_code === 'sc' ? 'enza_pcard' : 'other',
        background_eligible: idol.agency_code === 'sc',
        display_order: 0,
        show_when_empty: true
    }));
    stories: StoryRecord[] = [];
    samples = new Map<string, (StoryRecord & { idol_name: string; agency_name: string }) | null>();
    nextId = 1;
    failNextInsert = false;
    failNextUpdate = false;
    failNextDeleteStory = false;
    failNextDeleteCategory = false;

    async initialize() {}
    async close() {}
    async listThemeColors() { return {}; }
    async listAgencies() { return this.agencies.map((row) => ({ ...row })); }
    async listIdolsWithAgencies() { return this.idols.map((row) => ({ ...row })); }
    async listWikiGroups(agencyId?: number) {
        return this.groups.filter((row) => agencyId === undefined || row.agency_id === agencyId)
            .map((row) => ({ ...row }));
    }
    async findWikiGroupById(id: number) {
        return this.groups.find((row) => row.id === id) ?? null;
    }
    async listWikiGroupMembers(agencyId?: number) {
        return this.members.filter((row) => agencyId === undefined || row.agency_id === agencyId)
            .map((row) => ({ ...row }));
    }
    async listWikiCategories(agencyId: number, idolId: number) {
        return this.categories.filter((row) =>
            row.agency_id === agencyId && row.idol_id === idolId
        ).map(({ idol_id: _idolId, ...row }) => ({ ...row }));
    }
    async findAgencyByName(name: string) {
        return this.agencies.find((row) => row.name_cn === name) ?? null;
    }
    async findAgencyByCode(code: string) {
        return this.agencies.find((row) => row.code === code) ?? null;
    }
    async findAgencyById(id: number) {
        return this.agencies.find((row) => row.id === id) ?? null;
    }
    async findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null> {
        const row = this.idols.find((candidate) => candidate.agency_id === agencyId && candidate.name_cn === idolName);
        if (!row) return null;
        const { agency_code: _code, agency_name: _name, agency_color: _color, ...idol } = row;
        return { ...idol };
    }
    async findIdolById(id: number): Promise<IdolRecord | null> {
        const row = this.idols.find((candidate) => candidate.id === id);
        if (!row) return null;
        const { agency_code: _code, agency_name: _name, agency_color: _color, ...idol } = row;
        return { ...idol };
    }
    async setAgencyIconObjectKey(agencyId: number, objectKey: string | null) {
        const agency = this.agencies.find((row) => row.id === agencyId);
        if (agency) agency.icon_object_key = objectKey;
    }
    async setIdolAvatarObjectKey(idolId: number, objectKey: string | null) {
        const idol = this.idols.find((row) => row.id === idolId);
        if (idol) idol.avatar_object_key = objectKey;
    }
    async ensureWikiCategory(agencyId: number, idolId: number, name: string, storageSlug: string) {
        let category = this.categories.find((row) =>
            row.agency_id === agencyId && row.idol_id === idolId && row.name === name
        );
        if (!category) {
            category = {
                id: Math.max(0, ...this.categories.map((row) => row.id)) + 1,
                agency_id: agencyId,
                idol_id: idolId,
                name,
                storage_slug: storageSlug,
                background_eligible: false,
                display_order: this.categories.filter((row) => row.idol_id === idolId).length,
                show_when_empty: true
            };
            this.categories.push(category);
        }
        const { idol_id: _idolId, ...record } = category;
        return { ...record };
    }
    async deleteWikiCategoryAssociation(agencyId: number, idolId: number, name: string) {
        const category = (await this.listWikiCategories(agencyId, idolId))
            .find((row) => row.name === name) ?? null;
        this.categories = this.categories.filter((row) =>
            !(row.agency_id === agencyId && row.idol_id === idolId && row.name === name)
        );
        return category;
    }
    async saveWikiLayout(input: WikiLayoutInput) {
        const agency = this.agencies.find((row) => row.id === input.agencyId);
        if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
        if (agency.layout_revision !== input.expectedRevision) {
            return { status: 'conflict' as const, revision: agency.layout_revision };
        }
        this.members = this.members.filter((row) => row.agency_id !== input.agencyId);
        for (const group of input.groups) {
            group.idolIds.forEach((idolId, displayOrder) => this.members.push({
                agency_id: input.agencyId,
                group_id: group.id,
                idol_id: idolId,
                display_order: displayOrder
            }));
        }
        agency.layout_revision += 1;
        return { status: 'saved' as const, revision: agency.layout_revision };
    }
    async listStories(agencyCode: string, idolId: number) {
        const agencyIds = new Set(this.agencies.filter((row) => row.code === agencyCode).map((row) => row.id));
        const idolIds = new Set(this.idols.filter((row) => agencyIds.has(row.agency_id)).map((row) => row.id));
        return this.stories.filter((row) => row.idol_id === idolId && idolIds.has(row.idol_id)).map(cloneStory);
    }
    async sampleStory(agencyCode: string, _categories: readonly string[]) {
        return this.samples.get(agencyCode) ?? null;
    }
    async sampleWikiBackground() {
        for (const [agencyCode, story] of this.samples) {
            if (!story) continue;
            const agency = this.agencies.find((row) => row.code === agencyCode);
            const idol = this.idols.find((row) => row.id === story.idol_id);
            if (agency && idol) {
                return {
                    ...story,
                    agency_id: agency.id,
                    agency_code: agency.code,
                    agency_name: agency.name_cn,
                    idol_name: idol.name_cn,
                    idol_folder_name: idol.folder_name
                };
            }
        }
        return null;
    }
    async insertStoryReturningId(input: NewStoryInput) {
        if (this.failNextInsert) {
            this.failNextInsert = false;
            throw new Error('injected insert commit failure');
        }
        const id = this.nextId++;
        this.stories.push({
            id,
            idol_id: input.idolId,
            category: input.category,
            card_name: input.cardName,
            up_name: input.upName,
            video_title: input.videoTitle,
            url: input.url,
            subtitle: input.subtitle,
            image_file: input.imageFile
        });
        return id;
    }
    async setStoryImage(_agencyCode: string, id: number, imageFile: string) {
        const row = this.stories.find((candidate) => candidate.id === id);
        if (row) row.image_file = imageFile;
    }
    async findFirstStoryByCard(_agencyCode: string, idolId: number, category: string, cardName: string) {
        const row = this.stories.find((candidate) =>
            candidate.idol_id === idolId && candidate.category === category && candidate.card_name === cardName
        );
        return row ? cloneStory(row) : null;
    }
    async findStoryById(_agencyCode: string, idolId: number, id: number) {
        const row = this.stories.find((candidate) =>
            candidate.idol_id === idolId && candidate.id === id
        );
        return row ? cloneStory(row) : null;
    }
    async updateStory(input: UpdateStoryInput) {
        await this.applyUpdate(input);
    }
    async updateStoryAndRenameGroup(input: {
        story: UpdateStoryInput;
        rename?: {
            oldCategory: string;
            oldCardName: string;
            category: string;
            cardName: string;
            subtitle: string;
        };
    }) {
        if (this.failNextUpdate) {
            this.failNextUpdate = false;
            throw new Error('injected update commit failure');
        }
        const existing = this.stories.find((row) => row.id === input.story.id);
        if (!existing) throw new Error('story not found');
        const next = { ...existing };
        this.assignUpdate(next, input.story);
        const renamed = input.rename
            ? this.stories
                .filter((row) => row.id !== input.story.id && row.idol_id === input.story.idolId &&
                    row.category === input.rename!.oldCategory && row.card_name === input.rename!.oldCardName)
                .map((row) => ({ row, next: {
                    ...row,
                    category: input.rename!.category,
                    card_name: input.rename!.cardName,
                    subtitle: input.rename!.subtitle
                } }))
            : [];
        Object.assign(existing, next);
        for (const item of renamed) Object.assign(item.row, item.next);
    }
    async renameStoryGroup(input: {
        agencyCode: string;
        idolId: number;
        oldCategory: string;
        oldCardName: string;
        category: string;
        cardName: string;
        subtitle: string;
        excludeId: number;
    }) {
        for (const row of this.stories) {
            if (row.id !== input.excludeId && row.idol_id === input.idolId &&
                row.category === input.oldCategory && row.card_name === input.oldCardName) {
                row.category = input.category;
                row.card_name = input.cardName;
                row.subtitle = input.subtitle;
            }
        }
    }
    async listStoryGroupForDelete(_agencyCode: string, idolId: number, category: string, cardName: string) {
        return this.stories.filter((row) =>
            row.idol_id === idolId && row.category === category && row.card_name === cardName
        ).map(cloneStory);
    }
    async deleteStoryGroup(_agencyCode: string, idolId: number, category: string, cardName: string) {
        if (this.failNextDeleteStory) {
            this.failNextDeleteStory = false;
            throw new Error('injected delete commit failure');
        }
        this.stories = this.stories.filter((row) =>
            !(row.idol_id === idolId && row.category === category && row.card_name === cardName)
        );
    }
    async listCategoryImages(_agencyCode: string, idolId: number, category: string) {
        return this.stories.filter((row) => row.idol_id === idolId && row.category === category)
            .map((row) => ({ image_file: row.image_file }));
    }
    async deleteCategory(_agencyCode: string, idolId: number, category: string) {
        if (this.failNextDeleteCategory) {
            this.failNextDeleteCategory = false;
            throw new Error('injected category commit failure');
        }
        this.stories = this.stories.filter((row) => !(row.idol_id === idolId && row.category === category));
    }

    seedStory(input: Partial<StoryRecord> & Pick<StoryRecord, 'idol_id' | 'category' | 'card_name'>) {
        const row: StoryRecord = {
            id: input.id ?? this.nextId++,
            idol_id: input.idol_id,
            category: input.category,
            card_name: input.card_name,
            up_name: input.up_name ?? 'fixture-up',
            video_title: input.video_title ?? 'fixture-title',
            url: input.url ?? 'https://www.bilibili.com/video/BV1xx411c7mD',
            subtitle: input.subtitle ?? '',
            image_file: input.image_file ?? null
        };
        this.nextId = Math.max(this.nextId, row.id + 1);
        this.stories.push(row);
        return row;
    }

    addAgencyWithIdol(agency: AgencyRecord, idol: IdolWithAgencyRecord) {
        this.agencies.push({ ...agency });
        this.idols.push({ ...idol });
    }

    private async applyUpdate(input: UpdateStoryInput) {
        if (this.failNextUpdate) {
            this.failNextUpdate = false;
            throw new Error('injected update commit failure');
        }
        const row = this.stories.find((candidate) => candidate.id === input.id);
        if (!row) throw new Error('story not found');
        this.assignUpdate(row, input);
    }

    private assignUpdate(row: StoryRecord, input: UpdateStoryInput) {
        row.idol_id = input.idolId;
        row.category = input.category;
        row.card_name = input.cardName;
        row.up_name = input.upName;
        row.video_title = input.videoTitle;
        row.url = input.url;
        row.subtitle = input.subtitle;
        row.image_file = input.imageFile;
    }
}

function stored(body: Uint8Array, contentType = 'application/octet-stream'): StoredObject {
    return {
        body: Uint8Array.from(body),
        size: body.byteLength,
        contentType,
        etag: `"fixture-${body.byteLength}"`,
        uploadedAt: new Date('2026-07-21T00:00:00Z')
    };
}

export class MemoryObjectStorage implements ObjectStorage {
    objects = new Map<string, StoredObject>();
    gets: string[] = [];
    puts: string[] = [];
    deletes: string[] = [];
    copies: Array<{ source: string; destination: string }> = [];
    lists: string[] = [];
    deletedPrefixes: string[] = [];
    failNextPutAfterWrite = false;
    failDeleteKeys = new Set<string>();
    publicReadUrlBase: string | null = null;
    publicReads: string[] = [];

    async get(key: string) {
        this.gets.push(key);
        const value = this.objects.get(key);
        return value ? { ...value, body: Uint8Array.from(value.body) } : null;
    }
    async createPublicReadUrl(key: string) {
        this.publicReads.push(key);
        if (!this.publicReadUrlBase || !this.objects.has(key)) return null;
        return `${this.publicReadUrlBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
    }
    async put(key: string, body: Uint8Array, options?: PutObjectOptions) {
        this.puts.push(key);
        const value = stored(body, options?.contentType ?? 'application/octet-stream');
        this.objects.set(key, value);
        if (this.failNextPutAfterWrite) {
            this.failNextPutAfterWrite = false;
            throw new Error('injected partial object write');
        }
        return { ...value, body: Uint8Array.from(value.body) };
    }
    async delete(key: string) {
        this.deletes.push(key);
        if (this.failDeleteKeys.has(key)) throw new Error('injected cleanup failure');
        this.objects.delete(key);
    }
    async exists(key: string) { return this.objects.has(key); }
    async copy(sourceKey: string, destinationKey: string) {
        const source = this.objects.get(sourceKey);
        if (!source) throw new Error('source not found');
        this.copies.push({ source: sourceKey, destination: destinationKey });
        this.objects.set(destinationKey, { ...source, body: Uint8Array.from(source.body) });
    }
    async move(sourceKey: string, destinationKey: string) {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }
    async list(prefix: string) {
        this.lists.push(prefix);
        return [...this.objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({
            key,
            size: value.size,
            etag: value.etag
        }));
    }
    async deletePrefix(prefix: string) {
        this.deletedPrefixes.push(prefix);
        for (const key of [...this.objects.keys()]) if (key.startsWith(prefix)) this.objects.delete(key);
    }

    seed(key: string, body = new Uint8Array([1, 2, 3]), contentType = 'image/webp') {
        this.objects.set(key, stored(body, contentType));
    }
}

export class FixtureImageProcessor implements ImageProcessor {
    validations: Uint8Array[] = [];

    async validate(body: Uint8Array): Promise<ImageInfo> {
        this.validations.push(Uint8Array.from(body));
        const marker = new TextDecoder().decode(body);
        if (marker === 'broken') throw new Error('decode failed');
        const format = marker === 'forged-png' ? 'jpeg' : marker === 'valid-jpeg' ? 'jpeg' : 'png';
        return { format, width: 1, height: 1, contentType: `image/${format}` };
    }
    async toWebp(body: Uint8Array) {
        if (new TextDecoder().decode(body) === 'convert-failure') throw new Error('conversion failed');
        return new Uint8Array([0x57, 0x45, 0x42, 0x50]);
    }
    async thumbnailPng() { return new Uint8Array([1]); }
    async resizeJpeg() { return new Uint8Array([1]); }
}

export class FixtureUploadParser implements UploadParser {
    next: ParsedUpload = { fields: {}, files: {} };
    calls: Array<{ maxBytes: number; fileFields: readonly string[] }> = [];

    async parse(_request: Request, options: { maxBytes: number; fileFields: readonly string[] }) {
        this.calls.push(options);
        return this.next;
    }
}

export interface WikiFixture {
    app: ReturnType<typeof createHonoApp>;
    services: RuntimeServices;
    story: MemoryStoryRepository;
    storage: MemoryObjectStorage;
    images: FixtureImageProcessor;
    uploads: FixtureUploadParser;
    staticRequests: string[];
    setFetch(fetchImpl: typeof globalThis.fetch): void;
    auth(role?: string, csrf?: string): Promise<{ token: string; csrf: string }>;
    authHeaders(role?: string, csrf?: string): Promise<Record<string, string>>;
    setUpload(upload: ParsedUpload): void;
}

export function createWikiFixture(): WikiFixture {
    const story = new MemoryStoryRepository();
    const storage = new MemoryObjectStorage();
    const images = new FixtureImageProcessor();
    const uploads = new FixtureUploadParser();
    const tokens = new HmacTokenService('wiki-contract-secret-that-is-longer-than-thirty-two-bytes');
    const staticRequests: string[] = [];
    const services: RuntimeServices = {
        story,
        storage,
        images,
        uploads,
        tokens,
        config: { storyMaxUploadBytes: 1024 },
        staticAssets: {
            async fetch(request: Request) {
                const path = new URL(request.url).pathname;
                staticRequests.push(path);
                if (path === '/index.html') {
                    return new Response('<!doctype html><html><head><title>IMS Main Site</title></head><body id="main-site-home">main</body></html>', {
                        headers: { 'Content-Type': 'text/html; charset=UTF-8' }
                    });
                }
                if (path.startsWith('/icon/')) return new Response('fixture-icon', { headers: { 'Content-Type': 'image/webp' } });
                if (path.startsWith('/css/')) return new Response('fixture-css', { headers: { 'Content-Type': 'text/css' } });
                return new Response('asset not found', { status: 404 });
            }
        },
        fetch: (async () => { throw new Error('real network is disabled in Wiki contracts'); }) as typeof globalThis.fetch
    };
    const app = createHonoApp(() => services);

    return {
        app,
        services,
        story,
        storage,
        images,
        uploads,
        staticRequests,
        setFetch(fetchImpl) { services.fetch = fetchImpl; },
        async auth(role = 'op', csrf = `csrf-${role}`) {
            const token = await tokens.sign({ id: 1, username: `${role}-fixture`, dept: role, csrfSecret: csrf }, 7200);
            return { token, csrf };
        },
        async authHeaders(role = 'op', csrf = `csrf-${role}`) {
            const auth = await this.auth(role, csrf);
            return { Cookie: `token=${auth.token}`, 'X-CSRFToken': auth.csrf };
        },
        setUpload(upload) { uploads.next = upload; }
    };
}

export function formFields(overrides: Record<string, string> = {}) {
    return {
        agency: '闪耀色彩',
        idol: '樱木真乃',
        category_name: 'enzaP卡',
        card_name: '【fixture】',
        up_name: 'fixture-up',
        video_title: 'fixture-title',
        url: 'https://www.bilibili.com/video/BV1xx411c7mD',
        ...overrides
    };
}

export function uploadedPng(marker = 'valid-png', filename = 'fixture.png') {
    return {
        filename,
        contentType: 'image/png',
        body: new TextEncoder().encode(marker)
    };
}

export async function postMultipart(
    fixture: WikiFixture,
    path: string,
    upload: ParsedUpload,
    headers: Record<string, string>
) {
    fixture.setUpload(upload);
    return fixture.app.request(path, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'multipart/form-data; boundary=wiki-fixture' },
        body: '--wiki-fixture--'
    });
}

export async function postForm(
    fixture: WikiFixture,
    path: string,
    fields: Record<string, string>,
    headers: Record<string, string>
) {
    return fixture.app.request(path, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString()
    });
}
