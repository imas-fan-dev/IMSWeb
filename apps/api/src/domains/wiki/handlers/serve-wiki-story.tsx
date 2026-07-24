import type { Env, Handler } from 'hono';
import {
    hasLightWikiIdolColor,
    wikiPlain,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    aggregateStories,
    findAvatar,
    getPresetCategories,
    requireWikiServices,
    toWikiAgency
} from '@/domains/wiki/service';
import { WikiStoryTemplate } from '@/domains/wiki/templates/story';

export function createHandleServeWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const agencyName = context.req.query('agency');
        const idolName = context.req.query('idol');
        if (!agencyName || !idolName) return wikiPlain('参数缺失', 400);
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const agencyRecord = await services.story!.findAgencyByName(agencyName);
        const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
        if (!agency) return wikiPlain('找不到该企划', 404);
        const idolRecord = await services.story!.findIdolByAgencyAndName(agency.id, idolName);
        if (!idolRecord) return wikiPlain('数据库中未找到该偶像', 404);
        const [stories, avatarUrl] = await Promise.all([
            services.story!.listStories(agency.code, idolRecord.id),
            findAvatar(
                services.storage!,
                agency.code,
                idolRecord.folder_name,
                agency.name,
                idolRecord.name_cn
            )
        ]);
        const presetCategories = getPresetCategories(agency.name, idolRecord.name_cn);
        const categories = aggregateStories(
            stories,
            presetCategories,
            agency.name,
            idolRecord.name_cn
        );
        const idolColor = hasLightWikiIdolColor(idolRecord.name_cn)
            ? agency.color
            : idolRecord.color;
        return context.html(
            <WikiStoryTemplate
                agency={agency.name}
                idol={idolRecord.name_cn}
                idolDisplayName={idolRecord.name_cn}
                categories={categories}
                presetCategories={presetCategories}
                avatarUrl={avatarUrl.url}
                avatarFit={avatarUrl.fit}
                idolColor={idolColor}
            />
        );
    };
}
