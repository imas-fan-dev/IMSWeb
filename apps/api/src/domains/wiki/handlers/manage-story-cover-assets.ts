import type { Env, Handler } from 'hono';
import {
    authorizeWikiRead,
    authorizeWikiWrite,
    cleanupWikiObjects,
    parseWikiUpload,
    singleWikiFile,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices,
    validateAndConvertStoryImage,
    versionedStoryCoverAssetObjectKey
} from '@/domains/wiki/service';
import type {
    WikiStoryCoverAssetRecord,
    WikiStoryCoverPresentationPolicy
} from '@/ports/repositories';
import { requirePublicObjectUrl } from '@/utils/storage/public-object-url';

function positiveId(value: string | undefined, label: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error(`${label} ID 无效`), { status: 400 });
    }
    return id;
}

function assetName(value: string | undefined): string {
    const name = (value ?? '').trim();
    if (!name || name.length > 200) {
        throw Object.assign(new Error('素材名称无效'), { status: 400 });
    }
    return name;
}

function booleanField(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value === '') return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw Object.assign(new Error('启用状态无效'), { status: 400 });
}

function presentationPolicy(
    value: string | undefined,
    fallback: WikiStoryCoverPresentationPolicy = 'inherit'
): WikiStoryCoverPresentationPolicy {
    if (value === undefined || value === '') return fallback;
    if (value === 'inherit' || value === 'contain') return value;
    throw Object.assign(new Error('展示方式无效'), { status: 400 });
}

async function serializeAsset(
    services: Awaited<ReturnType<WikiServicesResolver<Env>>>,
    asset: WikiStoryCoverAssetRecord,
    resolvedUrl?: string
) {
    const url = resolvedUrl ?? await requirePublicObjectUrl(
        services.storage!,
        asset.object_key
    );
    return {
        id: asset.id,
        agencyId: asset.agency_id,
        name: asset.name,
        imageUrl: `${url}${url.includes('?') ? '&' : '?'}v=${asset.revision}`,
        presentationPolicy: asset.presentation_policy,
        displayOrder: asset.display_order,
        isActive: asset.is_active,
        revision: asset.revision,
        usageCount: asset.usage_count
    };
}

export function createHandleListWikiStoryCoverAssets<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiRead(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const agencyId = positiveId(context.req.param('agencyId'), '企划');
            const agency = await services.story!.findAgencyById(agencyId);
            if (!agency) return wikiJson(wikiErrorBody('企划不存在'), 404);
            const assets = await services.story!.listStoryCoverAssets(agencyId);
            return wikiJson({
                status: 'success',
                agency: { id: agency.id, code: agency.code, name: agency.name_cn },
                assets: await Promise.all(assets.map((asset) =>
                    serializeAsset(services, asset)
                ))
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '读取剧情封面素材失败')),
                wikiStatusOf(error)
            );
        }
    };
}

export function createHandleCreateWikiStoryCoverAsset<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        try {
            const agencyId = positiveId(context.req.param('agencyId'), '企划');
            const agency = await services.story!.findAgencyById(agencyId);
            if (!agency) return wikiJson(wikiErrorBody('企划不存在'), 404);
            const upload = await parseWikiUpload(context.req.raw, services);
            const file = singleWikiFile(upload, 'image');
            if (!file?.filename) {
                return wikiJson(wikiErrorBody('请选择要上传的封面图片'), 400);
            }
            const name = assetName(upload.fields.name);
            const policy = presentationPolicy(upload.fields.presentation_policy);
            const converted = await validateAndConvertStoryImage(file, services.images!);
            createdKey = versionedStoryCoverAssetObjectKey(
                agency.code,
                crypto.randomUUID()
            );
            await services.storage!.put(createdKey, converted, {
                contentType: 'image/webp',
                metadata: { kind: 'wiki-story-cover-asset', agency: agency.name_cn }
            });
            const publicUrl = await requirePublicObjectUrl(services.storage!, createdKey);
            const asset = await services.story!.createStoryCoverAsset({
                agencyId,
                name,
                objectKey: createdKey,
                presentationPolicy: policy
            });
            return wikiJson({
                status: 'success',
                asset: await serializeAsset(services, asset, publicUrl)
            });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
            const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
            return wikiJson(
                wikiErrorBody(duplicate
                    ? '该企划已有同名素材'
                    : wikiMessageOf(error, '上传剧情封面素材失败')),
                duplicate ? 409 : wikiStatusOf(error)
            );
        }
    };
}

export function createHandleUpdateWikiStoryCoverAsset<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        try {
            const assetId = positiveId(context.req.param('assetId'), '素材');
            const current = await services.story!.findStoryCoverAssetById(assetId);
            if (!current) return wikiJson(wikiErrorBody('剧情封面素材不存在'), 404);
            const agency = await services.story!.findAgencyById(current.agency_id);
            if (!agency) return wikiJson(wikiErrorBody('企划不存在'), 404);
            const upload = await parseWikiUpload(context.req.raw, services);
            const expectedRevision = Number(upload.fields.expected_revision);
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
                return wikiJson(wikiErrorBody('缺少有效的素材版本'), 400);
            }
            const name = assetName(upload.fields.name ?? current.name);
            const policy = presentationPolicy(
                upload.fields.presentation_policy,
                current.presentation_policy
            );
            const file = singleWikiFile(upload, 'image');
            let objectKey = current.object_key;
            if (file?.filename) {
                const converted = await validateAndConvertStoryImage(file, services.images!);
                createdKey = versionedStoryCoverAssetObjectKey(
                    agency.code,
                    crypto.randomUUID()
                );
                objectKey = createdKey;
                await services.storage!.put(createdKey, converted, {
                    contentType: 'image/webp',
                    metadata: { kind: 'wiki-story-cover-asset', agency: agency.name_cn }
                });
            }
            const publicUrl = await requirePublicObjectUrl(services.storage!, objectKey);
            const result = await services.story!.updateStoryCoverAsset({
                id: assetId,
                agencyId: agency.id,
                name,
                objectKey,
                presentationPolicy: policy,
                isActive: booleanField(upload.fields.is_active, current.is_active),
                expectedRevision
            });
            if (!result) return wikiJson(wikiErrorBody('剧情封面素材不存在'), 404);
            if (result.status === 'conflict') {
                if (createdKey) await cleanupWikiObjects(services, [createdKey]);
                createdKey = null;
                return wikiJson({
                    ...wikiErrorBody('素材已被其他编辑更新，请刷新后重试'),
                    revision: result.revision
                }, 409);
            }
            if (result.previousObjectKey) {
                await cleanupWikiObjects(services, [result.previousObjectKey]);
            }
            return wikiJson({
                status: 'success',
                asset: await serializeAsset(services, result.asset, publicUrl)
            });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
            const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
            return wikiJson(
                wikiErrorBody(duplicate
                    ? '该企划已有同名素材'
                    : wikiMessageOf(error, '更新剧情封面素材失败')),
                duplicate ? 409 : wikiStatusOf(error)
            );
        }
    };
}

export function createHandleDeleteWikiStoryCoverAsset<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const assetId = positiveId(context.req.param('assetId'), '素材');
            const result = await services.story!.deleteStoryCoverAsset(assetId);
            if (result.status === 'not-found') {
                return wikiJson(wikiErrorBody('剧情封面素材不存在'), 404);
            }
            if (result.status === 'in-use') {
                return wikiJson(
                    wikiErrorBody(`仍有 ${result.usageCount} 张剧情卡片使用该素材`),
                    409
                );
            }
            await cleanupWikiObjects(services, [result.objectKey]);
            return wikiJson({ status: 'success' });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '删除剧情封面素材失败')),
                wikiStatusOf(error)
            );
        }
    };
}
