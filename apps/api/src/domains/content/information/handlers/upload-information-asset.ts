import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { updateInformationIndex } from '@/domains/content/information/content-store';
import { parseUploadInformationAssetRequest } from '@/domains/content/information/request';
import type {
    InformationErrorResponse,
    InformationUploadResponse
} from '@/domains/content/information/response';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';
import { safeUploadBaseName } from '@/utils/media/filename';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { informationAssetObjectKey } from '@/utils/storage/business-object-keys';

export async function handleUploadInformationAsset(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    let key = '';
    let publicKey = '';
    try {
        const { image } = await parseUploadInformationAssetRequest(c);
        const webp = await runtime.images.toWebp(image.body, 88);
        const filename = `${safeUploadBaseName(image.filename)}-${Date.now()}-${randomHex(6)}.webp`;
        publicKey = `uploads/information/original/${filename}`;
        key = informationAssetObjectKey(filename);
        const url = `/${publicKey}`;
        await runtime.storage.put(key, webp, { contentType: 'image/webp' });
        await updateInformationIndex(runtime.storage, (index) => ({
            ...index,
            assets: index.assets.includes(url) ? index.assets : [...index.assets, url]
        }));
        await writeAudit(c, '上传活动图片', url);
        return c.json({ success: true, url } satisfies InformationUploadResponse);
    } catch (error) {
        if (key) await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to upload information asset', error);
            return c.json({ error: '图片上传失败' } satisfies InformationErrorResponse, 500);
        }
        return c.json({
            error: messageFromError(error)
        } satisfies InformationErrorResponse, status as 400);
    }
}
