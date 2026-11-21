import type { AppEnvironment } from '@/app';
import type { NamecardTagValidateResponse } from '@/domains/community/namecards/response';
import { namecardTagRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

/**
 * 标签提交前自检：只返回被屏蔽词命中的原文，不暴露规则本身。
 * 编辑器用它即时拦掉被屏蔽的标签，保存时服务端仍会再校验一次。
 */
export async function handleValidateNamecardTags(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        { names: string[] }
    >
): Promise<Response> {
    const { names } = c.req.valid('json');
    const blocked = await namecardTagRepository(c).blockedNames(names);
    return c.json({ blocked } satisfies NamecardTagValidateResponse);
}
