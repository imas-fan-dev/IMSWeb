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

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry-run');
    const services = await createNodeServices();
    const storage = services.storage;
    if (!storage?.publish) throw new Error('Object storage publication is unavailable');

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const cards = await client.query<{
            front_object_key: string;
            back_object_key: string | null;
        }>(`SELECT front_object_key, back_object_key
            FROM fudaba_cards
            WHERE publication_status='published' AND deleted_at IS NULL`);
        const middles = await client.query<{ object_key: string }>(
            `SELECT media.object_key
             FROM fudaba_card_media media
             JOIN fudaba_cards card ON card.id=media.card_id
             WHERE card.publication_status='published' AND card.deleted_at IS NULL`
        );
        const keys = new Set<string>();
        for (const row of cards.rows) {
            if (row.front_object_key) keys.add(row.front_object_key);
            if (row.back_object_key) keys.add(row.back_object_key);
        }
        for (const row of middles.rows) keys.add(row.object_key);

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
            cards: cards.rowCount,
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
