import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseNodeDatabaseConfig } from '@/config/database';
import {
    renderArticleBody,
    validateArticleBody
} from '@/domains/content/editorial/article-body';
import { PostgresConnection } from '@/infra/db/postgresql/connection';
import type {
    ManagedSqlDatabase,
    SqlDatabase
} from '@/infra/db/sql/database';
import { executeSql, queryAll } from '@/infra/db/sql/query';

const projectRoot = path.resolve(__dirname, '../../../..');
const advisoryLockName = 'imsweb-cms-article-title-backfill';

export interface CmsArticleTitleBackfillOptions {
    apply: boolean;
    help: boolean;
    report: string;
}

export interface SplitCmsArticleTitle {
    bodyText: string;
    title: string;
}

export interface PrependedArticleBody {
    bodyChanged: boolean;
    bodyHtml: string;
    bodyJson: Record<string, unknown>;
}

interface ArticleRow {
    body_html: string;
    body_json: Record<string, unknown>;
    has_event: boolean;
    id: number;
    revision: number;
    title: string;
}

interface PlannedCandidate {
    after: {
        bodyHtml: string;
        bodyJson: Record<string, unknown>;
        revision: number;
        title: string;
    };
    before: {
        bodyHtml: string;
        bodyJson: Record<string, unknown>;
        revision: number;
        title: string;
    };
    bodyChanged: boolean;
    eventLinked: boolean;
    id: number;
    prependedBody: string;
}

interface PlanningError {
    id: number;
    reason: string;
}

interface BackfillPlan {
    candidates: PlannedCandidate[];
    errors: PlanningError[];
    matched: number;
    scanned: number;
    unmatchedIds: number[];
}

export type CmsArticleTitleBackfillRecordStatus =
    | 'conflict'
    | 'rolled-back'
    | 'updated'
    | 'would-update';

export interface CmsArticleTitleBackfillReport {
    apply: boolean;
    conflicts: PlanningError[];
    counts: {
        candidates: number;
        conflicts: number;
        errors: number;
        scanned: number;
        unmatched: number;
        updated: number;
        wouldUpdated: number;
    };
    errors: PlanningError[];
    generatedAt: string;
    mode: 'apply' | 'dry-run';
    records: Array<PlannedCandidate & { status: CmsArticleTitleBackfillRecordStatus }>;
    status: 'aborted' | 'completed';
    unmatchedIds: number[];
}

function recordStatus(
    candidateId: number,
    apply: boolean,
    successfulApply: boolean,
    conflictId?: number
): CmsArticleTitleBackfillRecordStatus {
    if (successfulApply) return 'updated';
    if (!apply) return 'would-update';
    if (conflictId === candidateId) return 'conflict';
    return 'rolled-back';
}

class BackfillConflictError extends Error {
    constructor(readonly articleId: number) {
        super(`Article ${articleId} changed while the backfill was running`);
    }
}

class BackfillPlanningError extends Error {}

export function parseCmsArticleTitleBackfillArguments(
    argv: string[]
): CmsArticleTitleBackfillOptions {
    let apply = false;
    let help = false;
    let reportWasSpecified = false;
    let report = path.join(
        projectRoot,
        'data/migration/cms-article-title-backfill-dry-run.json'
    );

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') {
            apply = true;
            if (!reportWasSpecified) {
                report = path.join(
                    projectRoot,
                    'data/migration/cms-article-title-backfill.json'
                );
            }
        } else if (argument === '--report') {
            const value = argv[++index];
            if (!value || value.startsWith('--')) {
                throw new Error('--report requires a path');
            }
            report = path.resolve(projectRoot, value);
            reportWasSpecified = true;
        } else if (argument === '--help' || argument === '-h') {
            help = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    return { apply, help, report };
}

export function splitCmsArticleTitle(value: string): SplitCmsArticleTitle | null {
    const normalized = value.trim();
    if (!normalized.startsWith('【')) return null;
    const closingIndex = normalized.indexOf('】', 1);
    if (closingIndex < 0) return null;

    const title = normalized.slice(1, closingIndex).trim();
    if (!title) return null;

    return {
        title,
        bodyText: normalized.slice(closingIndex + 1).trim()
    };
}

function textParagraph(value: string): Record<string, unknown> {
    const lines = value.replace(/\r\n?/g, '\n').split('\n');
    const content: Array<Record<string, unknown>> = [];
    lines.forEach((line, index) => {
        if (line) content.push({ type: 'text', text: line });
        if (index < lines.length - 1) content.push({ type: 'hardBreak' });
    });
    return { type: 'paragraph', content };
}

export function prependTextToArticleBody(
    bodyJson: unknown,
    bodyHtml: string,
    bodyText: string
): PrependedArticleBody {
    const current = validateArticleBody(bodyJson).document;
    const currentContent = current.content;
    if (!Array.isArray(currentContent)) {
        throw new Error('Article body content must be an array');
    }
    if (!bodyText) {
        return {
            bodyChanged: false,
            bodyJson: current,
            bodyHtml
        };
    }

    const bodyJsonWithPrefix = {
        ...current,
        content: [textParagraph(bodyText), ...currentContent]
    };
    const validated = validateArticleBody(bodyJsonWithPrefix).document;
    return {
        bodyChanged: true,
        bodyJson: validated,
        bodyHtml: renderArticleBody(validated)
    };
}

function planningErrorReason(error: unknown): string {
    return error instanceof Error ? error.message : 'Article body conversion failed';
}

function planBackfill(rows: ArticleRow[]): BackfillPlan {
    const candidates: PlannedCandidate[] = [];
    const errors: PlanningError[] = [];
    const unmatchedIds: number[] = [];
    let matched = 0;

    for (const row of rows) {
        const split = splitCmsArticleTitle(row.title);
        if (!split) {
            unmatchedIds.push(row.id);
            continue;
        }
        matched += 1;
        try {
            const body = prependTextToArticleBody(
                row.body_json,
                row.body_html,
                split.bodyText
            );
            candidates.push({
                id: row.id,
                eventLinked: row.has_event,
                prependedBody: split.bodyText,
                bodyChanged: body.bodyChanged,
                before: {
                    title: row.title,
                    bodyJson: row.body_json,
                    bodyHtml: row.body_html,
                    revision: row.revision
                },
                after: {
                    title: split.title,
                    bodyJson: body.bodyJson,
                    bodyHtml: body.bodyHtml,
                    revision: row.revision + 1
                }
            });
        } catch (error) {
            errors.push({ id: row.id, reason: planningErrorReason(error) });
        }
    }

    return {
        candidates,
        errors,
        matched,
        scanned: rows.length,
        unmatchedIds
    };
}

async function readArticles(
    database: SqlDatabase,
    lockRows: boolean
): Promise<ArticleRow[]> {
    return queryAll<ArticleRow>(database,
        `SELECT a.id, a.title, a.body_json, a.body_html, a.revision,
                EXISTS (SELECT 1 FROM events e WHERE e.article_id=a.id) AS has_event
         FROM articles a
         ORDER BY a.id${lockRows ? '\n         FOR UPDATE OF a' : ''}`
    );
}

function reportFromPlan(
    plan: BackfillPlan,
    apply: boolean,
    options: {
        conflict?: PlanningError;
        operationError?: PlanningError;
        status: 'aborted' | 'completed';
    }
): CmsArticleTitleBackfillReport {
    const successfulApply = apply && options.status === 'completed';
    const conflicts = options.conflict ? [options.conflict] : [];
    const errors = [...plan.errors];
    if (options.operationError) errors.push(options.operationError);
    return {
        generatedAt: new Date().toISOString(),
        apply,
        mode: apply ? 'apply' : 'dry-run',
        status: options.status,
        counts: {
            scanned: plan.scanned,
            unmatched: plan.unmatchedIds.length,
            candidates: plan.matched,
            wouldUpdated: apply ? 0 : plan.candidates.length,
            updated: successfulApply ? plan.candidates.length : 0,
            conflicts: conflicts.length,
            errors: errors.length
        },
        conflicts,
        unmatchedIds: plan.unmatchedIds,
        records: plan.candidates.map((candidate) => ({
            ...candidate,
            status: recordStatus(
                candidate.id,
                apply,
                successfulApply,
                options.conflict?.id
            )
        })),
        errors
    };
}

function emptyPlan(): BackfillPlan {
    return {
        candidates: [],
        errors: [],
        matched: 0,
        scanned: 0,
        unmatchedIds: []
    };
}

async function updateCandidate(
    database: SqlDatabase,
    candidate: PlannedCandidate
): Promise<void> {
    const article = await executeSql(database,
        `UPDATE articles
         SET title=?, body_json=?::jsonb, body_html=?,
             revision=revision+1, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND title=? AND revision=?
           AND body_json=?::jsonb AND body_html=?`,
        [
            candidate.after.title,
            JSON.stringify(candidate.after.bodyJson),
            candidate.after.bodyHtml,
            candidate.id,
            candidate.before.title,
            candidate.before.revision,
            JSON.stringify(candidate.before.bodyJson),
            candidate.before.bodyHtml
        ]
    );
    if (article.meta.changes !== 1) {
        throw new BackfillConflictError(candidate.id);
    }

    if (!candidate.eventLinked) return;
    const event = await executeSql(database,
        'UPDATE events SET title=? WHERE article_id=?',
        [candidate.after.title, candidate.id]
    );
    if (event.meta.changes !== 1) {
        throw new BackfillConflictError(candidate.id);
    }
}

export async function executeCmsArticleTitleBackfill(
    database: ManagedSqlDatabase,
    apply: boolean
): Promise<CmsArticleTitleBackfillReport> {
    if (!apply) {
        const plan = planBackfill(await readArticles(database, false));
        return reportFromPlan(plan, false, {
            status: plan.errors.length ? 'aborted' : 'completed'
        });
    }

    let plan = emptyPlan();
    let activeArticleId: number | undefined;
    try {
        await database.transaction(async (transaction) => {
            await executeSql(
                transaction,
                'SELECT pg_advisory_xact_lock(hashtext(?))',
                [advisoryLockName]
            );
            plan = planBackfill(await readArticles(transaction, true));
            if (plan.errors.length) throw new BackfillPlanningError();
            for (const candidate of plan.candidates) {
                activeArticleId = candidate.id;
                await updateCandidate(transaction, candidate);
            }
        });
        return reportFromPlan(plan, true, { status: 'completed' });
    } catch (error) {
        if (error instanceof BackfillConflictError) {
            return reportFromPlan(plan, true, {
                status: 'aborted',
                conflict: {
                    id: error.articleId,
                    reason: error.message
                }
            });
        }
        if (error instanceof BackfillPlanningError) {
            return reportFromPlan(plan, true, { status: 'aborted' });
        }
        return reportFromPlan(plan, true, {
            status: 'aborted',
            operationError: {
                id: activeArticleId ?? 0,
                reason: 'Database operation failed'
            }
        });
    }
}

function temporaryReportPath(target: string): string {
    return `${target}.tmp-${process.pid}-${randomUUID()}`;
}

export async function prepareCmsArticleTitleBackfillReport(
    target: string
): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const probe = temporaryReportPath(target);
    try {
        await fs.writeFile(probe, '', { flag: 'wx', mode: 0o600 });
    } finally {
        await fs.rm(probe, { force: true });
    }
}

export async function writeCmsArticleTitleBackfillReport(
    target: string,
    report: CmsArticleTitleBackfillReport
): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = temporaryReportPath(target);
    try {
        await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600
        });
        await fs.rename(temporary, target);
        await fs.chmod(target, 0o600);
    } finally {
        await fs.rm(temporary, { force: true });
    }
}

export function cmsArticleTitleBackfillSummary(
    report: CmsArticleTitleBackfillReport,
    reportPath: string
): string {
    return JSON.stringify({
        status: report.status,
        mode: report.mode,
        counts: report.counts,
        report: reportPath
    });
}

function helpText(): string {
    return [
        'Usage: pnpm run migration:cms-article-titles -- [--apply] [--report PATH]',
        '',
        'Splits a leading Chinese-bracket title from each matching CMS article.',
        'The command is a dry run unless --apply is provided.',
        '',
        'Options:',
        '  --apply        Write all planned changes in one transaction',
        '  --report PATH  Write the restricted JSON report to PATH',
        '  --help         Show this help text'
    ].join('\n');
}

async function main(): Promise<void> {
    const options = parseCmsArticleTitleBackfillArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }

    await prepareCmsArticleTitleBackfillReport(options.report);
    const database = PostgresConnection.create(parseNodeDatabaseConfig(process.env));
    try {
        const report = await executeCmsArticleTitleBackfill(database, options.apply);
        await writeCmsArticleTitleBackfillReport(options.report, report);
        process.stdout.write(`${cmsArticleTitleBackfillSummary(report, options.report)}\n`);
        if (report.status === 'aborted') {
            process.stderr.write(
                `CMS article title backfill aborted: ${report.counts.conflicts} conflict(s), ` +
                `${report.counts.errors} error(s).\n`
            );
            process.exitCode = 1;
        }
    } finally {
        await database.close();
    }
}

if (require.main === module) {
    void main().catch(() => {
        process.stderr.write('CMS article title backfill failed.\n');
        process.exitCode = 1;
    });
}
