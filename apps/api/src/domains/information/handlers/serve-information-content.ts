import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readInformationIndex } from '@/domains/information/content-store';
import {
    buildInformationHtmlDocument,
    INFORMATION_DOCUMENT_CSP
} from '@/domains/information/information-html-document';
import { services } from '@/middleware/hono-context';

export async function handleServeInformationContent(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    const card = index.cards.find((candidate) => candidate.id === c.req.param('id'));
    if (!card || card.contentType !== 'html' || !card.html) {
        return c.text('活动内容不存在', 404);
    }

    c.header('Cache-Control', 'no-cache');
    c.header('Content-Security-Policy', INFORMATION_DOCUMENT_CSP);
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    return c.html(buildInformationHtmlDocument(card.title, card.html));
}
