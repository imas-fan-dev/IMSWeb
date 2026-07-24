import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    MAX_INFORMATION_IMAGE_BYTES,
    oneInformationFile,
    updateInformationIndex
} from '@/domains/information/content-store';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function handleUploadInformationAsset(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    let key = '';
    try {
        const parsed = await runtime.uploads.parse(c.req.raw, {
            maxBytes: MAX_INFORMATION_IMAGE_BYTES + 64 * 1024,
            fileFields: ['image'],
            maxFiles: 1,
            maxFields: 1,
            maxParts: 2
        });
        const file = oneInformationFile(parsed.files.image);
        if (!file || file.body.byteLength > MAX_INFORMATION_IMAGE_BYTES) {
            return c.json({ error: '必须上传一张不超过 10MB 的图片' }, 400);
        }
        await validateUploadedImage(file, runtime.images);
        const webp = await runtime.images.toWebp(file.body, 88);
        const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.webp`;
        key = `uploads/information/original/${filename}`;
        const url = `/${key}`;
        await runtime.storage.put(key, webp, { contentType: 'image/webp' });
        await updateInformationIndex(runtime.storage, (index) => ({
            ...index,
            assets: index.assets.includes(url) ? index.assets : [...index.assets, url]
        }));
        await writeAudit(c, '上传活动图片', url);
        return c.json({ success: true, url });
    } catch (error) {
        if (key) await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to upload information asset', error);
            return c.json({ error: '图片上传失败' }, status as 500);
        }
        return c.json({ error: messageFromError(error) }, status as 400);
    }
}
