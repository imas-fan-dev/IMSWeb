import { describe, expect, test } from 'vitest';
import type { ListedObject, ObjectStorage, StoredObject } from '@/ports/object-storage';
import {
    classifyNamecardMediaObject,
    DEFAULT_MEDIA_GC_OLDER_THAN_MS,
    parseNamecardMediaGcArguments,
    parseNamecardMediaGcDuration,
    planNamecardMediaGc,
    runNamecardMediaGc,
    type NamecardMediaGcEntry,
    type NamecardMediaGcReferenceContext,
    type NamecardMediaGcSqlRunner
} from '@/operations/namecard-media-gc';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-12T00:00:00.000Z');
const CARD_A = '11111111-1111-1111-1111-111111111111';
const CARD_B = '22222222-2222-2222-2222-222222222222';
const PAGE_A = 'page-aaaaaaaa-0000-0000-0000-000000000001';
const PAGE_B = 'page-bbbbbbbb-0000-0000-0000-000000000002';
const VERSION_1 = 'aaaaaaaa-1111-1111-1111-111111111111';
const VERSION_2 = 'bbbbbbbb-2222-2222-2222-222222222222';

function emptyContext(
    overrides: Partial<NamecardMediaGcReferenceContext> = {}
): NamecardMediaGcReferenceContext {
    return {
        referencedKeys: new Set(),
        liveCardIds: new Set(),
        pendingCardIds: new Set(),
        approvingCardIds: new Set(),
        ...overrides
    };
}

function entryFor(
    entries: readonly NamecardMediaGcEntry[],
    key: string
): NamecardMediaGcEntry {
    const entry = entries.find((candidate) => candidate.key === key);
    if (!entry) throw new Error(`No entry for ${key}`);
    return entry;
}

interface CardPageFixture {
    card_id: string;
    queue: string;
    page_id: string;
    object_version: string;
    object_queue: string | null;
}

class FakeStorage {
    readonly deleted: string[] = [];

    constructor(
        readonly objects: Map<string, Date>,
        private readonly failures: Set<string> = new Set()
    ) {}

    async list(prefix: string): Promise<ListedObject[]> {
        return [...this.objects.keys()]
            .filter((key) => key.startsWith(prefix))
            .sort()
            .map((key) => ({ key, size: 1, etag: `"${key}"` }));
    }

    async get(key: string): Promise<StoredObject | null> {
        const uploadedAt = this.objects.get(key);
        if (!uploadedAt) return null;
        return {
            body: new Uint8Array(),
            size: 0,
            contentType: 'image/webp',
            etag: `"${key}"`,
            uploadedAt
        };
    }

    async delete(key: string): Promise<void> {
        if (this.failures.has(key)) throw new Error(`delete failed: ${key}`);
        this.deleted.push(key);
        this.objects.delete(key);
    }

    asObjectStorage(): ObjectStorage {
        return this as unknown as ObjectStorage;
    }
}

class FakeDatabase implements NamecardMediaGcSqlRunner {
    constructor(
        readonly pages: CardPageFixture[],
        readonly cards: Array<{
            id: string;
            card_number: number;
            publication_status: string;
        }>
    ) {}

    async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
        if (text.includes('FROM fudaba_card_pages')) {
            return { rows: this.pages as unknown as T[] };
        }
        if (text.includes('card_number')) {
            const number = Number(values?.[0]);
            const found = this.cards.find((card) => card.card_number === number);
            return {
                rows: (found ? [{ id: found.id }] : []) as unknown as T[]
            };
        }
        if (text.includes('publication_status')) {
            return { rows: this.cards as unknown as T[] };
        }
        throw new Error(`Unexpected query: ${text}`);
    }
}

function databaseWith(input: {
    pages?: CardPageFixture[];
    cards?: Array<{ id: string; card_number: number; publication_status: string }>;
}): FakeDatabase {
    return new FakeDatabase(
        input.pages ?? [
            {
                card_id: CARD_A,
                queue: 'live',
                page_id: PAGE_A,
                object_version: VERSION_1,
                object_queue: 'live'
            }
        ],
        input.cards ?? [
            { id: CARD_A, card_number: 801, publication_status: 'published' }
        ]
    );
}

const pageKey = (cardId: string, queue: string, pageId: string, version: string) =>
    `community/fudaba/cards/${cardId}/${queue}/${pageId}.${version}.webp`;

describe('classifyNamecardMediaObject', () => {
    test('keeps referenced page keys and their sized cache keys', () => {
        const page = pageKey(CARD_A, 'live', PAGE_A, VERSION_1);
        const cacheKey = `community/fudaba/cards/${CARD_A}/live/cache/${PAGE_A}.${VERSION_1}.400.webp`;
        const context = emptyContext({
            referencedKeys: new Set([page, cacheKey]),
            liveCardIds: new Set([CARD_A])
        });
        expect(classifyNamecardMediaObject(page, context)).toEqual({
            action: 'keep',
            reason: 'referenced'
        });
        expect(classifyNamecardMediaObject(cacheKey, context)).toEqual({
            action: 'keep',
            reason: 'referenced'
        });
    });

    test('classifies every legacy layout, orphan and thumbnail shape', () => {
        const context = emptyContext({
            liveCardIds: new Set([CARD_A]),
            pendingCardIds: new Set([CARD_A])
        });
        const cases: Array<[string, string]> = [
            [`community/fudaba/cards/${CARD_A}/front.webp`, 'legacy-root-layout'],
            [`community/fudaba/cards/${CARD_A}/middle-2.jpg`, 'legacy-root-layout'],
            [
                `community/fudaba/cards/${CARD_A}/versions/${VERSION_2}/media.webp`,
                'legacy-version-layout'
            ],
            [
                `community/fudaba/cards/${CARD_A}/versions/${VERSION_2}/middle-1.webp`,
                'legacy-version-layout'
            ],
            [
                `community/fudaba/cards/${CARD_A}/pending/cache/${PAGE_A}.${VERSION_2}.160.webp`,
                'orphan-cache'
            ],
            [
                pageKey(CARD_A, 'live', PAGE_A, VERSION_2),
                'orphan-page-version'
            ],
            [
                `community/fudaba/cards/${CARD_A}/live/notes.thumbnail.jpg`,
                'legacy-thumbnail'
            ],
            ['community/namecards/assets/card-801-front/image.webp', 'legacy-compat-asset'],
            ['community/namecards/assets/card-801-front/thumbnail.jpg', 'legacy-thumbnail'],
            ['uploads/namecard/original/card-801-front.webp', 'legacy-upload'],
            ['uploads/namecard/thumbnail/card-801-front.jpg', 'legacy-thumbnail']
        ];
        for (const [key, reason] of cases) {
            expect(classifyNamecardMediaObject(key, context), key).toEqual({
                action: 'delete',
                reason
            });
        }
    });

    test('deletes whole queues whose rows are gone', () => {
        const context = emptyContext({ liveCardIds: new Set([CARD_A]) });
        expect(
            classifyNamecardMediaObject(pageKey(CARD_B, 'live', PAGE_B, VERSION_1), context)
        ).toEqual({ action: 'delete', reason: 'orphan-live-directory' });
        expect(
            classifyNamecardMediaObject(pageKey(CARD_B, 'pending', PAGE_B, VERSION_1), context)
        ).toEqual({ action: 'delete', reason: 'orphan-pending-directory' });
        expect(
            classifyNamecardMediaObject(`community/fudaba/cards/${CARD_B}/live/.DS_Store`, context)
        ).toEqual({ action: 'delete', reason: 'orphan-live-directory' });
        // A card whose live rows still exist keeps unknown shapes at the root.
        expect(
            classifyNamecardMediaObject(`community/fudaba/cards/${CARD_A}/live/extra.dat`, context)
        ).toEqual({ action: 'keep', reason: 'not-a-cleanup-target' });
    });

    test('skips approving cards outright, even for unreferenced legacy keys', () => {
        const context = emptyContext({
            approvingCardIds: new Set([CARD_A]),
            liveCardIds: new Set([CARD_A])
        });
        expect(
            classifyNamecardMediaObject(`community/fudaba/cards/${CARD_A}/front.webp`, context)
        ).toEqual({ action: 'skip', reason: 'approving-card' });
        expect(
            classifyNamecardMediaObject(pageKey(CARD_B, 'live', PAGE_B, VERSION_1), context)
        ).toEqual({ action: 'delete', reason: 'orphan-live-directory' });
    });

    test('leaves keys outside every cleanup shape untouched', () => {
        expect(
            classifyNamecardMediaObject('community/fudaba/cards/README.md', emptyContext())
        ).toEqual({ action: 'keep', reason: 'not-a-cleanup-target' });
        expect(
            classifyNamecardMediaObject('editorial/news/assets/x/thumbnail.jpg', emptyContext())
        ).toEqual({ action: 'delete', reason: 'legacy-thumbnail' });
    });
});

describe('planNamecardMediaGc', () => {
    const context = emptyContext({ liveCardIds: new Set([CARD_A]) });

    test('deletes only objects older than the window', async () => {
        const fresh = `community/fudaba/cards/${CARD_A}/front.webp`;
        const old = `community/fudaba/cards/${CARD_A}/back.webp`;
        const unknown = `community/fudaba/cards/${CARD_A}/versions/${VERSION_2}/media.webp`;
        const plan = await planNamecardMediaGc({
            objects: [
                { key: fresh, uploadedAt: new Date(NOW.getTime() - 60 * 1000) },
                { key: old, uploadedAt: new Date(NOW.getTime() - 8 * DAY) },
                { key: unknown }
            ],
            context,
            now: NOW,
            olderThanMs: DEFAULT_MEDIA_GC_OLDER_THAN_MS
        });
        expect(plan.scanned).toBe(3);
        expect(plan.deletions).toEqual([old]);
        expect(entryFor(plan.entries, fresh)).toEqual({
            key: fresh,
            action: 'skip',
            reason: 'too-recent'
        });
        expect(entryFor(plan.entries, unknown)).toEqual({
            key: unknown,
            action: 'skip',
            reason: 'unknown-age'
        });
        expect(plan.kept).toBe(0);
        expect(plan.skipped).toBe(2);
    });

    test('resolves candidate ages lazily through the injected reader', async () => {
        const key = `community/fudaba/cards/${CARD_A}/front.webp`;
        const asked: string[] = [];
        const plan = await planNamecardMediaGc({
            objects: [{ key }],
            context,
            now: NOW,
            olderThanMs: DEFAULT_MEDIA_GC_OLDER_THAN_MS,
            ageOf: (candidate) => {
                asked.push(candidate);
                return new Date(NOW.getTime() - 30 * DAY);
            }
        });
        expect(asked).toEqual([key]);
        expect(plan.deletions).toEqual([key]);
    });

    test('caps deletions deterministically and reports the overflow as skipped', async () => {
        const keys = [
            `community/fudaba/cards/${CARD_A}/front.webp`,
            `community/fudaba/cards/${CARD_A}/back.webp`,
            `community/fudaba/cards/${CARD_A}/middle-1.webp`
        ];
        const plan = await planNamecardMediaGc({
            objects: keys.map((key) => ({
                key,
                uploadedAt: new Date(NOW.getTime() - 30 * DAY)
            })),
            context,
            now: NOW,
            olderThanMs: DEFAULT_MEDIA_GC_OLDER_THAN_MS,
            limit: 2
        });
        expect(plan.deletions).toEqual([...keys].sort().slice(0, 2));
        expect(
            plan.entries.filter((entry) => entry.reason === 'limit-reached')
        ).toEqual([
            {
                key: [...keys].sort()[2],
                action: 'skip',
                reason: 'limit-reached'
            }
        ]);
        expect(plan.skipped).toBe(1);
    });

    test('never deletes a referenced key even when it looks legacy', async () => {
        const legacy = `community/fudaba/cards/${CARD_A}/front.webp`;
        const plan = await planNamecardMediaGc({
            objects: [{ key: legacy, uploadedAt: new Date(NOW.getTime() - 30 * DAY) }],
            context: emptyContext({
                liveCardIds: new Set([CARD_A]),
                referencedKeys: new Set([legacy])
            }),
            now: NOW,
            olderThanMs: DEFAULT_MEDIA_GC_OLDER_THAN_MS
        });
        expect(plan.deletions).toEqual([]);
        expect(plan.kept).toBe(1);
    });
});

describe('runNamecardMediaGc', () => {
    const staleObjects = () => {
        const objects = new Map<string, Date>();
        const oldDate = new Date(NOW.getTime() - 30 * DAY);
        const referenced = pageKey(CARD_A, 'live', PAGE_A, VERSION_1);
        const referencedCache = `community/fudaba/cards/${CARD_A}/live/cache/${PAGE_A}.${VERSION_1}.400.webp`;
        objects.set(referenced, oldDate);
        objects.set(referencedCache, oldDate);
        objects.set(`community/fudaba/cards/${CARD_A}/front.webp`, oldDate);
        objects.set(`community/fudaba/cards/${CARD_A}/live/${PAGE_A}.${VERSION_2}.webp`, oldDate);
        objects.set(`community/namecards/assets/card-801-front/image.webp`, oldDate);
        objects.set('uploads/namecard/original/card-801-front.webp', oldDate);
        objects.set(`community/fudaba/cards/${CARD_B}/live/${PAGE_B}.${VERSION_1}.webp`, oldDate);
        objects.set('editorial/news/assets/keep/original.webp', oldDate);
        return objects;
    };

    test('dry run reports the plan without deleting anything', async () => {
        const objects = staleObjects();
        const storage = new FakeStorage(objects);
        const summary = await runNamecardMediaGc(
            { now: NOW },
            {
                database: databaseWith({}),
                storage,
                cleanup: { storage: storage.asObjectStorage() }
            }
        );
        expect(summary.dryRun).toBe(true);
        expect(summary.deleted).toBe(0);
        expect(storage.deleted).toEqual([]);
        expect(summary.failed).toBe(0);
        expect(summary.scanned).toBe(7);
        expect(summary.planned).toBe(summary.entries.filter((e) => e.action === 'delete').length);
        const deletedKeys = summary.entries
            .filter((entry) => entry.action === 'delete')
            .map((entry) => entry.key);
        expect(deletedKeys).toEqual([
            `community/fudaba/cards/${CARD_A}/front.webp`,
            `community/fudaba/cards/${CARD_A}/live/${PAGE_A}.${VERSION_2}.webp`,
            `community/fudaba/cards/${CARD_B}/live/${PAGE_B}.${VERSION_1}.webp`,
            'community/namecards/assets/card-801-front/image.webp',
            'uploads/namecard/original/card-801-front.webp'
        ]);
        // Referenced keys stay, and keys outside the scanned prefixes are not
        // even looked at (the editorial object never enters the plan).
        expect(deletedKeys).not.toContain(pageKey(CARD_A, 'live', PAGE_A, VERSION_1));
        expect(
            summary.entries.some(
                (entry) => entry.key === 'editorial/news/assets/keep/original.webp'
            )
        ).toBe(false);
        expect(entryFor(summary.entries, pageKey(CARD_A, 'live', PAGE_A, VERSION_1))).toEqual({
            key: pageKey(CARD_A, 'live', PAGE_A, VERSION_1),
            action: 'keep',
            reason: 'referenced'
        });
        expect(summary.kept).toBe(2);
        expect(summary.skipped).toBe(0);
        expect(summary.kept).toBe(
            summary.entries.filter((entry) => entry.action === 'keep').length
        );
        expect(summary.skipped).toBe(
            summary.entries.filter((entry) => entry.action === 'skip').length
        );
    });

    test('skips every object of an approving card', async () => {
        const objects = staleObjects();
        const storage = new FakeStorage(objects);
        const summary = await runNamecardMediaGc(
            { now: NOW },
            {
                database: databaseWith({
                    cards: [
                        { id: CARD_A, card_number: 801, publication_status: 'approving' },
                        { id: CARD_B, card_number: 802, publication_status: 'published' }
                    ]
                }),
                storage
            }
        );
        const deletedKeys = summary.entries
            .filter((entry) => entry.action === 'delete')
            .map((entry) => entry.key);
        expect(
            deletedKeys.some((key) => key.includes(`/cards/${CARD_A}/`))
        ).toBe(false);
        expect(
            summary.entries.filter((entry) => entry.reason === 'approving-card').length
        ).toBe(4);
    });

    test('apply deletes through compensation and counts failures', async () => {
        const objects = staleObjects();
        const failing = `community/fudaba/cards/${CARD_A}/front.webp`;
        const storage = new FakeStorage(objects, new Set([failing]));
        const summary = await runNamecardMediaGc(
            { now: NOW, apply: true },
            {
                database: databaseWith({}),
                storage,
                cleanup: { storage: storage.asObjectStorage() }
            }
        );
        expect(summary.dryRun).toBe(false);
        expect(summary.failed).toBe(1);
        expect(summary.failures).toEqual([
            { key: failing, message: `delete failed: ${failing}` }
        ]);
        expect(summary.deleted).toBe(summary.planned - 1);
        expect(storage.deleted).not.toContain(failing);
    });

    test('is idempotent: the second apply deletes nothing', async () => {
        const objects = staleObjects();
        const storage = new FakeStorage(objects);
        const dependencies = {
            database: databaseWith({}),
            storage,
            cleanup: { storage: storage.asObjectStorage() }
        };
        const first = await runNamecardMediaGc(
            { now: NOW, apply: true },
            dependencies
        );
        expect(first.deleted).toBe(first.planned);
        const second = await runNamecardMediaGc(
            { now: NOW, apply: true },
            dependencies
        );
        expect(second.deleted).toBe(0);
        expect(second.planned).toBe(0);
    });

    test('scopes the scan to one card when --card is given', async () => {
        const objects = staleObjects();
        const storage = new FakeStorage(objects);
        const summary = await runNamecardMediaGc(
            { now: NOW, card: 801 },
            {
                database: databaseWith({}),
                storage
            }
        );
        expect(summary.prefixes).toEqual([
            `community/fudaba/cards/${CARD_A}`,
            'community/namecards/assets/card-801-'
        ]);
        const scannedKeys = summary.entries.map((entry) => entry.key);
        expect(scannedKeys).not.toContain(
            `community/fudaba/cards/${CARD_B}/live/${PAGE_B}.${VERSION_1}.webp`
        );
        expect(scannedKeys).toContain('community/namecards/assets/card-801-front/image.webp');
        expect(
            scannedKeys.some((key) => key.includes(`/cards/${CARD_B}/`))
        ).toBe(false);
        // page key + its cache + front.webp + stale live version + compat asset.
        expect(summary.planned).toBe(3);
        expect(summary.scanned).toBe(5);
    });

    test('scopes the scan to an explicit prefix', async () => {
        const objects = staleObjects();
        const storage = new FakeStorage(objects);
        const summary = await runNamecardMediaGc(
            { now: NOW, prefix: 'uploads/namecard' },
            {
                database: databaseWith({}),
                storage
            }
        );
        expect(summary.prefixes).toEqual(['uploads/namecard']);
        expect(summary.scanned).toBe(1);
        expect(summary.planned).toBe(1);
    });

    test('refuses unknown cards and conflicting scope arguments', async () => {
        const storage = new FakeStorage(new Map());
        const dependencies = { database: databaseWith({}), storage };
        await expect(
            runNamecardMediaGc({ card: 999 }, dependencies)
        ).rejects.toThrow('Card 999 not found');
        await expect(
            runNamecardMediaGc(
                { card: 801, prefix: 'uploads/namecard' },
                dependencies
            )
        ).rejects.toThrow('either --card or --prefix');
    });

    test('loads the reference set from page rows, including object_queue', async () => {
        // The row's queue is `pending` but the staged object still lives under
        // `live`; both spellings must survive a dry run.
        const liveObject = pageKey(CARD_A, 'live', PAGE_A, VERSION_1);
        const objects = new Map<string, Date>([
            [liveObject, new Date(NOW.getTime() - 30 * DAY)],
            [pageKey(CARD_A, 'pending', PAGE_B, VERSION_2), new Date(NOW.getTime() - 30 * DAY)]
        ]);
        const storage = new FakeStorage(objects);
        const summary = await runNamecardMediaGc(
            { now: NOW },
            {
                database: databaseWith({
                    pages: [
                        {
                            card_id: CARD_A,
                            queue: 'pending',
                            page_id: PAGE_A,
                            object_version: VERSION_1,
                            object_queue: 'live'
                        },
                        {
                            card_id: CARD_A,
                            queue: 'pending',
                            page_id: PAGE_B,
                            object_version: VERSION_2,
                            object_queue: 'pending'
                        }
                    ]
                }),
                storage
            }
        );
        expect(summary.planned).toBe(0);
        expect(summary.kept).toBe(2);
    });
});

describe('parseNamecardMediaGcArguments', () => {
    test('defaults to a dry run over seven days', () => {
        expect(parseNamecardMediaGcArguments([])).toEqual({
            apply: false,
            json: false,
            olderThanMs: DEFAULT_MEDIA_GC_OLDER_THAN_MS,
            card: null,
            prefix: null,
            limit: null
        });
    });

    test('parses every documented flag, inline and spaced', () => {
        expect(
            parseNamecardMediaGcArguments([
                '--apply',
                '--json',
                '--older-than=12h',
                '--card',
                '801',
                '--limit=25'
            ])
        ).toEqual({
            apply: true,
            json: true,
            olderThanMs: 12 * 60 * 60 * 1000,
            card: 801,
            prefix: null,
            limit: 25
        });
        expect(
            parseNamecardMediaGcArguments([
                '--prefix=community/fudaba/cards',
                '--dry-run'
            ])
        ).toMatchObject({
            apply: false,
            prefix: 'community/fudaba/cards'
        });
    });

    test('rejects malformed input', () => {
        expect(() => parseNamecardMediaGcArguments(['--unknown'])).toThrow(
            'Unknown argument'
        );
        expect(() => parseNamecardMediaGcArguments(['--older-than=one-week'])).toThrow(
            'Unsupported duration'
        );
        expect(() => parseNamecardMediaGcArguments(['--limit=0'])).toThrow(
            '--limit must be a positive integer'
        );
        expect(() => parseNamecardMediaGcArguments(['--prefix='])).toThrow(
            '--prefix must not be empty'
        );
        expect(() => parseNamecardMediaGcArguments(['--card'])).toThrow(
            '--card requires a value'
        );
    });

    test('parses durations with or without a unit', () => {
        expect(parseNamecardMediaGcDuration('7d')).toBe(7 * DAY);
        expect(parseNamecardMediaGcDuration('2h')).toBe(2 * 60 * 60 * 1000);
        expect(parseNamecardMediaGcDuration('30m')).toBe(30 * 60 * 1000);
        expect(parseNamecardMediaGcDuration('45s')).toBe(45 * 1000);
        expect(parseNamecardMediaGcDuration('500ms')).toBe(500);
        expect(parseNamecardMediaGcDuration('3')).toBe(3 * DAY);
    });
});
