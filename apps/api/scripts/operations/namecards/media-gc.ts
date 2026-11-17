/**
 * 命令行入口：`ops:namecards:media-gc`。
 *
 * 实现在 `src/operations/namecard-media-gc.ts`（构建后的镜像也能跑同一段逻辑）。
 * 默认 dry-run：只打印会删除的清单；加 `--apply` 才真正删除。
 *
 *   pnpm --filter @imsweb/api ops:namecards:media-gc -- --json
 *   pnpm --filter @imsweb/api ops:namecards:media-gc -- --prefix=uploads/namecard
 *   pnpm --filter @imsweb/api ops:namecards:media-gc -- --apply
 */
import { Client } from 'pg';

import { createNodeServices } from '@/runtime/node-services';
import {
    parseNamecardMediaGcArguments,
    runNamecardMediaGc,
    type NamecardMediaGcSummary
} from '@/operations/namecard-media-gc';

function reasonTally(summary: NamecardMediaGcSummary): string[] {
    const tallies = new Map<string, number>();
    for (const entry of summary.entries) {
        if (entry.action === 'delete') continue;
        const label = `${entry.action}:${entry.reason}`;
        tallies.set(label, (tallies.get(label) ?? 0) + 1);
    }
    return [...tallies.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, count]) => `${label}=${count}`);
}

function printSummary(summary: NamecardMediaGcSummary): void {
    console.log(
        `${summary.dryRun ? 'dry-run' : 'apply'}: scanned=${summary.scanned} ` +
            `kept=${summary.kept} skipped=${summary.skipped} ` +
            `planned=${summary.planned} deleted=${summary.deleted} failed=${summary.failed}`
    );
    console.log(`prefixes: ${summary.prefixes.join(', ')}`);
    console.log(
        `older-than: ${summary.olderThanMs / (24 * 60 * 60 * 1000)}d`
    );
    for (const entry of summary.entries) {
        if (entry.action === 'delete') {
            console.log(`DELETE ${entry.key} (${entry.reason})`);
        }
    }
    const tally = reasonTally(summary);
    if (tally.length) console.log(`not deleted: ${tally.join(' ')}`);
    for (const failure of summary.failures) {
        console.error(`FAILED ${failure.key}: ${failure.message}`);
    }
    if (summary.dryRun) {
        console.log('dry run: re-run with --apply to delete the listed keys');
    }
}

async function main(): Promise<void> {
    const options = parseNamecardMediaGcArguments(
        process.argv.slice(2).filter((arg) => arg !== '--')
    );
    const services = await createNodeServices();
    const database = new Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
        const summary = await runNamecardMediaGc(
            {
                apply: options.apply,
                olderThanMs: options.olderThanMs,
                card: options.card,
                prefix: options.prefix,
                limit: options.limit
            },
            {
                database,
                storage: services.storage,
                cleanup: {
                    storage: services.storage,
                    compensation: services.compensation,
                    catalog: services.catalog
                }
            }
        );
        if (options.json) console.log(JSON.stringify(summary, null, 1));
        else printSummary(summary);
        if (summary.failed > 0) process.exitCode = 1;
    } finally {
        await database.end();
    }
}

/**
 * `process.exit` does not wait for piped stdout/stderr, and a GC report is long
 * enough to be truncated. Drain both streams before leaving.
 */
async function flushOutput(): Promise<void> {
    await Promise.all([
        new Promise<void>((resolve) => process.stdout.write('', () => resolve())),
        new Promise<void>((resolve) => process.stderr.write('', () => resolve()))
    ]);
}

main()
    .then(async (code) => {
        await flushOutput();
        process.exit(code);
    })
    .catch(async (error) => {
        console.error(error instanceof Error ? error.message : error);
        await flushOutput();
        process.exit(1);
    });
