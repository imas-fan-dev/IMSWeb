import fs from 'node:fs/promises';
import path from 'node:path';
import {
    emptyArticleDocument,
    legacyHtmlToArticleDocument,
    renderArticleBody
} from '@/domains/editorial/content';
import { readInformationIndex } from '@/domains/information/content-store';
import { closeNodeServices, resolveNodeServices } from '@/runtime/node-services';

interface Options {
    apply: boolean;
    report: string;
}

const projectRoot = path.resolve(__dirname, '../../../..');

function parseArguments(argv: string[]): Options {
    let apply = false;
    let report = path.join(projectRoot, 'data/migration/information-to-community-posts-dry-run.json');
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') {
            apply = true;
            report = path.join(projectRoot, 'data/migration/information-to-community-posts.json');
        } else if (argument === '--report') {
            const value = argv[++index];
            if (!value || value.startsWith('--')) throw new Error('--report requires a path');
            report = path.resolve(projectRoot, value);
        } else if (argument === '--help' || argument === '-h') {
            console.log([
                'Usage: pnpm run migration:information-posts -- [--apply] [--report PATH]',
                '',
                'Reads the legacy Information index and packages every card as a community post.',
                'Without --apply, the command only validates and writes a dry-run report.'
            ].join('\n'));
            process.exitCode = 0;
            return { apply: false, report };
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return { apply, report };
}

async function writeReport(target: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function main(): Promise<void> {
    const options = parseArguments(process.argv.slice(2));
    if (process.exitCode === 0 && process.argv.includes('--help')) return;
    const runtime = await resolveNodeServices();
    if (!runtime.storage || !runtime.editorial) throw new Error('Object storage and editorial repository are required');
    try {
        const { index } = await readInformationIndex(runtime.storage);
        const plan = index.cards.map((card) => {
            const bodyJson = card.contentType === 'html'
                ? legacyHtmlToArticleDocument(card.html || '')
                : emptyArticleDocument;
            return {
                legacyInformationId: card.id,
                category: card.category,
                title: card.title,
                coverUrl: card.image,
                sourceUrl: card.contentType === 'external' ? card.link : null,
                bodyJson,
                bodyHtml: renderArticleBody(bodyJson),
                publishedAt: card.updatedAt
            };
        });
        const results = options.apply
            ? await Promise.all(plan.map((entry) => runtime.editorial!.importLegacyInformationPost(entry)))
            : [];
        const report = {
            generatedAt: new Date().toISOString(),
            apply: options.apply,
            sourceCards: plan.length,
            planned: plan.map((entry) => ({
                id: entry.legacyInformationId,
                title: entry.title,
                category: entry.category,
                content: entry.sourceUrl ? 'source-url' : 'rich-text'
            })),
            imported: results.filter((result) => result.imported).length,
            unchanged: results.filter((result) => !result.imported).length,
            postIds: results.map((result) => result.id)
        };
        await writeReport(options.report, report);
        if (options.apply && results.length !== plan.length) {
            throw new Error('Information import verification failed: result count differs from source card count');
        }
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
        await closeNodeServices();
    }
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
});
