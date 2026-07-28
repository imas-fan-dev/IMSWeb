import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/wiki/service';

type JsonObject = Record<string, unknown>;

function textInput(body: JsonObject, key: string, fallback: string | undefined): string {
    const value = body[key] ?? fallback;
    return typeof value === 'string' ? value.trim() : '';
}

function revisionInput(body: JsonObject, fallback: string | undefined): number {
    const value = body.expectedRevision ?? fallback;
    const revision = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw Object.assign(new Error('expectedRevision 必须是非负整数'), { status: 400 });
    }
    return revision;
}

async function optionalJsonBody(request: Request): Promise<JsonObject> {
    if (!request.headers.get('content-type')?.toLowerCase()
        .startsWith('application/json')) {
        return {};
    }
    const source = await request.text();
    return source.trim() ? JSON.parse(source) as JsonObject : {};
}

export function createHandleDeleteWikiStoryLink<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const storyId = Number(context.req.param('storyId'));
            if (!Number.isSafeInteger(storyId) || storyId <= 0) {
                return wikiJson(wikiErrorBody('剧情来源 ID 无效'), 400);
            }
            const body = await optionalJsonBody(context.req.raw);
            const target = await findWikiMutationTarget(
                services,
                textInput(body, 'agency', context.req.query('agency')),
                textInput(body, 'idol', context.req.query('idol')),
                404
            );
            if ('error' in target) return target.error;
            const result = await services.story!.deleteStoryLink({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                id: storyId,
                expectedRevision: revisionInput(body, context.req.query('expectedRevision'))
            });
            if (!result) return wikiJson(wikiErrorBody('剧情来源不存在'), 404);
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('卡片已被其他编辑更新，请刷新后重试'),
                    mediaRevision: result.revision
                }, 409);
            }
            await cleanupWikiObjects(services, result.cleanupImageFiles.map((imageFile) =>
                storyObjectKey(
                    target.agency.code,
                    target.idol.folderName,
                    imageFile
                )
            ));
            return wikiJson({
                status: 'success',
                cardDeleted: result.cardDeleted,
                mediaRevision: result.revision
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '删除剧情来源失败')),
                error instanceof SyntaxError ? 400 : wikiStatusOf(error)
            );
        }
    };
}
