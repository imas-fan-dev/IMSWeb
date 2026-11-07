import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { isCardPageObjectKey } from '@/utils/storage/business-object-keys';
import { readSizedCardPage } from '@/domains/community/fudaba/cards/artwork-store';

/**
 * Serves one page of a published card's artwork. Middle pages are stored under
 * the editor's object layout, which has no reversible public path, so the wall
 * addresses them by card number instead.
 */
export async function handleServePublicCardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        { id: number; side: string } & {
            w?: '160' | '400' | '800' | '1400' | undefined;
        }
    >
): Promise<Response> {
    const { id, side } = c.req.valid('param');
    const { w } = c.req.valid('query');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const repository = namecardRepository(c);
    // 统一布局优先：页面行存在就按新路径取；未迁移的卡回落到旧 key。
    const key =
        (await repository.findPublishedCardPageKey(id, side)) ??
        (await repository.findPublishedCardMediaKey(id, side));
    if (!key) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    if (w) {
        const sized = await readSizedCardPage(
            { storage, images: services(c).images },
            { key, width: Number(w) }
        );
        if (!sized) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
        const bytes = sized.body.slice();
        return c.body(bytes.buffer as ArrayBuffer, 200, {
            'Content-Type': sized.contentType,
            // 版本化地址不会变，可以长期缓存；旧 key 可能被审核覆写，只缓存 5 分钟。
            'Cache-Control': isCardPageObjectKey(key)
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=300'
        });
    }
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        key,
        { 'Cache-Control': 'public, max-age=300' },
        { mode: 'redirect' }
    );
    return response ?? c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
}
