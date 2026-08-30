import { fudabaMapDeliveryUpdateSchema } from '@imsweb/contracts/fudaba/map-delivery';
import type { FudabaMapDeliveryUpdate } from '@imsweb/contracts/fudaba/map-delivery';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

function unprocessable(message: string): never {
    throw Object.assign(new Error(message), { status: 422 });
}

/**
 * Stage one of the two-stage rejection: request shape. A prefix that is
 * well-formed but outside the deployment allowlist passes here and is
 * rejected by the store, because a schema cannot express deployment data.
 */
export async function parseFudabaMapDeliveryUpdateRequest(
    c: Context<AppEnvironment>
): Promise<FudabaMapDeliveryUpdate> {
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        unprocessable('请求正文必须为 JSON');
    }
    const parsed = fudabaMapDeliveryUpdateSchema.safeParse(body);
    if (!parsed.success) unprocessable('地图分发前缀请求格式无效');
    return parsed.data;
}
