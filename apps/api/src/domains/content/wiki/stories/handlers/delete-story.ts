import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    wikiErrorBody,
    wikiJson,
    wikiStatusOf,
    writeWikiAudit,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import { parseDeleteWikiStoryRequest } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/content/wiki/service';

export function createHandleDeleteWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'uploads']);
        try {
            const { fields } = await parseDeleteWikiStoryRequest(
                context.req.raw,
                services
            );
            const target = await findWikiMutationTarget(
                services,
                (fields.agency ?? '').trim(),
                (fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const category = (fields.category_name ?? '').trim();
            const cardName = (fields.card_name ?? '').trim();
            if (fields.expected_revision === undefined || fields.expected_revision === '') {
                return wikiJson(wikiErrorBody('缺少卡片版本'), 428);
            }
            const expectedRevision = Number(fields.expected_revision);
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
                return wikiJson(wikiErrorBody('卡片版本无效'), 400);
            }
            const [rows, cards] = await Promise.all([
                services.story!.listStoryGroupForDelete(
                    target.agency.code,
                    target.idol.id,
                    category,
                    cardName
                ),
                services.story!.listStoryCards(target.agency.code, target.idol.id)
            ]);
            const card = cards.find((candidate) =>
                candidate.category === category && candidate.card_name === cardName
            );
            const deleted = await services.story!.deleteStoryGroup({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                category,
                cardName,
                expectedRevision
            });
            if (deleted.status === 'not-found') {
                return wikiJson(wikiErrorBody('剧情卡片不存在'), 404);
            }
            if (deleted.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('卡片已被其他编辑更新，请刷新后重试'),
                    revision: deleted.revision
                }, 409);
            }
            const imageFiles = new Set([
                card?.image_file,
                ...rows.map((row) => row.image_file)
            ].filter((value): value is string => Boolean(value)));
            await cleanupWikiObjects(services, [...imageFiles].flatMap((imageFile) => {
                try {
                    return [storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        imageFile
                    )];
                } catch {
                    return [];
                }
            }));
            await writeWikiAudit(
                context,
                services,
                '删除 Wiki 剧情卡片',
                `agency=${target.agency.code};idol_id=${target.idol.id};card=${cardName};revision=${expectedRevision}`
            );
            return wikiJson({ status: 'success' });
        } catch (error) {
            if (wikiStatusOf(error) === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            return wikiJson(wikiErrorBody('删除剧情失败'), 500);
        }
    };
}
