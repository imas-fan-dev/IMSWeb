import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { parseBilibili, requireWikiServices } from '@/domains/wiki/service';

export function createHandleParseBilibili<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['fetch']);
        let body: unknown = {};
        try {
            body = await context.req.json();
        } catch {
            body = {};
        }
        const input = (
            typeof body === 'object' && body !== null && 'url' in body &&
            typeof (body as { url?: unknown }).url === 'string'
        )
            ? (body as { url: string }).url.trim()
            : '';
        try {
            return wikiJson(await parseBilibili(input, services.fetch!));
        } catch {
            return wikiJson(wikiErrorBody('解析请求失败'), 502);
        }
    };
}
