import fs from 'node:fs/promises';
import path from 'node:path';
import { publicUploadsPath } from '@imsweb/contracts/paths';
import {
    emptyArticleDocument,
    legacyHtmlImageReferences,
    legacyHtmlToArticleDocument,
    renderArticleBody,
    type LegacyArticleImageReference,
    type LegacyArticleImageResolution
} from '@/domains/content/editorial/article-body';
import { readInformationIndex } from '@/domains/content/information/content-store';
import type { InformationCard } from '@/domains/content/information/data';
import type { EditorialRepository } from '@/ports/repositories';
import type { NodeRuntimeServices } from '@/ports/runtime-services';
import { closeNodeServices, resolveNodeServices } from '@/runtime/node-services';
import { safeUploadBaseName } from '@/utils/media/filename';
import {
    articleAssetObjectKey,
    publicMediaObjectKey
} from '@/utils/storage/business-object-keys';

interface Options {
    apply: boolean;
    report: string;
}

interface LegacyInformationPlanEntry {
    order: number;
    card: InformationCard;
    bodyImages: LegacyArticleImageReference[];
}

interface AssetCheck {
    sourceUrl: string;
    kind: 'cover' | 'body';
    available: boolean | null;
    supported: boolean;
}

const projectRoot = path.resolve(__dirname, '../../../..');

function parseArguments(argv: string[]): Options {
    let apply = false;
    let report = path.join(projectRoot, 'data/migration/information-to-community-posts-dry-run.json');
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') {
            apply = true;
            report = path.join(projectRoot, 'data/migration/information-to-community-posts.json');
        } else if (argument === '--report') {
            const value = argv[++index];
            if (!value || value.startsWith('--')) throw new Error('--report requires a path');
            report = path.resolve(projectRoot, value);
        } else if (argument === '--help' || argument === '-h') {
            console.log([
                'Usage: pnpm run migration:information-posts -- [--apply] [--report PATH]',
                '',
                'Creates a no-delete migration plan for legacy Information cards.',
                'Without --apply, the command only inventories source cards and media.'
            ].join('\n'));
            process.exitCode = 0;
            return { apply: false, report };
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return { apply, report };
}

function managedUploadPath(value: string): boolean {
    return value.startsWith(publicUploadsPath('/')) && !value.startsWith('//');
}

function bodyImageReferences(card: InformationCard): LegacyArticleImageReference[] {
    return card.contentType === 'html' ? legacyHtmlImageReferences(card.html || '') : [];
}

function buildPlan(cards: InformationCard[]): LegacyInformationPlanEntry[] {
    return cards.map((card, order) => ({ order, card, bodyImages: bodyImageReferences(card) }));
}

async function inspectAsset(
    runtime: NodeRuntimeServices,
    sourceUrl: string,
    kind: AssetCheck['kind']
): Promise<AssetCheck> {
    if (!managedUploadPath(sourceUrl)) {
        return { sourceUrl, kind, supported: false, available: null };
    }
    const key = publicMediaObjectKey(sourceUrl);
    return {
        sourceUrl,
        kind,
        supported: true,
        available: await runtime.storage.exists(key)
    };
}

async function inspectPlan(
    runtime: NodeRuntimeServices,
    plan: LegacyInformationPlanEntry[]
): Promise<AssetCheck[]> {
    const checks: AssetCheck[] = [];
    for (const entry of plan) {
        checks.push(await inspectAsset(runtime, entry.card.image, 'cover'));
        for (const image of entry.bodyImages) {
            checks.push(await inspectAsset(runtime, image.sourceUrl, 'body'));
        }
    }
    return checks;
}

function planIssues(checks: AssetCheck[]): AssetCheck[] {
    return checks.filter((check) =>
        (check.kind === 'body' && (!check.supported || !check.available)) ||
        (check.kind === 'cover' && check.available === false)
    );
}

async function writeReport(target: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function destinationName(index: number, sourceUrl: string): string {
    const pathname = sourceUrl.split(/[?#]/, 1)[0] || 'image';
    return `legacy-${String(index + 1).padStart(3, '0')}-${safeUploadBaseName(path.basename(pathname))}.webp`;
}

function numberField(value: unknown, name: string): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0) {
        throw new Error(`Legacy migration received an invalid ${name}`);
    }
    return result;
}

function emptyDocument(value: Record<string, unknown>): boolean {
    return value.type === 'doc' && Array.isArray(value.content) && value.content.length === 0;
}

async function ensureBodyAsset(
    runtime: NodeRuntimeServices,
    repository: EditorialRepository,
    articleId: number,
    image: LegacyArticleImageReference,
    index: number
): Promise<LegacyArticleImageResolution> {
    const filename = destinationName(index, image.sourceUrl);
    const objectKey = articleAssetObjectKey(articleId, filename);
    const publicPath = publicUploadsPath(`/articles/${articleId}/${filename}`);
    const existing = await repository.findArticleAssetByObjectKey(articleId, objectKey);
    if (existing) {
        return {
            assetId: numberField(existing.id, 'article asset ID'),
            publicPath: String(existing.public_path)
        };
    }

    const sourceKey = publicMediaObjectKey(image.sourceUrl);
    const source = await runtime.storage.get(sourceKey);
    if (!source) throw new Error(`Legacy body image is missing: ${image.sourceUrl}`);
    const body = await runtime.images.toWebp(source.body);
    await runtime.storage.put(objectKey, body, {
        contentType: 'image/webp',
        deferredPublication: true
    });
    try {
        const asset = await repository.insertArticleAsset({
            articleId,
            objectKey,
            publicPath,
            usage: 'body',
            altText: image.altText,
            userId: null
        });
        await runtime.storage.publish?.(objectKey);
        return { assetId: numberField(asset.id, 'article asset ID'), publicPath };
    } catch (error) {
        await runtime.storage.delete(objectKey).catch(() => undefined);
        throw error;
    }
}

async function importPlan(
    runtime: NodeRuntimeServices,
    repository: EditorialRepository,
    plan: LegacyInformationPlanEntry[]
): Promise<Array<{ id: number; imported: boolean }>> {
    const results: Array<{ id: number; imported: boolean }> = [];
    for (const entry of plan) {
        const imported = await repository.importLegacyInformationPost({
            legacyInformationId: entry.card.id,
            category: entry.card.category,
            title: entry.card.title,
            coverUrl: entry.card.image,
            sourceUrl: entry.card.contentType === 'external' ? entry.card.link : null,
            publishedAt: entry.card.updatedAt
        });
        const needsBodyRecovery = entry.card.contentType === 'html' && emptyDocument(imported.bodyJson);
        if (imported.imported || needsBodyRecovery) {
            const resolutions = new Map<string, LegacyArticleImageResolution>();
            for (const [index, image] of entry.bodyImages.entries()) {
                if (!resolutions.has(image.sourceUrl)) {
                    resolutions.set(
                        image.sourceUrl,
                        await ensureBodyAsset(runtime, repository, imported.articleId, image, index)
                    );
                }
            }
            const bodyJson = entry.card.contentType === 'html'
                ? legacyHtmlToArticleDocument(entry.card.html || '', resolutions)
                : emptyArticleDocument;
            await repository.replaceLegacyInformationPostBody({
                legacyInformationId: entry.card.id,
                bodyJson,
                bodyHtml: renderArticleBody(bodyJson)
            });
        }
        results.push({ id: imported.id, imported: imported.imported });
    }
    if (results.some((result) => result.imported)) {
        await repository.replaceLegacyInformationSpotlightEntries(
            plan.map((entry, index) => ({
                postId: results[index]!.id,
                category: entry.card.category,
                sortOrder: entry.order
            }))
        );
    }
    return results;
}

async function main(): Promise<void> {
    const options = parseArguments(process.argv.slice(2));
    if (process.exitCode === 0 && process.argv.includes('--help')) return;
    const runtime = await resolveNodeServices();
    if (!runtime.storage || !runtime.editorial || !runtime.images) {
        throw new Error('Object storage, image processing, and editorial repository are required');
    }
    try {
        const { index } = await readInformationIndex(runtime.storage);
        const plan = buildPlan(index.cards);
        const assets = await inspectPlan(runtime, plan);
        const blocked = planIssues(assets);
        const report = {
            generatedAt: new Date().toISOString(),
            apply: options.apply,
            sourceCards: plan.length,
            sourceAssets: index.assets.length,
            planned: plan.map((entry) => ({
                id: entry.card.id,
                order: entry.order,
                title: entry.card.title,
                category: entry.card.category,
                content: entry.card.contentType === 'external' ? 'source-url' : 'rich-text',
                coverUrl: entry.card.image,
                bodyImageCount: entry.bodyImages.length
            })),
            assets,
            blockingBodyImages: blocked,
            retainedLegacyObjects: true
        };
        await writeReport(options.report, report);
        if (options.apply && blocked.length) {
            throw new Error('Legacy Information import blocked: every managed cover and body image must be readable');
        }
        const results = options.apply ? await importPlan(runtime, runtime.editorial, plan) : [];
        const completed = {
            ...report,
            imported: results.filter((result) => result.imported).length,
            unchanged: results.filter((result) => !result.imported).length,
            postIds: results.map((result) => result.id)
        };
        if (options.apply && results.length !== plan.length) {
            throw new Error('Information import verification failed: result count differs from source card count');
        }
        await writeReport(options.report, completed);
        process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
    } finally {
        await closeNodeServices();
    }
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
});
