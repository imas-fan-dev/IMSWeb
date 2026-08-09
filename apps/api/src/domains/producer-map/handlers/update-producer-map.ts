import type { AppEnvironment } from '@/app';
import { saveProducerMapContent } from '@/domains/producer-map/content-store';
import type { ProducerMapUpdateRequest } from '@/domains/producer-map/data';
import type {
    ProducerMapMutationErrorResponse,
    ProducerMapUpdateSuccessResponse
} from '@/domains/producer-map/response';
import { writeAudit } from '@/domains/audit/hono-service';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateProducerMap(
    c: ValidatedRequestContext<AppEnvironment, 'json', ProducerMapUpdateRequest>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const payload = c.req.valid('json');
        const result = await saveProducerMapContent(storage, payload.content, payload.revision);
        await writeAudit(c, '更新制作人地图', result.content.title);
        return c.json({
            success: true,
            ...result
        } satisfies ProducerMapUpdateSuccessResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update producer map', error);
        return c.json({
            error: status >= 500 ? '制作人地图保存失败' : messageFromError(error)
        } satisfies ProducerMapMutationErrorResponse, status as 400 | 409 | 500);
    }
}
