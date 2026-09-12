import { wikiPlain } from '@/domains/content/wiki/handler-support';
import type { WikiPlainTextResponse } from '@/domains/content/wiki/response';

export function handleRejectRetiredWikiStaticAsset(): WikiPlainTextResponse {
    return wikiPlain('Not Found', 404);
}
