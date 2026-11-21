import type { AppEnvironment } from '@/app';
import type { NamecardTagSuggestResponse } from '@/domains/community/namecards/response';
import { namecardTagRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

/**
 * 标签候选只返回预设标签（名称/别名包含，前缀优先）。自由标签由用户输入的
 * 原文直接创建，不进候选。
 */
export async function handleSuggestNamecardTags(
    c: ValidatedRequestContext<
        AppEnvironment,
        'query',
        { q?: string; limit: number }
    >
): Promise<Response> {
    try {
        const { q, limit } = c.req.valid('query');
        const { presets } = await namecardTagRepository(c).suggest({
            q: q ?? '',
            limit
        });
        return c.json({ presets } satisfies NamecardTagSuggestResponse);
    } catch (error) {
        console.error('Failed to suggest namecard tags', error);
        return c.json({ presets: [] } satisfies NamecardTagSuggestResponse, 500);
    }
}
