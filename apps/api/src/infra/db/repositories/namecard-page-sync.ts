import { executeSql, queryAll } from '@/infra/db/sql/query';
import type { SqlDatabase } from '@/infra/db/sql/database';
import type { FudabaCardPageWrite } from '@/ports/repositories';
import { parseCardPageObjectKey } from '@/utils/storage/business-object-keys';

/**
 * Synchronizes one card-page queue with the submitted display order.
 *
 * The temporary order offset avoids colliding with the
 * `(card_id, queue, display_order)` unique constraint while pages swap.
 * Rows outside the submitted set are only removed when every submitted key
 * parses into the current queue layout; legacy/mixed keys are kept and
 * appended after the parsed pages for the migration backfill.
 */
export async function syncNamecardPages(
    database: SqlDatabase,
    cardId: string,
    queue: 'live' | 'pending',
    orderedKeys: readonly (string | null)[],
    written: readonly FudabaCardPageWrite[],
    updatedAt: string,
): Promise<void> {
    const parsed = orderedKeys
        .map((key) => (key ? parseCardPageObjectKey(key) : null))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .filter(
            (entry) =>
                entry.queue === queue ||
                (queue === 'pending' && entry.queue === 'live') ||
                // Direct admin approval clears review_status and promotes the
                // displayed pending set into live. Its page rows still carry a
                // pending object key until this sync rewrites them.
                (queue === 'live' && entry.queue === 'pending'),
        );
    if (parsed.length === 0) return;
    const byPage = new Map(written.map((page) => [page.pageId, page]));
    const existingRows = await queryAll<{
        queue: 'live' | 'pending';
        page_id: string;
        object_version: string;
        width: number;
        height: number;
    }>(
        database,
        `SELECT queue, page_id, object_version, width, height
           FROM fudaba_card_pages
          WHERE card_id=?`,
        [cardId],
    );
    const existingByPage = new Map(
        existingRows.map((page) => [
            `${page.queue}:${page.page_id}`,
            {
                pageId: page.page_id,
                objectVersion: page.object_version,
                width: Number(page.width),
                height: Number(page.height),
            },
        ]),
    );
    const objectQueueFor = (entry: NonNullable<ReturnType<typeof parseCardPageObjectKey>>) =>
        queue === 'live' ? 'live' : entry.queue;
    await executeSql(
        database,
        `UPDATE fudaba_card_pages SET display_order = display_order + 1000
          WHERE card_id=? AND queue=?`,
        [cardId, queue],
    );
    const ids = parsed.map((entry) => entry.pageId);
    // A pending revision owns its complete page set: unchanged pages keep
    // object_queue='live', changed pages use object_queue='pending'. The queue
    // still stores every visible position, so roles can be derived from it.
    if (ids.length > 0) {
        await executeSql(
            database,
            `DELETE FROM fudaba_card_pages
              WHERE card_id=? AND queue=?
                AND page_id NOT IN (${ids.map(() => '?').join(',')})`,
            [cardId, queue, ...ids],
        );
    } else {
        await executeSql(
            database,
            `DELETE FROM fudaba_card_pages
              WHERE card_id=? AND queue=?`,
            [cardId, queue],
        );
    }
    for (const [index, entry] of parsed.entries()) {
        const page =
            byPage.get(entry.pageId) ??
            existingByPage.get(`${entry.queue}:${entry.pageId}`);
        const objectQueue = objectQueueFor(entry);
        if (page) {
            await executeSql(
                database,
                `INSERT INTO fudaba_card_pages
                 (card_id, queue, page_id, display_order, object_version,
                  object_queue, width, height, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (card_id, queue, page_id) DO UPDATE SET
                   display_order=EXCLUDED.display_order,
                   object_version=EXCLUDED.object_version,
                   object_queue=EXCLUDED.object_queue,
                   width=EXCLUDED.width, height=EXCLUDED.height,
                   updated_at=EXCLUDED.updated_at`,
                [
                    cardId,
                    queue,
                    entry.pageId,
                    index + 1,
                    page.objectVersion,
                    objectQueue,
                    page.width,
                    page.height,
                    updatedAt,
                    updatedAt,
                ],
            );
        } else {
            await executeSql(
                database,
                `UPDATE fudaba_card_pages
                    SET display_order=?, object_queue=?, updated_at=?
                  WHERE card_id=? AND queue=? AND page_id=?`,
                [index + 1, objectQueue, updatedAt, cardId, queue, entry.pageId],
            );
        }
    }
    const leftovers = await queryAll<{ page_id: string }>(
        database,
        `SELECT page_id FROM fudaba_card_pages
          WHERE card_id=? AND queue=? AND display_order>=1000
          ORDER BY display_order`,
        [cardId, queue],
    );
    let nextOrder = parsed.length + 1;
    for (const row of leftovers) {
        await executeSql(
            database,
            `UPDATE fudaba_card_pages SET display_order=?, updated_at=?
              WHERE card_id=? AND queue=? AND page_id=?`,
            [nextOrder, updatedAt, cardId, queue, row.page_id],
        );
        nextOrder += 1;
    }
}
