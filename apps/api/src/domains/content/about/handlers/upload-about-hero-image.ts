import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { uploadAboutImage } from '@/domains/content/about/about-image-upload';
import { parseAboutHeroImageRequest } from '@/domains/content/about/request';
import type { AboutImageUploadResponse } from '@/domains/content/about/response';
import { aboutHeroObjectKey } from '@/utils/storage/business-object-keys';

export async function handleUploadAboutHeroImage(
    c: Context<AppEnvironment>
): Promise<Response> {
    const result = await uploadAboutImage(c, {
        publicDirectory: 'hero',
        objectKey: aboutHeroObjectKey,
        metadataKind: 'about-hero-image',
        auditAction: '上传关于页主视觉',
        failureMessage: '角色主视觉上传失败',
        parseRequest: (uploads) => parseAboutHeroImageRequest(c.req.raw, uploads)
    });
    return c.json(
        result.body satisfies AboutImageUploadResponse,
        result.status
    );
}
