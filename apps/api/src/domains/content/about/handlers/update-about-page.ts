import type { AppEnvironment } from '@/app';
import type { AboutPageUpdateRequest } from '@/domains/content/about/request';
import type {
    AboutMutationErrorResponse,
    AboutUpdateSuccessResponse
} from '@/domains/content/about/response';
import { saveAboutPageContent } from '@/domains/content/about/content-store';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateAboutPage(
    c: ValidatedRequestContext<AppEnvironment, 'json', AboutPageUpdateRequest>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const payload = c.req.valid('json');
        const result = await saveAboutPageContent(storage, payload.content, payload.revision);
        await writeAudit(c, '更新关于本站', result.content.siteName);
        return c.json({
            success: true,
            ...result
        } satisfies AboutUpdateSuccessResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update about page', error);
        return c.json({
            error: status >= 500 ? '关于页保存失败' : messageFromError(error)
        } satisfies AboutMutationErrorResponse, status as 400 | 409 | 500);
    }
}
