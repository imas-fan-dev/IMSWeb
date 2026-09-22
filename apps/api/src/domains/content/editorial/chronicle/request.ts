import type { EditorialChronicleCursor } from '@/ports/repositories';

export const CHRONICLE_SOURCE_TYPES = ['official', 'community'] as const;
export const CHRONICLE_DATE_PRECISIONS = ['year', 'month', 'day'] as const;

export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

export function encodeChronicleCursor(row: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify({
        occurredOn: row.occurred_on,
        timelineOrder: Number(row.timeline_order || 0),
        articleId: String(row.article_id)
    })).toString('base64url');
}

export function decodeChronicleCursor(
    value: string | undefined
): EditorialChronicleCursor | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(
            Buffer.from(value, 'base64url').toString('utf8')
        ) as Record<string, unknown>;
        if (typeof parsed.occurredOn !== 'string' || !Number.isInteger(parsed.timelineOrder) ||
            typeof parsed.articleId !== 'string') return null;
        return {
            occurredOn: parsed.occurredOn,
            timelineOrder: parsed.timelineOrder as number,
            articleId: parsed.articleId
        };
    } catch {
        return null;
    }
}
