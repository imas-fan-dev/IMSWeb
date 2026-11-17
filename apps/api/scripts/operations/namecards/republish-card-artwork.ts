/**
 * 修复「已发布卡片的线上图仍是私有对象」的历史数据。
 *
 * 公开墙按公开地址取图：一张卡的任一线上图解析不出公开地址，整页请求都会失败，
 * 表现是墙上和用户主页同时看不到名片。审核通过后的新版本曾经只发布了旧 key，
 * 这批数据需要重新发布一次。
 *
 * 用法：
 *   pnpm run ops:namecards:republish
 *   pnpm run ops:namecards:republish -- --dry-run
 */
import { Client } from 'pg';

import { createNodeServices } from '@/runtime/node-services';
import { cardPageObjectKey } from '@/utils/storage/business-object-keys';

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry-run');
    const services = await createNodeServices();
    const storage = services.storage;
    if (!storage?.publish) throw new Error('Object storage publication is unavailable');

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const pages = await client.query<{
            card_id: string;
            page_id: string;
            object_version: string;
            object_queue: 'live' | 'pending';
        }>(`SELECT page.card_id, page.page_id, page.object_version,
                  page.object_queue
             FROM fudaba_card_pages page
             JOIN fudaba_cards card ON card.id=page.card_id
            WHERE page.queue='live'
              AND card.publication_status='published'
              AND card.deleted_at IS NULL`);
        const keys = new Set<string>();
        for (const row of pages.rows) {
            keys.add(
                cardPageObjectKey(
                    row.card_id,
                    row.object_queue,
                    row.page_id,
                    row.object_version
                )
            );
        }

        let published = 0;
        const failures: Array<{ key: string; message: string }> = [];
        for (const key of keys) {
            if (dryRun) continue;
            try {
                await storage.publish(key);
                published += 1;
            } catch (error) {
                failures.push({
                    key,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        }
        console.log(JSON.stringify({
            dryRun,
            cards: new Set(pages.rows.map((row) => row.card_id)).size,
            keys: keys.size,
            published,
            failures
        }, null, 1));
    } finally {
        await client.end();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
