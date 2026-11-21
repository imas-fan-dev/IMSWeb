import type { Env } from 'hono';
import type {
    WikiAdminBilibiliBatchItem,
    WikiAdminParseBilibiliBatchRequest
} from '@imsweb/contracts/wiki';
import {
    wikiJson,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import { parseBilibili, requireWikiServices } from '@/domains/content/wiki/service';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type {
    WikiBilibiliResponse,
    WikiRouteHandler
} from '@/domains/content/wiki/response';

/**
 * Upstream requests one batch keeps in flight.
 *
 * A maintainer pastes up to twenty links; four at a time keeps the batch fast
 * without turning one dialog into a twenty-request burst at Bilibili.
 */
const BILIBILI_BATCH_CONCURRENCY = 4;

/**
 * Trims and de-duplicates pasted URLs, keeping the maintainer's order.
 *
 * Blank lines disappear, and a repeated link is parsed once, so one paste never
 * spends a duplicate upstream request or inserts a duplicate Markdown row.
 */
export function uniqueBilibiliInputs(urls: readonly string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const raw of urls) {
        const url = raw.trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        unique.push(url);
    }
    return unique;
}

/**
 * Runs `run` over `items` with at most `limit` calls in flight.
 *
 * Results keep input order, so the dialog can show one row per pasted URL even
 * though the batch finishes out of order.
 */
async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    run: (item: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await run(items[index]!);
        }
    };
    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        () => worker()
    );
    await Promise.all(workers);
    return results;
}

/**
 * Projects one parsed link onto the wire item.
 *
 * A failed link keeps the batch successful: the maintainer still inserts the
 * links that resolved, and the dialog shows this row's error.
 */
function batchItem(
    inputUrl: string,
    parsed: WikiBilibiliResponse
): WikiAdminBilibiliBatchItem {
    if (parsed.status !== 'success') {
        return { inputUrl, ok: false, error: parsed.msg || '解析请求失败' };
    }
    return {
        inputUrl,
        ok: true,
        title: parsed.title,
        up: parsed.up,
        stdUrl: parsed.std_url,
        coverUrl: parsed.cover_url
    };
}

/**
 * Parses a pasted batch of Bilibili links for the document authoring toolbar.
 *
 * Admin authorization and write CSRF are enforced by the `/api/admin/wiki/*`
 * middleware registered in `wiki/routes.ts`. Every upstream call goes through
 * the injected `services.fetch`, so tests never touch the real network, and one
 * failing link never fails the whole batch.
 */
export function createHandleWikiParseBilibiliBatch<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'json', WikiAdminParseBilibiliBatchRequest>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['fetch']);
        const fetchImpl = services.fetch!;
        const { urls } = context.req.valid('json');
        const items = await mapWithConcurrency(
            uniqueBilibiliInputs(urls),
            BILIBILI_BATCH_CONCURRENCY,
            async (inputUrl) => {
                try {
                    return batchItem(
                        inputUrl,
                        await parseBilibili(inputUrl, fetchImpl)
                    );
                } catch {
                    return {
                        inputUrl,
                        ok: false,
                        error: '解析请求失败'
                    } satisfies WikiAdminBilibiliBatchItem;
                }
            }
        );
        return wikiJson({ status: 'success', items });
    };
}
