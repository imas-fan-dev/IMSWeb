import { wikiPlain } from '@/domains/wiki/handler-support';

export function handleRejectRetiredWikiStaticAsset(): Response {
    return wikiPlain('Not Found', 404);
}
