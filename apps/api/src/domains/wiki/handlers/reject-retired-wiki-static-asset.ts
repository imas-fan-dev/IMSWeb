import { wikiPlain } from '@/domains/wiki/handler-support';
import type { WikiPlainTextResponse } from '@/domains/wiki/response';

export function handleRejectRetiredWikiStaticAsset(): WikiPlainTextResponse {
    return wikiPlain('Not Found', 404);
}
