import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { AdminCatalogMutation } from '@imsweb/contracts/catalog';
import { catalogRepository, services } from '@/middleware/hono-context';
import { parseCatalogImageRequest } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { ImagePixelLimitError } from '@/ports/media';

async function cleanupImage(runtime: RuntimeServices, key: string): Promise<void> {
    try { await deleteObjectWithCompensation(runtime, key); }
    catch (error) { console.error('Catalog image cleanup retained an object for retry', error); }
}

export async function handleSaveAdminCatalogProfileImage(c: Context<AppEnvironment>): Promise<Response> {
    let createdKey: string | null = null;
    let committed = false;
    const runtime = services(c);
    try {
        if (!runtime.uploads || !runtime.images || !runtime.storage) throw new Error('Media services unavailable');
        const { input, file } = await parseCatalogImageRequest(c.req.raw, runtime.uploads,
            runtime.config?.storyMaxUploadBytes ?? 10 * 1024 * 1024);
        const profile = await catalogRepository(c).findProfile(input.kind, input.id);
        if (!profile) return c.json({ success: false, message: '档案不存在' } satisfies FailureMessageResponse, 404);
        if (profile.mediaRevision !== input.revision) {
            return c.json({ success: false, message: '图片已变更，请刷新后重试' } satisfies FailureMessageResponse, 409);
        }
        let key = profile.imageObjectKey;
        if (file) {
            let bytes: Uint8Array;
            try {
                const info = await runtime.images.validate(file.body, file.contentType, { maxInputPixels: 40_000_000, fullDecode: true });
                if (!['png', 'jpeg', 'webp', 'avif', 'gif'].includes(info.format)) {
                    throw new Error('图片格式不支持');
                }
                bytes = await runtime.images.toWebp(file.body, 85, { maxInputPixels: 40_000_000 });
            } catch (error) {
                throw Object.assign(new Error('图片内容无效或超过像素限制'), { status: error instanceof ImagePixelLimitError ? 413 : 400 });
            }
            createdKey = `catalog/${input.kind}/${input.id}/${crypto.randomUUID()}.webp`;
            await runtime.storage.put(createdKey, bytes, { contentType: 'image/webp' });
            key = createdKey;
        }
        const previous = await catalogRepository(c).saveMedia(input, key);
        committed = true;
        if (previous && previous !== key) await cleanupImage(runtime, previous);
        await writeAudit(c, 'catalog_profile_image', `${input.kind}:${input.id}`);
        return c.json({ success: true } satisfies AdminCatalogMutation);
    } catch (error) {
        if (createdKey && !committed) await cleanupImage(runtime, createdKey);
        return catalogError(c, error);
    }
}
