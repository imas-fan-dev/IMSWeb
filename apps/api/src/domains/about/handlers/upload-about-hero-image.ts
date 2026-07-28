import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { aboutHeroObjectKey } from '@/utils/storage/business-object-keys';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

const MAX_ABOUT_HERO_IMAGE_BYTES = 10 * 1024 * 1024;

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

export async function handleUploadAboutHeroImage(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    let key = '';
    try {
        const parsed = await runtime.uploads.parse(c.req.raw, {
            maxBytes: MAX_ABOUT_HERO_IMAGE_BYTES + 64 * 1024,
            fileFields: ['image'],
            maxFiles: 1,
            maxFields: 0,
            maxParts: 1
        });
        const file = oneFile(parsed.files.image);
        if (!file || file.body.byteLength > MAX_ABOUT_HERO_IMAGE_BYTES) {
            return c.json({ error: '必须上传一张不超过 10MB 的图片' }, 400);
        }
        await validateUploadedImage(file, runtime.images);
        const webp = await runtime.images.toWebp(file.body, 88);
        const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.webp`;
        const publicPath = `/uploads/about/hero/${filename}`;
        key = aboutHeroObjectKey(filename);
        await runtime.storage.put(key, webp, {
            contentType: 'image/webp',
            metadata: { kind: 'about-hero-image' }
        });
        await writeAudit(c, '上传关于页主视觉', publicPath);
        return c.json({ success: true, url: publicPath });
    } catch (error) {
        if (key) {
            await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        }
        const status = statusFromError(error);
        if (status === 413) {
            return c.json({ error: '上传文件超过 10MB 限制' }, 413);
        }
        if (status >= 500) {
            console.error('Failed to upload about hero image', error);
            return c.json({ error: '角色主视觉上传失败' }, 500);
        }
        return c.json({ error: messageFromError(error) }, 400);
    }
}
