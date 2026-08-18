import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { parseProducerMapImageUploadRequest } from '@/domains/content/producer-map/request';
import type {
    ProducerMapImageUploadSuccessResponse,
    ProducerMapMutationErrorResponse
} from '@/domains/content/producer-map/response';
import { services } from '@/middleware/hono-context';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { safeUploadBaseName } from '@/utils/media/filename';
import { normalizeUploadedImageToWebp } from '@/utils/media/normalize-uploaded-image';
import { producerMapAssetObjectKey } from '@/utils/storage/business-object-keys';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function handleUploadProducerMapImage(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    let key = '';
    try {
        const { image } = await parseProducerMapImageUploadRequest(c);
        const webp = await normalizeUploadedImageToWebp(image, runtime.images, 88);
        const filename = `${safeUploadBaseName(image.filename)}-${Date.now()}-${randomHex(6)}.webp`;
        const url = `/uploads/producer-map/${filename}`;
        key = producerMapAssetObjectKey(filename);
        await runtime.storage.put(key, webp, {
            contentType: 'image/webp',
            metadata: { kind: 'producer-map-image' }
        });
        await writeAudit(c, '上传制作人地图图片', url);
        return c.json({
            success: true,
            url
        } satisfies ProducerMapImageUploadSuccessResponse);
    } catch (error) {
        if (key) {
            await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        }
        const status = statusFromError(error);
        if (status === 413) {
            return c.json({
                error: '上传文件超过 10MB 限制'
            } satisfies ProducerMapMutationErrorResponse, 413);
        }
        if (status >= 500) {
            console.error('Failed to upload producer map image', error);
            return c.json({
                error: '制作人地图图片上传失败'
            } satisfies ProducerMapMutationErrorResponse, 500);
        }
        return c.json({
            error: messageFromError(error)
        } satisfies ProducerMapMutationErrorResponse, 400);
    }
}
