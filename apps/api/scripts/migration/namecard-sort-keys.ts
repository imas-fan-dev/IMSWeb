import { parseNodeDatabaseConfig } from '@/config/database';
import { PostgresConnection } from '@/infra/db/postgresql/connection';
import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll } from '@/infra/db/sql/query';
import { namecardSortKey } from '@/utils/sorting/namecard-sort-key';

const DEFAULT_BATCH_SIZE = 500;
const SAMPLE_LIMIT = 10;

export interface NamecardSortKeyBackfillOptions {
    apply: boolean;
    batchSize: number;
    help: boolean;
}

export interface NamecardSortKeyChange {
    id: string;
    producerName: string | null;
    producerReading: string | null;
    sortNameKey: string;
    sortNameBucket: number;
    previousSortNameKey: string;
    previousSortNameBucket: number;
}

export interface NamecardSortKeyBackfillReport {
    mode: 'dry-run' | 'apply';
    scanned: number;
    changed: number;
    applied: number;
    samples: NamecardSortKeyChange[];
}

interface NamecardSortKeyRow {
    id: string;
    producer_name: string | null;
    producer_reading: string | null;
    sort_name_key: string;
    sort_name_bucket: number | string;
}

function positiveInteger(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 5000) {
        throw new Error(`${name} must be an integer between 1 and 5000`);
    }
    return parsed;
}

export function parseArguments(argv: string[]): NamecardSortKeyBackfillOptions {
    const options: NamecardSortKeyBackfillOptions = {
        apply: false,
        batchSize: DEFAULT_BATCH_SIZE,
        help: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') {
            options.apply = true;
        } else if (argument === '--help') {
            options.help = true;
        } else if (argument === '--batch-size') {
            options.batchSize = positiveInteger(argv[index + 1] ?? '', '--batch-size');
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
}

/** 与写入路径同一个生成函数；两列都一致才算「无需改动」，脚本因此可重复执行。 */
export function planNamecardSortKeyChange(
    row: NamecardSortKeyRow
): NamecardSortKeyChange | null {
    const sort = namecardSortKey(row.producer_name, row.producer_reading);
    const previousSortNameBucket = Number(row.sort_name_bucket);
    if (
        row.sort_name_key === sort.key &&
        previousSortNameBucket === sort.bucket
    ) {
        return null;
    }
    return {
        id: row.id,
        producerName: row.producer_name,
        producerReading: row.producer_reading,
        sortNameKey: sort.key,
        sortNameBucket: sort.bucket,
        previousSortNameKey: row.sort_name_key,
        previousSortNameBucket: previousSortNameBucket
    };
}

async function readRows(
    database: SqlDatabase,
    afterId: string | null,
    limit: number
): Promise<NamecardSortKeyRow[]> {
    return queryAll<NamecardSortKeyRow>(
        database,
        `SELECT id, producer_name, producer_reading, sort_name_key, sort_name_bucket
           FROM public.fudaba_cards
          WHERE deleted_at IS NULL${afterId === null ? '' : ' AND id > ?'}
          ORDER BY id
          LIMIT ?`,
        afterId === null ? [limit] : [afterId, limit]
    );
}

async function applyChanges(
    database: ManagedSqlDatabase,
    changes: readonly NamecardSortKeyChange[]
): Promise<void> {
    if (changes.length === 0) return;
    await database.transaction(async (transaction) => {
        for (const change of changes) {
            await executeSql(
                transaction,
                `UPDATE public.fudaba_cards
                    SET sort_name_key=?, sort_name_bucket=?
                  WHERE id=?`,
                [change.sortNameKey, change.sortNameBucket, change.id]
            );
        }
    });
}

/**
 * 遍历未删除名片并重算两列。默认 dry-run；`apply` 为 true 时每批一个事务，
 * 中途失败只回滚当前批。返回值同时给命令行摘要与测试断言用。
 */
export async function executeNamecardSortKeyBackfill(
    database: ManagedSqlDatabase,
    options: { apply: boolean; batchSize?: number }
): Promise<NamecardSortKeyBackfillReport> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const report: NamecardSortKeyBackfillReport = {
        mode: options.apply ? 'apply' : 'dry-run',
        scanned: 0,
        changed: 0,
        applied: 0,
        samples: []
    };
    let afterId: string | null = null;
    for (;;) {
        const rows = await readRows(database, afterId, batchSize);
        if (rows.length === 0) break;
        afterId = rows[rows.length - 1].id;
        report.scanned += rows.length;
        const changes = rows.flatMap((row) => {
            const change = planNamecardSortKeyChange(row);
            return change === null ? [] : [change];
        });
        if (changes.length === 0) continue;
        report.changed += changes.length;
        for (const change of changes) {
            if (report.samples.length >= SAMPLE_LIMIT) break;
            report.samples.push(change);
        }
        if (options.apply) {
            await applyChanges(database, changes);
            report.applied += changes.length;
        }
    }
    return report;
}

function helpText(): string {
    return [
        'Usage: pnpm run migration:namecard-sort-keys -- [--apply] [--batch-size N]',
        '',
        'Recomputes fudaba_cards.sort_name_key / sort_name_bucket from the stored',
        'producer name and reading. The command is a dry run unless --apply is given.',
        '',
        'Options:',
        '  --apply         Write the recomputed keys in per-batch transactions',
        '  --batch-size N  Rows read per batch (default 500, max 5000)',
        '  --help          Show this help text'
    ].join('\n');
}

async function main(): Promise<void> {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }
    const database = PostgresConnection.create(
        parseNodeDatabaseConfig(process.env)
    );
    try {
        const report = await executeNamecardSortKeyBackfill(database, options);
        process.stdout.write(`${JSON.stringify(report)}\n`);
    } finally {
        await database.close();
    }
}

if (require.main === module) {
    void main().catch((error: unknown) => {
        process.stderr.write(
            `Namecard sort key backfill failed: ${
                error instanceof Error ? error.message : 'unknown error'
            }\n`
        );
        process.exitCode = 1;
    });
}
