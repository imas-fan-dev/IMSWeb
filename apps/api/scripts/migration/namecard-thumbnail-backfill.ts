import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseNodeObjectStorageConfig } from '@/config/object-storage';
import {
    NAMECARD_THUMBNAIL_HEIGHT,
    NAMECARD_THUMBNAIL_MAX_INPUT_PIXELS,
    NAMECARD_THUMBNAIL_WIDTH
} from '@/domains/namecards/media-assets';
import { closeNodeServices, createNodeServices } from '@/runtime/node-services';
import {
    namecardMediaObjectKeys
} from '@/utils/storage/business-object-keys';

interface Options {
    apply: boolean;
    concurrency: number;
    report: string;
}

type ThumbnailResult =
    | 'exists'
    | 'generated'
    | 'would-generate'
    | 'missing-original'
    | 'not-approved-anymore'
    | 'conflict'
    | 'error';

interface ThumbnailEntry {
    cardId: number;
    side: 'front' | 'back';
    key: string;
    originalUrl: string;
    result: ThumbnailResult;
    bytes?: number;
    sha256?: string;
    error?: string;
}

const projectRoot = path.resolve(__dirname, '../../../..');

function sha256(body: Uint8Array): string {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function positiveInteger(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 16) {
        throw new Error(`${name} must be an integer between 1 and 16`);
    }
    return parsed;
}

export function parseNamecardThumbnailBackfillArguments(
    argv: string[],
    environment: NodeJS.ProcessEnv = process.env
): Options {
    const config = parseNodeObjectStorageConfig(environment);
    if (config.type !== 's3') {
        throw new Error('IMS_OBJECT_STORAGE=s3 is required');
    }
    let apply = false;
    let concurrency = 6;
    let report = path.join(
        projectRoot,
        'data/migration/namecard-thumbnail-backfill-dry-run.json'
    );
    let confirmedBucket: string | undefined;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') {
            apply = true;
            report = path.join(
                projectRoot,
                'data/migration/namecard-thumbnail-backfill.json'
            );
        } else if (argument === '--report') {
            const value = argv[++index];
            if (!value || value.startsWith('--')) throw new Error('--report requires a file');
            report = path.resolve(projectRoot, value);
        } else if (argument === '--concurrency') {
            concurrency = positiveInteger(argv[++index], '--concurrency');
        } else if (argument === '--confirm-bucket') {
            confirmedBucket = argv[++index];
        } else if (argument === '--help' || argument === '-h') {
            console.log([
                'Usage: pnpm run migration:namecard-thumbnails -- [options]',
                '',
                'Dry-runs thumbnail generation for every approved namecard by default.',
                'Each 600x400 JPEG is written beside its original image object.',
                '',
                'Options:',
                '  --apply',
                '  --confirm-bucket <bucket>',
                '  --concurrency <1..16>',
                '  --report <file>',
                '  --help'
            ].join('\n'));
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (apply && confirmedBucket !== config.bucket) {
        throw new Error('Apply requires --confirm-bucket ' + config.bucket);
    }
    return { apply, concurrency, report };
}

async function writeManifest(target: string, report: unknown): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, target);
}

interface CardMediaSide {
    cardId: number;
    originalUrl: string;
    key: string;
    side: 'front' | 'back';
}

async function main(): Promise<void> {
    const options = parseNamecardThumbnailBackfillArguments(process.argv.slice(2));
    const services = await createNodeServices();
    try {
        const pageSize = 50;
        const total = await services.namecards.countApprovedCards();
        const sides: CardMediaSide[] = [];
        for (let offset = 0; offset < total; offset += pageSize) {
            const cards = await services.namecards.listApprovedCards(pageSize, offset);
            for (const card of cards) {
                const cardId = Number(card.id);
                const image1Url = String(card.image1_url);
                const image2Url = String(card.image2_url);
                if (!Number.isSafeInteger(cardId) || cardId < 1) {
                    throw new Error('Namecard row has an invalid id');
                }
                if (!image1Url || !image2Url) {
                    throw new Error(`Namecard ${cardId} has an invalid media URL`);
                }
                for (const side of ['front', 'back'] as const) {
                    const originalUrl = side === 'front' ? image1Url : image2Url;
                    sides.push({
                        cardId,
                        originalUrl,
                        key: namecardMediaObjectKeys(originalUrl)[1],
                        side
                    });
                }
            }
        }
        const entries = new Array<ThumbnailEntry | null>(sides.length).fill(null);
        let next = 0;
        let handled = 0;
        await Promise.all(Array.from(
            { length: Math.min(options.concurrency, sides.length) },
            async () => {
                while (next < sides.length) {
                    const index = next;
                    next += 1;
                    const side = sides[index];
                    const entry: ThumbnailEntry = {
                        cardId: side.cardId,
                        side: side.side,
                        key: side.key,
                        originalUrl: side.originalUrl,
                        result: 'error'
                    };
                    try {
                        if (!await services.namecards.findApprovedCardMedia(side.cardId)) {
                            entry.result = 'not-approved-anymore';
                        } else if (await services.storage.exists(side.key)) {
                            entry.result = 'exists';
                        } else {
                            const original = await services.storage.get(
                                namecardMediaObjectKeys(side.originalUrl)[0]
                            );
                            if (!original) {
                                entry.result = 'missing-original';
                            } else {
                                const thumbnail = await services.images.resizeJpeg(
                                    original.body,
                                    NAMECARD_THUMBNAIL_WIDTH,
                                    NAMECARD_THUMBNAIL_HEIGHT,
                                    { maxInputPixels: NAMECARD_THUMBNAIL_MAX_INPUT_PIXELS }
                                );
                                entry.bytes = thumbnail.byteLength;
                                entry.sha256 = sha256(thumbnail);
                                if (!options.apply) {
                                    entry.result = 'would-generate';
                                } else if (services.storage.putIfUnchanged) {
                                    const stored = await services.storage.putIfUnchanged(
                                        side.key,
                                        null,
                                        thumbnail,
                                        { contentType: 'image/jpeg' }
                                    );
                                    if (!stored) {
                                        entry.result = 'conflict';
                                    } else {
                                        const verified = await services.storage.get(side.key);
                                        if (
                                            !verified ||
                                            verified.size !== thumbnail.byteLength ||
                                            sha256(verified.body) !== entry.sha256
                                        ) {
                                            throw new Error(`Object verification failed after writing ${side.key}`);
                                        }
                                        entry.result = 'generated';
                                    }
                                } else {
                                    await services.storage.put(side.key, thumbnail, {
                                        contentType: 'image/jpeg'
                                    });
                                    entry.result = 'generated';
                                }
                            }
                        }
                    } catch (error) {
                        entry.result = 'error';
                        entry.error = error instanceof Error ? error.message : String(error);
                    }
                    entries[index] = entry;
                    handled += 1;
                    if (handled % 50 === 0 || handled === sides.length) {
                        process.stderr.write(
                            `Checked ${handled}/${sides.length} namecard thumbnails\n`
                        );
                    }
                }
            }
        ));
        const finished = entries.map((entry, index) => entry ?? {
            cardId: sides[index].cardId,
            side: sides[index].side,
            key: sides[index].key,
            originalUrl: sides[index].originalUrl,
            result: 'error' as const,
            error: 'unprocessed'
        });
        const counts = Object.fromEntries([
            'exists',
            'generated',
            'would-generate',
            'missing-original',
            'not-approved-anymore',
            'conflict',
            'error'
        ].map((result) => [
            result,
            finished.filter((entry) => entry.result === result).length
        ]));
        const report = {
            generatedAt: new Date().toISOString(),
            applied: options.apply,
            thumbnail: {
                width: NAMECARD_THUMBNAIL_WIDTH,
                height: NAMECARD_THUMBNAIL_HEIGHT,
                contentType: 'image/jpeg',
                publicPathPattern: '/uploads/namecard/thumbnail/<original-filename>.jpg'
            },
            approvedCards: total,
            counts,
            entries: finished
        };
        await writeManifest(options.report, report);
        console.log(
            `Namecard thumbnails: ${finished.length} side(s) across ${total} approved card(s)`
        );
        console.log(`Report: ${options.report}`);
        if (counts['missing-original'] > 0 || counts.error > 0) {
            console.error(
                `Unresolved thumbnails: ${counts['missing-original']} missing original(s), ` +
                `${counts.error} error(s)`
            );
            process.exitCode = 1;
        }
    } finally {
        await closeNodeServices();
    }
}

if (require.main === module) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
