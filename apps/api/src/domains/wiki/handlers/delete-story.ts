import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    parseWikiUpload,
    wikiErrorBody,
    wikiJson,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/wiki/service';

export function createHandleDeleteWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'uploads']);
        try {
            const { fields } = await parseWikiUpload(context.req.raw, services);
            const target = await findWikiMutationTarget(
                services,
                (fields.agency ?? '').trim(),
                (fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const category = (fields.category_name ?? '').trim();
            const cardName = (fields.card_name ?? '').trim();
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
            await services.story!.deleteStoryGroup(
                target.agency.code,
                target.idol.id,
                category,
                cardName
            );
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
            return wikiJson({ status: 'success' });
        } catch (error) {
            if (wikiStatusOf(error) === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            return wikiJson(wikiErrorBody('删除剧情失败'), 500);
        }
    };
}
