import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { uploadAboutImage } from '@/domains/about/about-image-upload';
import { aboutMemberAvatarObjectKey } from '@/utils/storage/business-object-keys';

export async function handleUploadAboutMemberAvatar(
    c: Context<AppEnvironment>
): Promise<Response> {
    return uploadAboutImage(c, {
        publicDirectory: 'member-avatars',
        objectKey: aboutMemberAvatarObjectKey,
        metadataKind: 'about-member-avatar',
        auditAction: '上传关于页成员头像',
        failureMessage: '成员头像上传失败'
    });
}
