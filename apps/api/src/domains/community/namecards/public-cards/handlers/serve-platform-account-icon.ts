import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { PLATFORM_ICON_NOT_FOUND } from '@/domains/community/namecards/response';
import { objectReadResponse } from '@/utils/http/object-read-response';

/**
 * 平台图标是后台按平台上传的单张图，键名固定为
 * `platform/account-kinds/<id>/icon.<ext>`，对象存储的公开路径不可靠，
 * 这里直接按标识符流式返回。
 */
export async function handleServePlatformAccountIcon(
    c: ValidatedRequestContext<AppEnvironment, 'param', { id: string }>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const storage = services(c).storage;
    const repository = services(c).namecards;
    if (!storage || !repository) return c.text(PLATFORM_ICON_NOT_FOUND, 404);
    const kinds = await repository.listPlatformAccountKinds();
    const key = kinds.find((kind) => kind.id === id)?.icon_object_key;
    if (!key) return c.text(PLATFORM_ICON_NOT_FOUND, 404);
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        key,
        { 'Cache-Control': 'public, max-age=300' },
        { mode: 'proxy' }
    );
    return response ?? c.text(PLATFORM_ICON_NOT_FOUND, 404);
}
