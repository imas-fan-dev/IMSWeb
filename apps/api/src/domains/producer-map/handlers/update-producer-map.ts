import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { saveProducerMapContent } from '@/domains/producer-map/content-store';
import { writeAudit } from '@/domains/audit/hono-service';
import { services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

interface UpdatePayload {
    content: unknown;
    revision: string | null;
}

function updatePayload(value: unknown): UpdatePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('制作人地图配置格式无效'), { status: 400 });
    }
    const payload = value as Record<string, unknown>;
    if (payload.revision !== null && typeof payload.revision !== 'string') {
        throw Object.assign(new Error('制作人地图配置版本无效'), { status: 400 });
    }
    return { content: payload.content, revision: payload.revision };
}

export async function handleUpdateProducerMap(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            throw Object.assign(new Error('请求正文必须为 JSON'), { status: 400 });
        }
        const payload = updatePayload(body);
        const result = await saveProducerMapContent(storage, payload.content, payload.revision);
        await writeAudit(c, '更新制作人地图', result.content.title);
        return c.json({ success: true, ...result });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update producer map', error);
        return c.json({
            error: status >= 500 ? '制作人地图保存失败' : messageFromError(error)
        }, status as 400 | 409 | 500);
    }
}
