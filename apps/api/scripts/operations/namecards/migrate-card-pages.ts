/**
 * 命令行入口：真正的迁移实现在 `src/operations/namecard-pages-migration.ts`，
 * 这样构建后的镜像也能执行同一段逻辑（见 scripts/migration/namecard-card-pages.js）。
 */
import { Client } from 'pg';

import { runNamecardPagesMigration } from '@/operations/namecard-pages-migration';

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry-run');
    const cardArg = process.argv.find((arg) => arg.startsWith('--card='));
    const onlyCard = cardArg ? Number(cardArg.slice('--card='.length)) : null;
    const database = new Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
        const summary = await runNamecardPagesMigration({
            dryRun,
            onlyCard,
            database
        });
        console.log(JSON.stringify(summary, null, 1));
    } finally {
        await database.end();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
