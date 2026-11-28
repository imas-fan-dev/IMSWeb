import type { PrivacyPolicyErrorResponse } from '@imsweb/contracts/privacy-policy';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { savePrivacyPolicyContent } from '@/domains/content/privacy-policy/content-store';
import type { AdminPrivacyPolicyUpdateRequest } from '@/domains/content/privacy-policy/request';
import type { PrivacyPolicyUpdateSuccessResponse } from '@/domains/content/privacy-policy/response';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateAdminPrivacyPolicy(
    c: ValidatedRequestContext<AppEnvironment, 'json', AdminPrivacyPolicyUpdateRequest>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const payload = c.req.valid('json');
        const result = await savePrivacyPolicyContent(storage, payload.content, payload.revision);
        await writeAudit(c, '更新隐私条款', result.content.title);
        return c.json({
            success: true,
            ...result
        } satisfies PrivacyPolicyUpdateSuccessResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update privacy policy', error);
        return c.json({
            error: status >= 500 ? '隐私条款保存失败' : messageFromError(error)
        } satisfies PrivacyPolicyErrorResponse, status as 400 | 409 | 500);
    }
}
