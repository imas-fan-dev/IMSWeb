import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { uploadAboutImage } from '@/domains/content/about/about-image-upload';
import { parseAboutMemberAvatarRequest } from '@/domains/content/about/request';
import type { AboutImageUploadResponse } from '@/domains/content/about/response';
import { aboutMemberAvatarObjectKey } from '@/utils/storage/business-object-keys';

export async function handleUploadAboutMemberAvatar(
    c: Context<AppEnvironment>
): Promise<Response> {
    const result = await uploadAboutImage(c, {
        publicDirectory: 'member-avatars',
        objectKey: aboutMemberAvatarObjectKey,
        metadataKind: 'about-member-avatar',
        auditAction: '上传关于页成员头像',
        failureMessage: '成员头像上传失败',
        parseRequest: (uploads) => parseAboutMemberAvatarRequest(c.req.raw, uploads)
    });
    return c.json(
        result.body satisfies AboutImageUploadResponse,
        result.status
    );
}
