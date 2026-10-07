import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '@/app';

interface RequestSchema<Output> {
    safeParse(value: unknown):
        | { success: true; data: Output }
        | { success: false; error: unknown };
}

type MapDeliveryRequestKind = 'activate' | 'delete' | 'source';

type MapDeliveryRequest = Record<string, unknown>;

function isRecord(value: unknown): value is MapDeliveryRequest {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
    body: MapDeliveryRequest,
    expected: readonly string[],
): boolean {
    const keys = Object.keys(body);
    return (
        keys.length === expected.length &&
        expected.every((key) => keys.includes(key))
    );
}

function sourceIdMessage(value: unknown): string | null {
    return typeof value !== 'string' ||
        value.length > 80 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
        ? '地图源 ID 格式无效'
        : null;
}

function invalidMessage(
    kind: MapDeliveryRequestKind,
    body: MapDeliveryRequest,
): string {
    if (kind === 'source') {
        if (!hasExactKeys(body, ['name', 'styleUrl', 'revision'])) {
            return '地图源请求格式无效';
        }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 80 || /[\0-\x1f\x7f]/.test(name)) {
            return '地图源名称格式无效';
        }
        if (typeof body.styleUrl !== 'string') {
            return '地图样式地址格式无效';
        }
        if (body.revision !== null && typeof body.revision !== 'string') {
            return '地图源 revision 格式无效';
        }
        return '地图样式地址格式无效';
    }
    if (kind === 'activate') {
        if (!hasExactKeys(body, ['sourceId', 'revision'])) {
            return '地图源激活请求格式无效';
        }
        const sourceMessage = sourceIdMessage(body.sourceId);
        if (sourceMessage) return sourceMessage;
        return body.revision !== null && typeof body.revision !== 'string'
            ? '地图源 revision 格式无效'
            : '地图源激活请求格式无效';
    }
    if (!hasExactKeys(body, ['revision'])) {
        return '地图源删除请求格式无效';
    }
    return body.revision !== null && typeof body.revision !== 'string'
        ? '地图源 revision 格式无效'
        : '地图源删除请求格式无效';
}

export function mapDeliveryJsonSchemaValidator<Output>(
    schema: RequestSchema<Output>,
    kind: MapDeliveryRequestKind,
): MiddlewareHandler<AppEnvironment> {
    return async (context, next) => {
        let body: unknown;
        try {
            body = await context.req.json();
        } catch {
            return context.json({ error: '请求正文必须为 JSON' }, 422);
        }
        if (!isRecord(body)) {
            return context.json({ error: '请求正文必须为 JSON 对象' }, 422);
        }
        const result = schema.safeParse(body);
        if (!result.success) {
            return context.json({ error: invalidMessage(kind, body) }, 422);
        }
        context.req.addValidatedData('json', result.data as {});
        return next();
    };
}

export function mapDeliveryParamSchemaValidator<Output>(
    schema: RequestSchema<Output>,
): MiddlewareHandler<AppEnvironment> {
    return async (context, next) => {
        const result = schema.safeParse(context.req.param());
        if (!result.success) {
            return context.json({ error: '地图源 ID 格式无效' }, 422);
        }
        context.req.addValidatedData('param', result.data as {});
        return next();
    };
}
