#!/usr/bin/env node
/**
 * 名片图片统一布局的数据迁移：把旧对象的字节复制到新布局并写页面行。
 * 与 `apps/api/src/operations/namecard-pages-migration.ts` 共用实现，
 * 部署脚本在 schema 迁移之后调用（幂等，可重复执行）。
 *
 *   node apps/api/scripts/migration/namecard-card-pages.js [--dry-run] [--card=801]
 */
'use strict';

const path = require('node:path');
const { Client } = require('pg');

const { runNamecardPagesMigration } = require(
    path.resolve(__dirname, '../../dist/server/operations/namecard-pages-migration.js')
);

async function main() {
    const args = process.argv.slice(2);
    const cardArg = args.find((arg) => arg.startsWith('--card='));
    const database = new Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
        const summary = await runNamecardPagesMigration({
            dryRun: args.includes('--dry-run'),
            onlyCard: cardArg ? Number(cardArg.slice('--card='.length)) : null,
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
