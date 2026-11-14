import { publicUploadsPath } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { parseCommunityContentImageUploadRequest } from '@/domains/content/community-content/request';
import type {
    CommunityContentImageUploadSuccessResponse,
    CommunityContentMutationErrorResponse,
} from '@/domains/content/community-content/response';
import { services } from '@/middleware/hono-context';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { safeUploadBaseName } from '@/utils/media/filename';
import { normalizeUploadedImageToWebp } from '@/utils/media/normalize-uploaded-image';
import { communityContentAssetObjectKey } from '@/utils/storage/business-object-keys';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function handleUploadCommunityContentImage(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    let key = '';
    try {
        const { image } = await parseCommunityContentImageUploadRequest(c);
        const webp = await normalizeUploadedImageToWebp(
            image,
            runtime.images,
            88,
        );
        const filename = `${safeUploadBaseName(image.filename)}-${Date.now()}-${randomHex(6)}.webp`;
        const url = publicUploadsPath(`/community-content/${filename}`);
        key = communityContentAssetObjectKey(filename);
        await runtime.storage.put(key, webp, {
            contentType: 'image/webp',
            metadata: { kind: 'community-content-image' },
        });
        await writeAudit(c, '上传制作人社区图片', url);
        return c.json({
            success: true,
            url,
        } satisfies CommunityContentImageUploadSuccessResponse);
    } catch (error) {
        if (key) {
            await deleteObjectWithCompensation(runtime, key).catch(
                () => undefined,
            );
        }
        const status = statusFromError(error);
        if (status === 413) {
            return c.json(
                {
                    error: '上传文件超过 10MB 限制',
                } satisfies CommunityContentMutationErrorResponse,
                413,
            );
        }
        if (status >= 500) {
            console.error('Failed to upload community content image', error);
            return c.json(
                {
                    error: '制作人社区图片上传失败',
                } satisfies CommunityContentMutationErrorResponse,
                500,
            );
        }
        return c.json(
            {
                error: messageFromError(error),
            } satisfies CommunityContentMutationErrorResponse,
            400,
        );
    }
}
