import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { NamecardTagSetRequest } from '@imsweb/contracts/namecards';
import {
    type NamecardTagErrorResponse,
    type NamecardTagSetResponse
} from '@/domains/community/namecards/response';
import { namecardTagRepository } from '@/middleware/hono-context';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

type TagReplaceContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', { cardId: string }> &
        ValidatedRequestInput<'json', NamecardTagSetRequest>
>;

/**
 * 名片墙 / 详情窗的内联标签保存：登录用户可改任意名片的标签，匿名只读。
 * 整组替换，即时生效，不进入名片内容的待审载荷。
 */
export async function handleReplaceNamecardTags(
    c: TagReplaceContext
): Promise<Response> {
    try {
        const { cardId } = c.req.valid('param');
        const { tags } = c.req.valid('json');
        const saved = await namecardTagRepository(c).replace({
            cardId,
            names: tags,
        });
        return c.json({ tags: saved } satisfies NamecardTagSetResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to replace namecard tags', error);
        return c.json(
            {
                success: false,
                code: 'NAMECARD_TAG_INVALID',
                message:
                    status >= 500 ? '标签保存失败' : messageFromError(error)
            } satisfies NamecardTagErrorResponse,
            status as 400 | 404 | 500
        );
    }
}
