import { beforeEach, expect, it, vi } from 'vitest';
import { runNamecardPagesMigration } from '@/operations/namecard-pages-migration';
import { cardPageObjectKey } from '@/utils/storage/business-object-keys';

const mocks = vi.hoisted(() => ({
    createNodeServices: vi.fn(),
    storeCardPage: vi.fn(),
    listCardPages: vi.fn(),
    replaceCardPages: vi.fn(),
    get: vi.fn(),
    validate: vi.fn(),
    publish: vi.fn()
}));
vi.mock('@/runtime/node-services', () => ({ createNodeServices: mocks.createNodeServices }));
vi.mock('@/domains/community/fudaba/cards/artwork-store', () => ({ storeCardPage: mocks.storeCardPage }));

const cardId = 'existing-card';
const version = '00000000-0000-4000-8000-000000000001';
const page = (n: number) => ({
    page_id: `page-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    object_version: version,
    display_order: n,
    width: 900,
    height: 600
});
const key = (n: number, queue = 'live') => cardPageObjectKey(cardId, queue, page(n).page_id, version);

function database(overrides: Record<string, unknown> = {}, middles: string[] = []) {
    const card = {
        id: cardId, card_number: 931, publication_status: 'published',
        front_object_key: key(1), back_object_key: key(2),
        pending_front_object_key: null, pending_back_object_key: null,
        pending_middle_object_keys: null, ...overrides
    };
    const queries = vi.fn(async (sql: string): Promise<unknown[]> =>
        sql.includes('FROM fudaba_cards')
            ? [card]
            : sql.includes('FROM fudaba_card_media')
                ? middles.map(object_key => ({ card_id: cardId, object_key }))
                : []
    );
    return {
        queries,
        async query<T>(sql: string) {
            return { rows: await queries(sql) as T[] };
        }
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.createNodeServices.mockResolvedValue({
        fudaba: { listCardPages: mocks.listCardPages, replaceCardPages: mocks.replaceCardPages },
        storage: { get: mocks.get, publish: mocks.publish },
        images: { validate: mocks.validate }
    });
    mocks.get.mockResolvedValue({ body: new Uint8Array([1]), contentType: 'image/webp' });
    mocks.validate.mockResolvedValue({ width: 900, height: 600 });
    mocks.storeCardPage.mockResolvedValue({ pageId: page(9).page_id, version, width: 900, height: 600, key: key(9) });
});

it('preserves all existing live pages when compatibility columns contain only a subset', async () => {
    const db = database();
    mocks.listCardPages.mockResolvedValue({ live: [page(1), page(2), page(3), page(4)], pending: [] });
    const summary = await runNamecardPagesMigration({ database: db });
    expect(summary.results).toEqual([{ cardNumber: 931, live: 4, pending: 0, copied: 0, skipped: [] }]);
    expect(mocks.replaceCardPages).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(db.queries.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(false);
});

it('does not resurrect legacy middle pages after a migrated card was edited', async () => {
    const db = database({}, ['legacy/middle.webp']);
    mocks.listCardPages.mockResolvedValue({ live: [page(1), page(3), page(2)], pending: [] });
    const summary = await runNamecardPagesMigration({ database: db, dryRun: true });
    expect(summary.copied).toBe(0);
    expect(summary.results[0]).toMatchObject({ live: 3, skipped: [] });
    expect(mocks.get).not.toHaveBeenCalled();
});

it('does not resurrect a deleted boundary page from a stale compatibility column', async () => {
    const db = database();
    mocks.listCardPages.mockResolvedValue({ live: [page(3), page(1)], pending: [] });
    const summary = await runNamecardPagesMigration({ database: db });
    expect(summary.results[0]).toMatchObject({ live: 2, copied: 0, skipped: [] });
    expect(mocks.replaceCardPages).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
});

it('finishes a partially migrated queue without losing its legacy back page', async () => {
    const db = database({ back_object_key: 'legacy/back.webp' });
    mocks.listCardPages.mockResolvedValue({ live: [page(1)], pending: [] });
    const summary = await runNamecardPagesMigration({ database: db });
    expect(summary.copied).toBe(1);
    expect(summary.results[0]).toMatchObject({ live: 2, skipped: [] });
    expect(mocks.get).toHaveBeenCalledWith('legacy/back.webp');
    expect(mocks.replaceCardPages).toHaveBeenCalledWith(cardId, 'live', [
        { pageId: page(1).page_id, objectVersion: version, width: 900, height: 600 },
        { pageId: page(9).page_id, objectVersion: version, width: 900, height: 600 }
    ], expect.any(String));
});

it('preserves pending page order and additions on repeated deployment', async () => {
    const db = database({ pending_front_object_key: key(1, 'pending'), pending_back_object_key: key(2, 'pending') });
    mocks.listCardPages.mockResolvedValue({ live: [page(1), page(2)], pending: [page(1), page(3), page(4), page(2)] });
    const summary = await runNamecardPagesMigration({ database: db });
    expect(summary.results[0]).toMatchObject({ live: 2, pending: 4, copied: 0, skipped: [] });
    expect(mocks.replaceCardPages).not.toHaveBeenCalled();
    expect(db.queries.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(false);
});
