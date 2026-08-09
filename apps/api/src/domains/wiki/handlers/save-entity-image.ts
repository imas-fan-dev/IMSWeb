import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    singleWikiFile,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    parseSaveWikiEntityImageRequest,
    type WikiIdParams,
    type WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';
import {
    parseWikiImageTransform,
    parseWikiMediaRevision
} from '@/domains/wiki/image-transform';
import {
    agencyIconUrl,
    idolMediaUrl,
    requireWikiServices,
    validateAndConvertStoryImage,
    versionedAgencyIconObjectKey,
    versionedIdolAvatarObjectKey,
    versionedWikiGroupIconObjectKey,
    wikiGroupIconUrl
} from '@/domains/wiki/service';
import type {
    AgencyRecord,
    IdolRecord,
    WikiGroupRecord,
    WikiEntityMediaSaveResult,
    WikiImageTransform,
} from '@/ports/repositories';

type WikiEntityImageKind = 'agency' | 'group' | 'idol';

type EntityTarget = {
    id: number;
    agency: AgencyRecord;
    objectKey: string | null;
    transform: WikiImageTransform;
    mediaRevision: number;
    objectKeyFor: (version: string) => string;
    publicUrl: string;
    metadata: Record<string, string>;
};

function agencyTransform(record: AgencyRecord): WikiImageTransform {
    return {
        fit: record.icon_fit,
        focalX: record.icon_focal_x,
        focalY: record.icon_focal_y,
        zoom: record.icon_zoom,
        rotation: record.icon_rotation
    };
}

function groupTransform(record: WikiGroupRecord): WikiImageTransform {
    return {
        fit: record.icon_fit,
        focalX: record.icon_focal_x,
        focalY: record.icon_focal_y,
        zoom: record.icon_zoom,
        rotation: record.icon_rotation
    };
}

function idolTransform(record: IdolRecord): WikiImageTransform {
    return {
        fit: record.avatar_fit,
        focalX: record.avatar_focal_x,
        focalY: record.avatar_focal_y,
        zoom: record.avatar_zoom,
        rotation: record.avatar_rotation
    };
}

async function resolveTarget(
    kind: WikiEntityImageKind,
    id: number,
    services: Awaited<ReturnType<WikiServicesResolver<Env>>>
): Promise<EntityTarget> {
    const story = services.story!;
    if (kind === 'agency') {
        const agency = await story.findAgencyById(id);
        if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
        return {
            id,
            agency,
            objectKey: agency.icon_object_key,
            transform: agencyTransform(agency),
            mediaRevision: agency.icon_media_revision,
            objectKeyFor: (version) => versionedAgencyIconObjectKey(agency.code, version),
            publicUrl: agencyIconUrl(id),
            metadata: { kind: 'agency-icon', agency: agency.name_cn }
        };
    }
    if (kind === 'group') {
        const group = await story.findWikiGroupById(id);
        if (!group) throw Object.assign(new Error('栏目不存在'), { status: 404 });
        const agency = await story.findAgencyById(group.agency_id);
        if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
        return {
            id,
            agency,
            objectKey: group.icon_object_key,
            transform: groupTransform(group),
            mediaRevision: group.icon_media_revision,
            objectKeyFor: (version) =>
                versionedWikiGroupIconObjectKey(agency.code, group.code, version),
            publicUrl: wikiGroupIconUrl(id),
            metadata: { kind: 'wiki-group-icon', group: group.name }
        };
    }
    const idol = await story.findIdolById(id);
    if (!idol) throw Object.assign(new Error('内容页不存在'), { status: 404 });
    const agency = await story.findAgencyById(idol.agency_id);
    if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
    return {
        id,
        agency,
        objectKey: idol.avatar_object_key,
        transform: idolTransform(idol),
        mediaRevision: idol.avatar_media_revision,
        objectKeyFor: (version) =>
            versionedIdolAvatarObjectKey(agency.code, idol.folder_name, version),
        publicUrl: idolMediaUrl(agency.name_cn, idol.name_cn),
        metadata: { kind: 'idol-avatar', idol: idol.name_cn }
    };
}

async function saveTarget(
    kind: WikiEntityImageKind,
    services: Awaited<ReturnType<WikiServicesResolver<Env>>>,
    target: EntityTarget,
    objectKey: string | null,
    transform: WikiImageTransform,
    expectedRevision: number
): Promise<WikiEntityMediaSaveResult> {
    const input = {
        id: target.id,
        objectKey,
        transform,
        expectedRevision
    };
    if (kind === 'agency') return services.story!.saveAgencyIconMedia(input);
    if (kind === 'group') return services.story!.saveWikiGroupIconMedia(input);
    return services.story!.saveIdolAvatarMedia(input);
}

export function createHandleSaveWikiEntityImage<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
    kind: WikiEntityImageKind,
    parameter: 'agencyId' | 'groupId' | 'idolId'
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiIdParams>> {
    void parameter;
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        try {
            const target = await resolveTarget(
                kind,
                context.req.valid('param').id,
                services
            );
            const upload = await parseSaveWikiEntityImageRequest(context.req.raw, services);
            const file = singleWikiFile(upload, 'image');
            const transform = parseWikiImageTransform(upload.fields, target.transform);
            const expectedRevision = parseWikiMediaRevision(
                upload.fields,
                target.mediaRevision
            );
            let objectKey = target.objectKey;
            if (file?.filename) {
                const converted = await validateAndConvertStoryImage(file, services.images!);
                createdKey = target.objectKeyFor(crypto.randomUUID());
                objectKey = createdKey;
                await services.storage!.put(createdKey, converted, {
                    contentType: 'image/webp',
                    metadata: target.metadata
                });
            }

            const result = await saveTarget(
                kind,
                services,
                target,
                objectKey,
                transform,
                expectedRevision
            );
            if (result.status === 'conflict') {
                if (createdKey) await cleanupWikiObjects(services, [createdKey]);
                return wikiJson(
                    {
                        ...wikiErrorBody('媒体已被其他编辑更新，请刷新后重试'),
                        mediaRevision: result.revision
                    },
                    409
                );
            }
            if (createdKey && result.previousObjectKey &&
                result.previousObjectKey !== createdKey) {
                await cleanupWikiObjects(services, [result.previousObjectKey]);
            }
            return wikiJson({
                status: 'success',
                url: objectKey ? `${target.publicUrl}?v=${result.revision}` : '',
                mediaRevision: result.revision,
                imageTransform: transform
            });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
            const status = wikiStatusOf(error);
            if (status === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            if (status >= 400 && status < 500) {
                return wikiJson(wikiErrorBody(wikiMessageOf(error, '媒体参数无效')), status);
            }
            return wikiJson(wikiErrorBody('保存 Wiki 媒体失败'), 500);
        }
    };
}
