import type { AppEnvironment } from '@/app';
import { authorizePrivate } from '@/domains/delivery/media/media-access';
import type { NamecardMediaRequest } from '@/domains/delivery/media/request';
import {
    MEDIA_NOT_FOUND_RESPONSE,
    mediaObjectReadResponse,
    mediaTextResponse
} from '@/domains/delivery/media/response';
import { preferThumbnail } from '@/domains/community/namecards/public-cards/handlers/serve-card-media';
import { namecardRepository, services } from '@/middleware/hono-context';
import { namecardMediaObjectKeys } from '@/utils/storage/business-object-keys';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

/** 旧上传路径的小图在同级 `thumbnail/` 目录下，文件名后缀追加 `.jpg`。 */
async function preferLegacyNamecardThumbnail(
    storage: { exists(key: string): Promise<boolean> },
    url: string,
    key: string
): Promise<string> {
    try {
        const [, thumbnailKey] = namecardMediaObjectKeys(url);
        return (await storage.exists(thumbnailKey)) ? thumbnailKey : key;
    } catch {
        return preferThumbnail(storage, key);
    }
}

export async function handleServeNamecard(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        NamecardMediaRequest & { thumb?: '1' | undefined }
    >
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const { url, key } = c.req.valid('param');
    const card = await namecardRepository(c).findCardByMediaUrl(url);
    const isPrivate = card?.status !== 'approved';
    if (isPrivate) {
        const failure = await authorizePrivate(c);
        if (failure) return failure;
    }
    // 列表与预览只要小图。旧上传路径的小图在 `.../thumbnail/<file>.jpg`，
    // 不是 fudaba 那套同目录 `thumbnail.jpg`，所以两套写法都要认，缺失再回退原图。
    const served =
        c.req.valid('query').thumb === '1'
            ? await preferLegacyNamecardThumbnail(runtime.storage, url, key)
            : key;
    const response = await mediaObjectReadResponse(
        c.req.raw,
        runtime.storage,
        { key: served, visibility: isPrivate ? 'private' : 'public' }
    );
    return response ?? mediaTextResponse(c, MEDIA_NOT_FOUND_RESPONSE);
}
