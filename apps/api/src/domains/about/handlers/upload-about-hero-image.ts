import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { uploadAboutImage } from '@/domains/about/about-image-upload';
import { aboutHeroObjectKey } from '@/utils/storage/business-object-keys';

export async function handleUploadAboutHeroImage(
    c: Context<AppEnvironment>
): Promise<Response> {
    return uploadAboutImage(c, {
        publicDirectory: 'hero',
        objectKey: aboutHeroObjectKey,
        metadataKind: 'about-hero-image',
        auditAction: '上传关于页主视觉',
        failureMessage: '角色主视觉上传失败'
    });
}
