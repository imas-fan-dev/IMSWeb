import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
    resolveNodeServices,
    closeNodeServices,
} from '../../src/runtime/node-services';
import { saveFudabaTinyPreview } from '../../src/domains/community/fudaba/card-preview';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const mode =
        args.find((arg) => arg.startsWith('--mode='))?.slice(7) ?? 'all';
    const webUrl =
        args.find((arg) => arg.startsWith('--web-url='))?.slice(10) ??
        'http://127.0.0.1:5173';
    if (!['all', 'notes', 'previews'].includes(mode))
        throw new Error('Use --mode=all|notes|previews');
    const runtime = await resolveNodeServices();
    const repository = runtime.fudaba?.messages;
    if (!repository) throw new Error('Fudaba database is unavailable');
    const report = {
        apply,
        mode,
        notesChecked: 0,
        notesChanged: 0,
        conflicts: 0,
        previewsChecked: 0,
        previewsWritten: 0,
        previewsUnavailable: 0,
    };
    let browser: { close(): Promise<void> } | undefined;
    try {
        if (mode !== 'previews') {
            // Resolve the existing Web test runtime instead of adding a second browser dependency.
            const requireWeb = createRequire(
                resolve(__dirname, '../../../web/package.json')
            );
            const chromium = requireWeb('@playwright/test').chromium;
            const launched = await chromium.launch({ headless: true });
            browser = launched;
            const page = await launched.newPage();
            await page.goto(webUrl, { waitUntil: 'networkidle' });
            for (let pass = 0; pass < 3; pass++) {
                let after = '';
                let conflicts = 0;
                for (;;) {
                    const rows = await repository.listLayoutBackfill(
                        after,
                        100
                    );
                    if (!rows.length) break;
                    for (const row of rows) {
                        const height: number = await page.evaluate(
                            async (content: string) => {
                                const modulePath =
                                    '/app/pages/community/exchange/use-message-paper-height.ts';
                                const measurement = await import(modulePath);
                                return measurement.measureMessageContent(
                                    content
                                );
                            },
                            row.content
                        );
                        report.notesChecked++;
                        if (height !== row.height && apply) {
                            const result = await repository.applyLayoutBackfill(
                                row.id,
                                row.contentRevision,
                                height
                            );
                            if (result === 'conflict') {
                                conflicts++;
                                report.conflicts++;
                            }
                            if (result === 'ok') report.notesChanged++;
                        } else if (height !== row.height) report.notesChanged++;
                    }
                    after = rows.at(-1)!.id;
                }
                if (!conflicts) break;
                if (pass === 2)
                    throw new Error(
                        'Content changed repeatedly during layout backfill; rerun after edits finish'
                    );
            }
        }
        if (mode !== 'notes') {
            if (!runtime.storage || !runtime.images)
                throw new Error('Image storage or processor is unavailable');
            let after = '';
            for (;;) {
                const keys = await repository.listPreviewBackfill(after, 100);
                if (!keys.length) break;
                for (const row of keys) {
                    const key = row.objectKey;
                    report.previewsChecked++;
                    const source = await runtime.storage.get(key);
                    if (!source) {
                        report.previewsUnavailable++;
                        continue;
                    }
                    if (apply) {
                        const saved = await saveFudabaTinyPreview(
                            repository,
                            runtime.images,
                            key,
                            source.body,
                            row
                        );
                        if (saved) report.previewsWritten++;
                        else report.previewsUnavailable++;
                    }
                }
                after = keys.at(-1)!.objectKey;
            }
        }
        await mkdir('data/migration', { recursive: true });
        await writeFile(
            `data/migration/fudaba-scene-${Date.now()}.json`,
            JSON.stringify(report, null, 2),
            { mode: 0o600 }
        );
        console.log(JSON.stringify(report));
    } finally {
        await browser?.close();
        await closeNodeServices();
    }
}
if (require.main === module)
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
