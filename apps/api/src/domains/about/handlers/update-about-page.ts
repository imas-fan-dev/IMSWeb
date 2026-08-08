import type { AppEnvironment } from '@/app';
import { saveAboutPageContent } from '@/domains/about/content-store';
import { writeAudit } from '@/domains/audit/hono-service';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import type { RevisionedContentRequest } from '@/utils/validation/request-data';

export async function handleUpdateAboutPage(
    c: ValidatedRequestContext<AppEnvironment, 'json', RevisionedContentRequest>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const payload = c.req.valid('json');
        const result = await saveAboutPageContent(storage, payload.content, payload.revision);
        await writeAudit(c, '更新关于本站', result.content.siteName);
        return c.json({ success: true, ...result });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update about page', error);
        return c.json({
            error: status >= 500 ? '关于页保存失败' : messageFromError(error)
        }, status as 400 | 409 | 500);
    }
}
