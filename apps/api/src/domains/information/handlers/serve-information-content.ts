import { readInformationIndex } from '@/domains/information/content-store';
import {
    buildInformationHtmlDocument,
    INFORMATION_DOCUMENT_CSP
} from '@/domains/information/information-html-document';
import type { InformationCardRequestContext } from '@/domains/information/request';
import type {
    InformationContentDocumentResponse,
    InformationContentNotFoundResponse
} from '@/domains/information/response';
import { services } from '@/middleware/hono-context';

export async function handleServeInformationContent(
    c: InformationCardRequestContext
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    const { id } = c.req.valid('param');
    const card = index.cards.find((candidate) => candidate.id === id);
    if (!card || card.contentType !== 'html' || !card.html) {
        const response = {
            body: '活动内容不存在',
            status: 404
        } satisfies InformationContentNotFoundResponse;
        return c.text(response.body, response.status);
    }

    c.header('Cache-Control', 'no-cache');
    c.header('Content-Security-Policy', INFORMATION_DOCUMENT_CSP);
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    const response = {
        body: buildInformationHtmlDocument(card.title, card.html)
    } satisfies InformationContentDocumentResponse;
    return c.html(response.body);
}
