import type { AdminCatalogProfileImageParams } from '@imsweb/contracts/catalog';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { catalogRepository, services } from '@/middleware/hono-context';
import { catalogError } from '@/domains/admin/catalog/response';
import { objectReadResponse } from '@/utils/http/object-read-response';

export async function handleServeAdminCatalogProfileImage(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminCatalogProfileImageParams>,
): Promise<Response> {
    try {
        const { kind, id } = c.req.valid('param');
        const profile = await catalogRepository(c).findProfile(kind, id);
        const storage = services(c).storage;
        const response = profile?.imageObjectKey && storage ? await objectReadResponse(
            c.req.raw, storage, profile.imageObjectKey,
            { 'Cache-Control': 'private, no-store' }, { mode: 'proxy' },
        ) : null;
        return response ?? c.json({ success: false, message: '图片不存在' } satisfies FailureMessageResponse, 404);
    } catch (error) { return catalogError(c, error); }
}
