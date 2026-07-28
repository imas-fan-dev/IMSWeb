import type { Env, Handler } from 'hono';
import type { NewStoryLinkInput } from '@/ports/repositories';
import {
    authorizeWikiWrite,
    findWikiMutationTarget,
    optionalWikiCatalogId,
    resolveWikiStorySources,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';

type JsonObject = Record<string, unknown>;

function positiveId(value: string | undefined, label: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error(`${label} ID 无效`), { status: 400 });
    }
    return id;
}

function nonNegativeRevision(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw Object.assign(new Error('expectedRevision 必须是非负整数'), { status: 400 });
    }
    return value;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value.trim();
}

function storySources(value: unknown): Array<Omit<NewStoryLinkInput,
    'contentTypeId' | 'sourcePlatformId'> & {
        contentTypeId?: number;
        sourcePlatformId?: number;
    }> {
    if (!Array.isArray(value) || !value.length || value.length > 20) {
        throw Object.assign(new Error('剧情卡片需要 1 至 20 个来源'), { status: 400 });
    }
    return value.map((source, index) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            throw Object.assign(new Error(`第 ${index + 1} 个来源无效`), { status: 400 });
        }
        const record = source as JsonObject;
        return {
            upName: requiredText(record.upName, `第 ${index + 1} 个来源投稿者`, 100),
            videoTitle: requiredText(record.videoTitle, `第 ${index + 1} 个来源标题`, 500),
            url: requiredText(record.url, `第 ${index + 1} 个来源链接`, 2048),
            contentTypeId: optionalWikiCatalogId(
                record.contentTypeId,
                `第 ${index + 1} 个来源内容类型`
            ),
            sourcePlatformId: optionalWikiCatalogId(
                record.sourcePlatformId,
                `第 ${index + 1} 个来源平台`
            )
        };
    });
}

export function createHandleAddWikiStorySources<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const cardId = positiveId(context.req.param('cardId'), '剧情卡片');
            const body = await context.req.json<JsonObject>();
            const target = await findWikiMutationTarget(
                services,
                requiredText(body.agency, '企划', 100),
                requiredText(body.idol, '内容页', 100),
                404
            );
            if ('error' in target) return target.error;
            const links = await resolveWikiStorySources(
                services.story!,
                storySources(body.sources)
            );
            const result = await services.story!.addStoryCardSources({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                cardId,
                expectedRevision: nonNegativeRevision(body.expectedRevision),
                links
            });
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('卡片已被其他编辑更新，请刷新后重试'),
                    mediaRevision: result.revision
                }, 409);
            }
            return wikiJson({
                status: 'success',
                sourceCount: result.ids.length,
                mediaRevision: result.revision
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '新增剧情来源失败')),
                error instanceof SyntaxError ? 400 : wikiStatusOf(error)
            );
        }
    };
}
