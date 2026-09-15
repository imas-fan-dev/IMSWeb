import type { Context } from 'hono';
import type { EditorialStatusResult } from '@/ports/repositories';
import { services } from '@/middleware/hono-context';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

type EditorialStorage = NonNullable<ReturnType<typeof services>['storage']>;

/** 发布门槛：正文里至少要有一段可见文字或一张图片。 */
export function documentHasPublicContent(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(documentHasPublicContent);
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (record.type === 'image') return true;
    if (record.type === 'text' && typeof record.text === 'string' && record.text.trim()) return true;
    return Object.values(record).some(documentHasPublicContent);
}

export function statusResponse(
    result: Pick<EditorialStatusResult, 'status' | 'revision'>,
    c: Context
): Response | null {
    if (result.status === 'not-found') return c.json({ error: '内容不存在' }, 404);
    if (result.status === 'conflict') {
        return c.json({ error: '内容已被其他操作更新', revision: result.revision }, 409);
    }
    return null;
}

export async function publicArticleResponse(
    row: Record<string, unknown>,
    storage?: EditorialStorage
): Promise<Record<string, unknown>> {
    const result = { ...row };
    if (storage && typeof result.image_url === 'string') {
        result.image_url = await resolvePublicMediaUrl(storage, result.image_url);
    }
    return result;
}
