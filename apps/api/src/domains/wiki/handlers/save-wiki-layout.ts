import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';
import type {
    WikiIdParams,
    WikiLayoutRequest,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';

export function createHandleSaveWikiLayout<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiLayoutRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = context.req.valid('param').id;
            const body = context.req.valid('json');
            if (!Number.isSafeInteger(agencyId) || agencyId <= 0 ||
                !Number.isSafeInteger(body.expectedRevision) ||
                Number(body.expectedRevision) < 0 || !Array.isArray(body.groups)) {
                return wikiJson(wikiErrorBody('布局参数无效'), 400);
            }
            const groups = body.groups.map((value) => {
                if (!value || typeof value !== 'object') {
                    throw Object.assign(new Error('布局分组无效'), { status: 400 });
                }
                const record = value as Record<string, unknown>;
                const id = Number(record.id);
                if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(record.idolIds)) {
                    throw Object.assign(new Error('布局分组无效'), { status: 400 });
                }
                const idolIds = record.idolIds.map(Number);
                if (idolIds.some((idolId) => !Number.isSafeInteger(idolId) || idolId <= 0)) {
                    throw Object.assign(new Error('布局成员无效'), { status: 400 });
                }
                return { id, idolIds };
            });
            const result = await services.story!.saveWikiLayout({
                agencyId,
                expectedRevision: Number(body.expectedRevision),
                groups
            });
            if (result.status === 'conflict') {
                return wikiJson({
                    status: 'error',
                    msg: '布局已被其他操作更新，请重新加载',
                    layoutRevision: result.revision
                }, 409);
            }
            return wikiJson({
                status: 'success',
                layoutRevision: result.revision
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '保存布局失败')),
                wikiStatusOf(error)
            );
        }
    };
}
