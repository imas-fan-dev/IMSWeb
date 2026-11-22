import type {
    WikiDocumentAssetRef,
    WikiDocumentBlock,
    WikiDocumentWarning,
    WikiPublicStoryDocument,
} from '@imsweb/contracts/wiki';
import { wikiPath } from '@imsweb/contracts/paths';
import type { ObjectStorage } from '@/ports/object-storage';
import type { StoryRepository } from '@/ports/repositories';
import type {
    WikiDocumentAssetSite,
    WikiDocumentCategorySite,
} from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import { resolvePublicObjectUrl } from '@/utils/storage/public-object-url';

/**
 * Resolution of document image and category references against the database.
 *
 * The compiler is a pure function, so it can only say "this document embeds
 * `cover:12` on line 7". Membership — the asset belongs to the entry's project,
 * the upload belongs to the entry, the named category exists — is a data fact,
 * and it is resolved here for preview, save, and every public read.
 *
 * Reads re-run this resolution instead of trusting the stored AST: replacing a
 * shared cover asset must change every embedding immediately, and a media row
 * deleted out from under a document must stop rendering.
 */
export interface WikiDocumentMediaSource {
    entryId: number;
    objectKey: string;
}

export interface WikiDocumentCoverAssetSource {
    agencyId: number;
    objectKey: string;
    presentationPolicy: 'inherit' | 'contain';
}

/** Everything the resolver may consult, already fetched by the caller. */
export interface WikiDocumentAssetTable {
    entryId: number;
    projectId: number;
    media: ReadonlyMap<number, WikiDocumentMediaSource>;
    coverAssets: ReadonlyMap<number, WikiDocumentCoverAssetSource>;
    /** Category names that exist on this entry. */
    categories: ReadonlySet<string>;
}

export interface WikiDocumentAssetResolution {
    document: WikiPublicStoryDocument;
    warnings: WikiDocumentWarning[];
    /** Shared cover assets the document embeds, in document order. */
    coverAssetIds: number[];
}

interface ResolvedAsset {
    imageUrl: string;
    presentationPolicy: 'inherit' | 'contain';
}

/**
 * Site-owned fallback URL for a document asset.
 *
 * Addresses shared covers via `/api/wiki/story-cover-assets/<id>.webp` and
 * document uploads via `/api/wiki/document-media/<id>.webp`, so local
 * deployments without a public read base still serve every asset without ever
 * exposing raw object storage keys.
 */
export function documentAssetFallbackUrl(asset: WikiDocumentAssetRef): string {
    return asset.kind === 'cover'
        ? wikiPath(`/story-cover-assets/${asset.id}.webp`)
        : wikiPath(`/document-media/${asset.id}.webp`);
}

/**
 * Resolver used by every document endpoint.
 *
 * Prefers the configured public read base (CDN/R2 in production) and falls back
 * to the API's own id-addressed asset routes, so uploading, previewing, saving,
 * and reading never fail with 503 when no public read base is configured.
 */
export function documentAssetUrlResolver(
    storage: ObjectStorage
): (asset: WikiDocumentAssetRef, objectKey: string) => Promise<string> {
    return (asset, objectKey) =>
        resolvePublicObjectUrl(
            storage,
            objectKey,
            documentAssetFallbackUrl(asset)
        );
}

/**
 * Fetches only the rows a document actually references.
 *
 * Media lookups are deliberately not scoped to the entry: a `doc:` id that
 * belongs to another entry must be distinguishable from a deleted one so the
 * author sees the right warning.
 */
export async function loadWikiDocumentAssetTable(input: {
    repository: StoryRepository;
    entryId: number;
    projectId: number;
    assetRefs: readonly WikiDocumentAssetSite[];
}): Promise<WikiDocumentAssetTable> {
    const mediaIds = new Set<number>();
    const coverIds = new Set<number>();
    for (const site of input.assetRefs) {
        if (site.asset.kind === 'cover') coverIds.add(site.asset.id);
        else mediaIds.add(site.asset.id);
    }
    const [mediaRecords, coverRecords, categories] = await Promise.all([
        Promise.all(
            [...mediaIds].map((id) =>
                input.repository.findWikiEntryDocumentMediaById(id)
            )
        ),
        Promise.all(
            [...coverIds].map((id) =>
                input.repository.findStoryCoverAssetById(id)
            )
        ),
        input.repository.listWikiCategories(input.projectId, input.entryId),
    ]);
    const media = new Map<number, WikiDocumentMediaSource>();
    for (const record of mediaRecords) {
        if (record) {
            media.set(record.id, {
                entryId: record.entryId,
                objectKey: record.objectKey,
            });
        }
    }
    const coverAssets = new Map<number, WikiDocumentCoverAssetSource>();
    for (const record of coverRecords) {
        if (record) {
            coverAssets.set(record.id, {
                agencyId: record.agency_id,
                objectKey: record.object_key,
                presentationPolicy: record.presentation_policy,
            });
        }
    }
    return {
        entryId: input.entryId,
        projectId: input.projectId,
        media,
        coverAssets,
        categories: new Set(categories.map((category) => category.name)),
    };
}

export function wikiDocumentAssetKey(asset: WikiDocumentAssetRef): string {
    return `${asset.kind}:${asset.id}`;
}

/** Positions of every image reference in the stored AST (no source lines). */
export function collectWikiDocumentAssetSites(
    document: WikiPublicStoryDocument
): WikiDocumentAssetSite[] {
    const sites: WikiDocumentAssetSite[] = [];
    const visit = (blocks: readonly WikiDocumentBlock[]): void => {
        for (const block of blocks) {
            switch (block.type) {
                case 'media':
                    sites.push({ line: 0, asset: block.asset });
                    break;
                case 'cardGrid':
                    for (const card of block.cards) {
                        if (card.asset) sites.push({ line: 0, asset: card.asset });
                    }
                    break;
                case 'tabs':
                    for (const tab of block.items) visit(tab.children);
                    break;
                case 'blockquote':
                case 'callout':
                case 'details':
                    visit(block.children);
                    break;
                case 'list':
                    for (const item of block.items) visit(item.children);
                    break;
                default:
                    break;
            }
        }
    };
    visit(document.blocks);
    return sites;
}

/** Named category embeddings of the stored AST (no source lines). */
export function collectWikiDocumentCategorySites(
    document: WikiPublicStoryDocument
): WikiDocumentCategorySite[] {
    const sites: WikiDocumentCategorySite[] = [];
    const visit = (blocks: readonly WikiDocumentBlock[]): void => {
        for (const block of blocks) {
            switch (block.type) {
                case 'storyCategory':
                    if (block.categoryName) {
                        sites.push({ line: 0, name: block.categoryName });
                    }
                    break;
                case 'tabs':
                    for (const tab of block.items) visit(tab.children);
                    break;
                case 'blockquote':
                case 'callout':
                case 'details':
                    visit(block.children);
                    break;
                case 'list':
                    for (const item of block.items) visit(item.children);
                    break;
                default:
                    break;
            }
        }
    };
    visit(document.blocks);
    return sites;
}

function missingAssetWarning(
    site: WikiDocumentAssetSite,
    asset: WikiDocumentAssetRef,
): WikiDocumentWarning {
    return {
        line: site.line,
        code: 'asset-not-found',
        message:
            asset.kind === 'cover'
                ? `共享封面素材 cover:${asset.id} 不存在`
                : `图片素材 doc:${asset.id} 不存在`,
    };
}

/**
 * Structured categories a document embeds, in document order.
 *
 * `all` is set by `::story-categories`; otherwise the public payload only needs
 * the named categories, which is what keeps a `document` entry from mirroring
 * the whole untouched card pool of the entry.
 */
export function wikiDocumentCategorySelection(
    document: WikiPublicStoryDocument
): { all: boolean; names: string[] } {
    const names: string[] = [];
    let all = false;
    const visit = (blocks: readonly WikiDocumentBlock[]): void => {
        for (const block of blocks) {
            switch (block.type) {
                case 'storyCategory':
                    if (block.categoryName === null) all = true;
                    else if (!names.includes(block.categoryName)) {
                        names.push(block.categoryName);
                    }
                    break;
                case 'tabs':
                    for (const tab of block.items) visit(tab.children);
                    break;
                case 'blockquote':
                case 'callout':
                case 'details':
                    visit(block.children);
                    break;
                case 'list':
                    for (const item of block.items) visit(item.children);
                    break;
                default:
                    break;
            }
        }
    };
    visit(document.blocks);
    return { all, names };
}

/**
 * Resolves every reference of `document`, returning a rewritten AST.
 *
 * `imageUrl` turns a resolved storage object into a public read URL; the caller
 * owns that policy because uploads and shared covers are served differently.
 */
export async function resolveWikiDocumentAssets(input: {
    document: WikiPublicStoryDocument;
    assetRefs: readonly WikiDocumentAssetSite[];
    categoryRefs: readonly WikiDocumentCategorySite[];
    assets: WikiDocumentAssetTable;
    imageUrl: (asset: WikiDocumentAssetRef, objectKey: string) => Promise<string>;
}): Promise<WikiDocumentAssetResolution> {
    const warnings: WikiDocumentWarning[] = [];
    const resolved = new Map<string, ResolvedAsset>();
    const coverAssetIds: number[] = [];

    for (const site of input.assetRefs) {
        const { asset } = site;
        const key = wikiDocumentAssetKey(asset);
        if (asset.kind === 'cover') {
            const record = input.assets.coverAssets.get(asset.id);
            if (record && record.agencyId !== input.assets.projectId) {
                warnings.push({
                    line: site.line,
                    code: 'asset-cross-project',
                    message: `共享封面素材 cover:${asset.id} 不属于当前企划`,
                });
                continue;
            }
            if (!record) {
                warnings.push(missingAssetWarning(site, asset));
                continue;
            }
            if (!resolved.has(key)) {
                resolved.set(key, {
                    imageUrl: await input.imageUrl(asset, record.objectKey),
                    presentationPolicy: record.presentationPolicy,
                });
                coverAssetIds.push(asset.id);
            }
            continue;
        }
        const record = input.assets.media.get(asset.id);
        if (record && record.entryId !== input.assets.entryId) {
            warnings.push({
                line: site.line,
                code: 'asset-not-in-entry',
                message: `图片素材 doc:${asset.id} 不属于当前内容页`,
            });
            continue;
        }
        if (!record) {
            warnings.push(missingAssetWarning(site, asset));
            continue;
        }
        if (!resolved.has(key)) {
            resolved.set(key, {
                imageUrl: await input.imageUrl(asset, record.objectKey),
                presentationPolicy: 'inherit',
            });
        }
    }

    const seenCategories = new Set<string>();
    for (const site of input.categoryRefs) {
        if (seenCategories.has(site.name)) continue;
        seenCategories.add(site.name);
        if (!input.assets.categories.has(site.name)) {
            warnings.push({
                line: site.line,
                code: 'unknown-category',
                message: `内容页没有该分类：${site.name}`,
            });
        }
    }

    return {
        document: {
            ...input.document,
            blocks: mapBlocks(input.document.blocks, resolved),
        },
        warnings,
        coverAssetIds,
    };
}

function mapBlocks(
    blocks: readonly WikiDocumentBlock[],
    resolved: ReadonlyMap<string, ResolvedAsset>
): WikiDocumentBlock[] {
    return blocks.flatMap((block): WikiDocumentBlock[] => {
        switch (block.type) {
            case 'media': {
                const asset = resolved.get(wikiDocumentAssetKey(block.asset));
                return [
                    {
                        ...block,
                        imageUrl: asset?.imageUrl ?? null,
                        presentationPolicy:
                            asset?.presentationPolicy ?? 'inherit',
                    },
                ];
            }
            case 'cardGrid':
                return [
                    {
                        ...block,
                        cards: block.cards.map((card) => {
                            if (!card.asset) return card;
                            const asset = resolved.get(
                                wikiDocumentAssetKey(card.asset)
                            );
                            return {
                                ...card,
                                imageUrl: asset?.imageUrl ?? null,
                                presentationPolicy:
                                    asset?.presentationPolicy ?? 'inherit',
                            };
                        }),
                    },
                ];
            case 'tabs':
                return [
                    {
                        ...block,
                        items: block.items.map((tab) => ({
                            ...tab,
                            children: mapBlocks(tab.children, resolved),
                        })),
                    },
                ];
            case 'blockquote':
            case 'callout':
            case 'details':
                return [
                    { ...block, children: mapBlocks(block.children, resolved) },
                ];
            case 'list':
                return [
                    {
                        ...block,
                        items: block.items.map((item) => ({
                            ...item,
                            children: mapBlocks(item.children, resolved),
                        })),
                    },
                ];
            default:
                return [block];
        }
    });
}
