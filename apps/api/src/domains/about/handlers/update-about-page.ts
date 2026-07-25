import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { saveAboutPageContent } from '@/domains/about/content-store';
import { writeAudit } from '@/domains/audit/hono-service';
import { services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

interface UpdatePayload {
    content: unknown;
    revision: string | null;
}

function updatePayload(value: unknown): UpdatePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('关于页配置格式无效'), { status: 400 });
    }
    const payload = value as Record<string, unknown>;
    if (payload.revision !== null && typeof payload.revision !== 'string') {
        throw Object.assign(new Error('关于页配置版本无效'), { status: 400 });
    }
    return { content: payload.content, revision: payload.revision } as UpdatePayload;
}

export async function handleUpdateAboutPage(c: Context<AppEnvironment>): Promise<Response> {
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
